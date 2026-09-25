// Types for smoke.mjs, so the TypeScript tests can import it under strict mode.

export type Json = unknown;

export interface HttpResult {
	status: number;
	json: Json;
}

/** One request. `timeoutMs`, when given, aborts the request after that long. */
export type Call = (
	method: string,
	path: string,
	body?: unknown,
	timeoutMs?: number,
) => Promise<HttpResult>;

export interface Clock {
	sleep: (ms: number) => Promise<void>;
	now: () => number;
	log: (line: string) => void;
}

export interface WaitOptions extends Clock {
	/** Makes one health request that is aborted after `timeoutMs`. */
	probe: (timeoutMs: number) => Promise<HttpResult>;
	timeoutMs?: number;
	attemptTimeoutMs?: number;
}

/** The last thing seen before giving up: a response, or the error a request threw. */
export type LastObservation = HttpResult | { error: Error };

export class HealthCheckError extends Error {
	readonly last: LastObservation;
	readonly attempts: number;
}

/** Resolves with the first healthy response; rejects with HealthCheckError at the deadline. */
export function waitForHealthy(options: WaitOptions): Promise<HttpResult>;

export interface SmokeOptions extends Clock {
	base: string;
	readOnly: boolean;
	call: Call;
}

export type SmokeResult = { ok: true } | { ok: false; message: string };

/** Waits for /health, then runs every other check once. Never exits the process. */
export function runSmoke(options: SmokeOptions): Promise<SmokeResult>;
