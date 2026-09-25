#!/usr/bin/env node
// End-to-end smoke test against any running copy of the API:
//   node scripts/smoke.mjs http://localhost:8787
//   node scripts/smoke.mjs https://<your-tunnel>.trycloudflare.com
//   node scripts/smoke.mjs https://adlc-getting-started-staging.<you>.workers.dev
// Creates one throwaway group, so point it only at dev, tunnel, or staging data.
// Add --read-only (as production does) to check health without writing anything.
const base = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
const readOnly = process.argv.includes("--read-only");

async function call(method, path, body) {
	const res = await fetch(`${base}${path}`, {
		method,
		headers: body ? { "content-type": "application/json" } : {},
		body: body ? JSON.stringify(body) : undefined,
	});
	const json = await res.json().catch(() => null);
	return { status: res.status, json };
}

function check(label, condition, detail) {
	if (!condition) {
		console.error(`✗ ${label}`, detail ?? "");
		process.exit(1);
	}
	console.log(`✓ ${label}`);
}

const health = await call("GET", "/health");
check("GET /health → 200", health.status === 200 && health.json?.status === "ok", health);

if (readOnly) {
	console.log(`\nRead-only smoke check passed against ${base}`);
	process.exit(0);
}

const group = await call("POST", "/groups", {
	name: "Smoke test",
	members: ["Asha", "Ben", "Chen"],
});
check("POST /groups → 201", group.status === 201 && group.json?.id, group);

const id = group.json.id;
const expense = await call("POST", `/groups/${id}/expenses`, {
	payer: "Asha",
	amountCents: 1000,
	description: "Smoke-test coffee",
});
const shares = expense.json?.shares?.map((s) => s.cents);
check(
	"POST expense → 201 with shares 334/333/333",
	expense.status === 201 && `${shares}` === "334,333,333",
	expense,
);

const balances = await call("GET", `/groups/${id}/balances`);
const sum = balances.json?.balances?.reduce((total, b) => total + b.netCents, 0);
check("GET balances → 200, summing to zero", balances.status === 200 && sum === 0, balances);

console.log(`\nAll smoke checks passed against ${base}`);
