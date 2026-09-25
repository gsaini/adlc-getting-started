#!/usr/bin/env node
// End-to-end smoke test against any running copy of the API:
//   node scripts/smoke.mjs http://localhost:8787
//   node scripts/smoke.mjs https://<your-tunnel>.trycloudflare.com
//   node scripts/smoke.mjs https://adlc-getting-started-staging.<you>.workers.dev
// Creates one throwaway group, so point it only at dev, tunnel, or staging data.
// Add --read-only (as production does) to check health without writing anything.
// /health is retried for up to ~30 s, since a first deploy to workers.dev can 404 briefly.
import { runSmoke } from "./lib/smoke.mjs";

const arg = process.argv[2] ?? "http://localhost:8787";
const readOnly = process.argv.includes("--read-only");

// A bad URL is a config mistake, not a slow deploy: fail before any request or wait.
let url;
try {
	url = new URL(arg);
} catch {}
if (url?.protocol !== "http:" && url?.protocol !== "https:") {
	console.error(`✗ Invalid base URL: ${JSON.stringify(arg)}`);
	process.exit(1);
}
const base = arg.replace(/\/$/, "");

async function call(method, path, body, timeoutMs) {
	const res = await fetch(`${base}${path}`, {
		method,
		headers: body ? { "content-type": "application/json" } : {},
		body: body ? JSON.stringify(body) : undefined,
		signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
	});
	const json = await res.json().catch(() => null);
	return { status: res.status, json };
}

const result = await runSmoke({
	base,
	readOnly,
	call,
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	now: Date.now,
	log: (line) => console.log(line),
});

if (!result.ok) {
	console.error(result.message);
	process.exit(1);
}
