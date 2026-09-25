#!/usr/bin/env node
// Share your LOCAL build with a reviewer before anything is deployed, using a
// Cloudflare Quick Tunnel — free, no account, no domain, no open ports.
//
//   pnpm tunnel                 start dev server + tunnel, print the public URL
//   pnpm tunnel --smoke         …and run the smoke test through the public URL
//   pnpm tunnel --minutes 60    stay up longer (default 30, then it shuts itself down)
//
// The URL is public and unauthenticated while this runs. Use test data only.
import { spawn, spawnSync } from "node:child_process";

const PORT = 8787;
const minutesFlag = process.argv.indexOf("--minutes");
const MINUTES = minutesFlag > 0 ? Number(process.argv[minutesFlag + 1]) : 30;
if (!Number.isFinite(MINUTES) || MINUTES <= 0 || MINUTES > 240) {
	console.error("--minutes must be between 1 and 240");
	process.exit(1);
}
const local = `http://localhost:${PORT}`;
const children = [];

function stop(code = 0) {
	for (const child of children) child.kill("SIGTERM");
	process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

if (spawnSync("cloudflared", ["--version"]).error) {
	console.error(`cloudflared is not installed.
  macOS:   brew install cloudflared
  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  Windows: winget install --id Cloudflare.cloudflared`);
	process.exit(1);
}

async function waitFor(url, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(url)).ok) return true;
		} catch {}
		await new Promise((r) => setTimeout(r, 1000));
	}
	return false;
}

// 1. Local database + dev server.
spawnSync("pnpm", ["db:migrate:local"], { stdio: "inherit" });
const dev = spawn("pnpm", ["exec", "wrangler", "dev", "--port", String(PORT)], { stdio: "ignore" });
children.push(dev);
if (!(await waitFor(`${local}/health`, 60_000))) {
	console.error("wrangler dev did not become healthy within 60 s");
	stop(1);
}
console.log(`Local API is up at ${local}`);

// 2. Quick Tunnel. cloudflared logs the public URL on stderr, then registers
// the connection with Cloudflare's edge a few seconds later.
const tunnel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", local], {
	stdio: ["ignore", "ignore", "pipe"],
});
children.push(tunnel);
let log = "";
tunnel.stderr.on("data", (chunk) => {
	log += chunk.toString();
});
async function until(predicate, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const value = predicate();
		if (value) return value;
		await new Promise((r) => setTimeout(r, 250));
	}
	return null;
}
const publicUrl = await until(
	() => log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0],
	60_000,
);
const registered =
	publicUrl && (await until(() => log.includes("Registered tunnel connection"), 60_000));
// Don't look the brand-new hostname up too early: a failed DNS lookup gets cached
// by the OS and would keep failing for minutes.
if (registered) await new Promise((r) => setTimeout(r, 5_000));
if (!registered || !(await waitFor(`${publicUrl}/health`, 90_000))) {
	console.error(
		"The Quick Tunnel did not come up. Check your network, or run cloudflared by hand.",
	);
	stop(1);
}

console.log(`
  Public URL: ${publicUrl}

  Anyone with this URL can reach your local API until you press Ctrl+C,
  or until it shuts itself down at ${new Date(Date.now() + MINUTES * 60_000).toLocaleTimeString()} (${MINUTES} min).
  Share it with a reviewer for acceptance testing, e.g.:
    node scripts/smoke.mjs ${publicUrl}
`);

// A forgotten terminal must not leave the API public: stop automatically.
setTimeout(() => {
	console.log(`\nTunnel closed after ${MINUTES} minutes.`);
	stop(0);
}, MINUTES * 60_000).unref?.();

if (process.argv.includes("--smoke")) {
	const smoke = spawnSync("node", ["scripts/smoke.mjs", publicUrl], { stdio: "inherit" });
	stop(smoke.status ?? 1);
}
