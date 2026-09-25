#!/usr/bin/env node
// Share your LOCAL build with a reviewer before anything is deployed, using a
// Cloudflare Quick Tunnel — free, no account, no domain, no open ports.
//
//   pnpm tunnel            start dev server + tunnel, print the public URL
//   pnpm tunnel --smoke    …and run the smoke test through the public URL
//
// The URL is public and unauthenticated while this runs. Use test data only.
import { spawn, spawnSync } from "node:child_process";

const PORT = 8787;
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

// 2. Quick Tunnel. cloudflared prints the public URL on stderr.
const tunnel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", local], {
	stdio: ["ignore", "ignore", "pipe"],
});
children.push(tunnel);
const publicUrl = await new Promise((resolve) => {
	const timer = setTimeout(() => resolve(null), 60_000);
	tunnel.stderr.on("data", (chunk) => {
		const match = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
		if (match) {
			clearTimeout(timer);
			resolve(match[0]);
		}
	});
});
if (!publicUrl || !(await waitFor(`${publicUrl}/health`, 60_000))) {
	console.error(
		"The Quick Tunnel did not come up. Check your network, or run cloudflared by hand.",
	);
	stop(1);
}

console.log(`
  Public URL: ${publicUrl}

  Anyone with this URL can reach your local API until you press Ctrl+C.
  Share it with a reviewer for acceptance testing, e.g.:
    node scripts/smoke.mjs ${publicUrl}
`);

if (process.argv.includes("--smoke")) {
	const smoke = spawnSync("node", ["scripts/smoke.mjs", publicUrl], { stdio: "inherit" });
	stop(smoke.status ?? 1);
}
