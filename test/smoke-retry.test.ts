// Change smoke-health-retry — spec: deploy-smoke-check.
import { describe, expect, it } from "vitest";
import { HealthCheckError, type HttpResult, waitForHealthy } from "../scripts/lib/smoke.mjs";

const OK: HttpResult = { status: 200, json: { status: "ok" } };

/** A fake clock: sleep() advances time instantly, and every call is recorded. */
function fakeClock() {
	let t = 0;
	const sleeps: number[] = [];
	const lines: string[] = [];
	return {
		sleeps,
		lines,
		now: () => t,
		advance: (ms: number) => {
			t += ms;
		},
		sleep: async (ms: number) => {
			sleeps.push(ms);
			t += ms;
		},
		log: (line: string) => {
			lines.push(line);
		},
	};
}

/** A probe that plays back one step per attempt and records when each attempt started. */
function scriptedProbe(
	clock: ReturnType<typeof fakeClock>,
	steps: Array<HttpResult | Error | "hang">,
	fallback: HttpResult | Error,
) {
	const startedAt: number[] = [];
	const timeouts: number[] = [];
	const probe = async (timeoutMs: number): Promise<HttpResult> => {
		startedAt.push(clock.now());
		timeouts.push(timeoutMs);
		const step = steps[startedAt.length - 1] ?? fallback;
		if (step === "hang") {
			clock.advance(timeoutMs);
			throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
		}
		if (step instanceof Error) throw step;
		return step;
	};
	return { probe, startedAt, timeouts };
}

describe("waitForHealthy", () => {
	it("Health is ready on the first attempt", async () => {
		const clock = fakeClock();
		const { probe, startedAt } = scriptedProbe(clock, [OK], OK);

		await expect(waitForHealthy({ probe, ...clock })).resolves.toEqual(OK);
		expect(startedAt).toEqual([0]);
		expect(clock.sleeps).toEqual([]);
		expect(clock.lines).toEqual([]);
	});

	it("New workers.dev address returns 404 at first", async () => {
		const clock = fakeClock();
		const notFound = { status: 404, json: null };
		const { probe, startedAt } = scriptedProbe(clock, [notFound, notFound, OK], OK);

		await expect(waitForHealthy({ probe, ...clock })).resolves.toEqual(OK);
		expect(startedAt).toHaveLength(3);
		expect(clock.sleeps).toEqual([500, 1000]);
		expect(clock.lines).toEqual([
			"health attempt 1: status 404, retrying in 500 ms",
			"health attempt 2: status 404, retrying in 1000 ms",
		]);
	});

	it("Network error while the address comes up", async () => {
		const clock = fakeClock();
		const { probe } = scriptedProbe(clock, [new TypeError("fetch failed"), OK], OK);

		await expect(waitForHealthy({ probe, ...clock })).resolves.toEqual(OK);
		expect(clock.lines).toEqual(["health attempt 1: error fetch failed, retrying in 500 ms"]);
	});

	it("200 with the wrong body is not healthy", async () => {
		const clock = fakeClock();
		const { probe } = scriptedProbe(clock, [{ status: 200, json: {} }, OK], OK);

		await expect(waitForHealthy({ probe, ...clock })).resolves.toEqual(OK);
		expect(clock.lines).toEqual(["health attempt 1: status 200, retrying in 500 ms"]);
	});

	it("A request that never responds is aborted", async () => {
		const clock = fakeClock();
		const { probe, startedAt, timeouts } = scriptedProbe(clock, ["hang", OK], OK);

		await expect(waitForHealthy({ probe, ...clock })).resolves.toEqual(OK);
		expect(timeouts[0]).toBe(5000);
		expect(startedAt).toEqual([0, 5500]);
		expect(clock.lines).toEqual([
			"health attempt 1: error The operation was aborted due to timeout, retrying in 500 ms",
		]);
	});

	it("Health never becomes ready", async () => {
		const clock = fakeClock();
		const unavailable = { status: 503, json: { error: "down" } };
		const { probe, startedAt } = scriptedProbe(clock, [], unavailable);

		const failure = await waitForHealthy({ probe, ...clock }).catch((e: unknown) => e);
		expect(failure).toBeInstanceOf(HealthCheckError);
		expect((failure as HealthCheckError).attempts).toBe(10);
		expect((failure as HealthCheckError).last).toEqual(unavailable);
		expect(startedAt).toEqual([0, 500, 1500, 3500, 7500, 12500, 17500, 22500, 27500, 30000]);
		expect(clock.sleeps).toEqual([500, 1000, 2000, 4000, 5000, 5000, 5000, 5000, 2500]);
	});

	it("Network errors throughout", async () => {
		const clock = fakeClock();
		const { probe, startedAt } = scriptedProbe(clock, [], new TypeError("fetch failed"));

		const failure = await waitForHealthy({ probe, ...clock }).catch((e: unknown) => e);
		expect(failure).toBeInstanceOf(HealthCheckError);
		expect(startedAt.at(-1)).toBe(30000);
		const last = (failure as HealthCheckError).last;
		expect("error" in last && last.error.message).toBe("fetch failed");
	});

	it("never gives an attempt more time than is left before the deadline", async () => {
		const clock = fakeClock();
		const { probe, timeouts } = scriptedProbe(clock, [], { status: 503, json: null });

		await waitForHealthy({ probe, ...clock }).catch(() => undefined);
		// Attempt 9 starts at 27.5 s with 2.5 s left; attempt 10 starts at the deadline
		// and gets the 1 s floor, so the whole check ends by about 31 s.
		expect(timeouts).toEqual([5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 2500, 1000]);
	});
});
