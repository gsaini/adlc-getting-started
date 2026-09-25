// Smoke-check logic, kept free of process/network globals so it can be tested.
// scripts/smoke.mjs wires in the real fetch, timers, and clock.

export class HealthCheckError extends Error {}

export async function waitForHealthy() {
	throw new Error("not implemented");
}

export async function runSmoke() {
	throw new Error("not implemented");
}
