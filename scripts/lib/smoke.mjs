// Smoke-check logic, kept free of process/network globals so it can be tested.
// scripts/smoke.mjs wires in the real fetch, timers, and clock.

const FIRST_WAIT_MS = 500;
const MAX_WAIT_MS = 5_000;
// The last attempt starts at the deadline, so it would otherwise get no time at all.
const FINAL_ATTEMPT_MS = 1_000;

export class HealthCheckError extends Error {
	constructor(last, attempts) {
		super(`health check did not pass after ${attempts} attempts`);
		this.name = "HealthCheckError";
		this.last = last;
		this.attempts = attempts;
	}
}

const isHealthy = (res) => res.status === 200 && res.json?.status === "ok";

function describe(last) {
	return "error" in last ? `error ${last.error.message}` : `status ${last.status}`;
}

// A new workers.dev address can return 404 for a few seconds after its first
// deploy, so /health is retried with backoff until a fixed deadline.
export async function waitForHealthy({
	probe,
	sleep,
	now,
	log,
	timeoutMs = 30_000,
	attemptTimeoutMs = 5_000,
}) {
	const deadline = now() + timeoutMs;
	let wait = FIRST_WAIT_MS;
	for (let attempt = 1; ; attempt++) {
		const budget = Math.max(Math.min(attemptTimeoutMs, deadline - now()), FINAL_ATTEMPT_MS);
		let last;
		try {
			const res = await probe(budget);
			if (isHealthy(res)) return res;
			last = { status: res.status, json: res.json };
		} catch (error) {
			last = { error };
		}

		const remaining = deadline - now();
		if (remaining <= 0) throw new HealthCheckError(last, attempt);
		const ms = Math.min(wait, remaining);
		log(`health attempt ${attempt}: ${describe(last)}, retrying in ${ms} ms`);
		await sleep(ms);
		wait = Math.min(wait * 2, MAX_WAIT_MS);
	}
}

export async function runSmoke() {
	throw new Error("not implemented");
}
