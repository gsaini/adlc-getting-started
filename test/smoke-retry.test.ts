// Change smoke-health-retry — spec: deploy-smoke-check.
import { describe, expect, it } from "vitest";
import {
	HealthCheckError,
	type HttpResult,
	parseBase,
	runSmoke,
	waitForHealthy,
} from "../scripts/lib/smoke.mjs";

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

	it("treats an attempt that runs into the deadline as the final attempt", async () => {
		const clock = fakeClock();
		const steps: Array<HttpResult | "hang"> = Array(8).fill({ status: 503, json: null });
		const { probe, startedAt } = scriptedProbe(clock, [...steps, "hang"], OK);

		const failure = await waitForHealthy({ probe, ...clock }).catch((e: unknown) => e);
		// Attempt 9 starts at 27.5 s and uses its whole 2.5 s budget, ending at the deadline.
		expect(startedAt).toHaveLength(9);
		expect((failure as HealthCheckError).attempts).toBe(9);
	});

	it("logs a thrown value that is not an Error", async () => {
		const clock = fakeClock();
		const probe = async (): Promise<HttpResult> => {
			if (clock.now() === 0) throw "socket closed";
			return OK;
		};

		await expect(waitForHealthy({ probe, ...clock })).resolves.toEqual(OK);
		expect(clock.lines).toEqual(["health attempt 1: error socket closed, retrying in 500 ms"]);
	});
});

describe("parseBase", () => {
	it.each([
		"",
		"not a url",
		"localhost:8787",
		"ftp://example.com",
		"https://example.com?x=1",
		"https://example.com/#top",
	])("Invalid base URL fails immediately: %j", (arg) => {
		const result = parseBase(arg);
		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.message).toContain(`Invalid base URL: ${JSON.stringify(arg)}`);
	});

	it("rejects credentials in the URL without echoing them", () => {
		const result = parseBase("https://user:s3cret@example.com");
		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.message).not.toContain("s3cret");
	});

	it("accepts http(s) URLs and drops a trailing slash", () => {
		expect(parseBase("http://localhost:8787")).toEqual({ ok: true, base: "http://localhost:8787" });
		expect(parseBase("https://split.example.workers.dev/")).toEqual({
			ok: true,
			base: "https://split.example.workers.dev",
		});
	});
});

const BASE = "https://split-staging.example.workers.dev";

/** A fake API: answers from a route table and records every request made. */
function fakeApi(routes: Record<string, Array<HttpResult | Error>>) {
	const requests: string[] = [];
	const served: Record<string, number> = {};
	const call = async (method: string, path: string): Promise<HttpResult> => {
		const key = `${method} ${path.replace(/^\/groups\/[^/]+/, "/groups/:id")}`;
		requests.push(key);
		const answers = routes[key];
		if (!answers) throw new Error(`unexpected request ${key}`);
		const n = served[key] ?? 0;
		served[key] = n + 1;
		const answer = answers[Math.min(n, answers.length - 1)] as HttpResult | Error;
		if (answer instanceof Error) throw answer;
		return answer;
	};
	return { call, requests };
}

const HAPPY: Record<string, HttpResult[]> = {
	"GET /health": [OK],
	"POST /groups": [{ status: 201, json: { id: "g1" } }],
	"POST /groups/:id/expenses": [
		{ status: 201, json: { shares: [{ cents: 334 }, { cents: 333 }, { cents: 333 }] } },
	],
	"GET /groups/:id/balances": [
		{
			status: 200,
			json: { balances: [{ netCents: 666 }, { netCents: -333 }, { netCents: -333 }] },
		},
	],
};

describe("runSmoke", () => {
	it("runs the full flow once when everything is healthy", async () => {
		const clock = fakeClock();
		const api = fakeApi(HAPPY);

		await expect(
			runSmoke({ base: BASE, readOnly: false, call: api.call, ...clock }),
		).resolves.toEqual({
			ok: true,
		});
		expect(api.requests).toEqual([
			"GET /health",
			"POST /groups",
			"POST /groups/:id/expenses",
			"GET /groups/:id/balances",
		]);
	});

	it("Write-path failure is not retried", async () => {
		const clock = fakeClock();
		const api = fakeApi({ ...HAPPY, "POST /groups": [{ status: 500, json: null }] });

		const result = await runSmoke({ base: BASE, readOnly: false, call: api.call, ...clock });
		expect(result.ok).toBe(false);
		expect(api.requests).toEqual(["GET /health", "POST /groups"]);
	});

	it("Read-only mode stops after health", async () => {
		const clock = fakeClock();
		const api = fakeApi({ "GET /health": [{ status: 404, json: null }, OK] });

		await expect(
			runSmoke({ base: BASE, readOnly: true, call: api.call, ...clock }),
		).resolves.toEqual({
			ok: true,
		});
		expect(api.requests).toEqual(["GET /health", "GET /health"]);
	});

	it("Health never becomes ready: reports the URL, last status, and body", async () => {
		const clock = fakeClock();
		const api = fakeApi({ "GET /health": [{ status: 503, json: { error: "down" } }] });

		const result = await runSmoke({ base: BASE, readOnly: true, call: api.call, ...clock });
		expect(result.ok).toBe(false);
		const message = result.ok ? "" : result.message;
		expect(message).toContain(BASE);
		expect(message).toContain("status 503");
		expect(message).toContain('{"error":"down"}');
		expect(api.requests).toHaveLength(10);
	});

	it("Network errors throughout: reports the URL and the last error", async () => {
		const clock = fakeClock();
		const api = fakeApi({ "GET /health": [new TypeError("fetch failed")] });

		const result = await runSmoke({ base: BASE, readOnly: true, call: api.call, ...clock });
		expect(result.ok).toBe(false);
		const message = result.ok ? "" : result.message;
		expect(message).toContain(BASE);
		expect(message).toContain("error fetch failed");
	});

	it("cuts a long response body in the failure message", async () => {
		const clock = fakeClock();
		const api = fakeApi({ "GET /health": [{ status: 404, json: { page: "x".repeat(5000) } }] });

		const result = await runSmoke({ base: BASE, readOnly: true, call: api.call, ...clock });
		const message = result.ok ? "" : result.message;
		expect(message).toContain("…(truncated)");
		expect(message.length).toBeLessThan(800);
	});
});
