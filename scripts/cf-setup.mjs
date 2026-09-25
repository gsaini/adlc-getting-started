#!/usr/bin/env node
// One-time setup: create the staging and production D1 databases on YOUR
// Cloudflare account (free plan) and write their IDs into wrangler.jsonc.
// Safe to re-run: existing databases are reused.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const wrangler = (...args) =>
	execFileSync("pnpm", ["exec", "wrangler", ...args], {
		encoding: "utf8",
		stdio: ["inherit", "pipe", "inherit"],
	});

const ENVIRONMENTS = [
	{ env: "staging", name: "adlc-staging", placeholder: "REPLACE_WITH_STAGING_D1_ID" },
	{ env: "production", name: "adlc-production", placeholder: "REPLACE_WITH_PRODUCTION_D1_ID" },
];

// Wrangler may be logged in to more than one account (or the wrong one). Make the human confirm.
console.log(wrangler("whoami"));
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question("Create the two D1 databases in the account shown above? [y/N] ");
rl.close();
if (answer.trim().toLowerCase() !== "y") {
	console.log(
		"Nothing created. Run `pnpm exec wrangler login` to switch accounts, then try again.",
	);
	process.exit(1);
}

const existing = () => JSON.parse(wrangler("d1", "list", "--json"));
let config = readFileSync("wrangler.jsonc", "utf8");

for (const { env, name, placeholder } of ENVIRONMENTS) {
	let db = existing().find((d) => d.name === name);
	if (!db) {
		console.log(`Creating D1 database ${name}…`);
		wrangler("d1", "create", name);
		db = existing().find((d) => d.name === name);
	}
	if (!db?.uuid) throw new Error(`Could not find the ID of D1 database ${name}`);
	config = config.replace(placeholder, db.uuid);
	console.log(`${env}: ${name} = ${db.uuid}`);
}

writeFileSync("wrangler.jsonc", config);
console.log(`
wrangler.jsonc now points at your databases. Next:
  1. Commit wrangler.jsonc (database IDs are not secrets).
  2. Create an API token: Cloudflare dashboard → My Profile → API Tokens → "Edit Cloudflare Workers"
     template, plus Account → D1 → Edit.
  3. Add GitHub repo secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
  4. Push to main: CI deploys to staging, then waits for approval before production.`);
