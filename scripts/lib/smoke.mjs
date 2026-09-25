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

function healthFailure(base, error) {
	const { last, attempts } = error;
	const seen = "error" in last ? describe(last) : `${describe(last)} ${JSON.stringify(last.json)}`;
	return `✗ GET /health → 200 at ${base}: gave up after ${attempts} attempts, last saw ${seen}`;
}

// Only /health retries. Every later check runs once, so a real regression fails fast
// and a flaky write never creates duplicate throwaway groups.
export async function runSmoke({ base, readOnly, call, sleep, now, log }) {
	const fail = (label, detail) => ({ ok: false, message: `✗ ${label} ${JSON.stringify(detail)}` });

	try {
		await waitForHealthy({
			probe: (timeoutMs) => call("GET", "/health", undefined, timeoutMs),
			sleep,
			now,
			log,
		});
	} catch (error) {
		if (!(error instanceof HealthCheckError)) throw error;
		return { ok: false, message: healthFailure(base, error) };
	}
	log("✓ GET /health → 200");

	if (readOnly) {
		log(`\nRead-only smoke check passed against ${base}`);
		return { ok: true };
	}

	const group = await call("POST", "/groups", {
		name: "Smoke test",
		members: ["Asha", "Ben", "Chen"],
	});
	if (!(group.status === 201 && group.json?.id)) return fail("POST /groups → 201", group);
	log("✓ POST /groups → 201");

	const id = group.json.id;
	const expense = await call("POST", `/groups/${id}/expenses`, {
		payer: "Asha",
		amountCents: 1000,
		description: "Smoke-test coffee",
	});
	const shares = expense.json?.shares?.map((s) => s.cents);
	const label = "POST expense → 201 with shares 334/333/333";
	if (!(expense.status === 201 && `${shares}` === "334,333,333")) return fail(label, expense);
	log(`✓ ${label}`);

	const balances = await call("GET", `/groups/${id}/balances`);
	const sum = balances.json?.balances?.reduce((total, b) => total + b.netCents, 0);
	const balanceLabel = "GET balances → 200, summing to zero";
	if (!(balances.status === 200 && sum === 0)) return fail(balanceLabel, balances);
	log(`✓ ${balanceLabel}`);

	log(`\nAll smoke checks passed against ${base}`);
	return { ok: true };
}
