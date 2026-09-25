#!/usr/bin/env node
// Stop: the definition of done. Claude may only finish when `pnpm verify` passes.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
// Already continuing because of this hook: let Claude stop rather than loop forever.
if (input.stop_hook_active) process.exit(0);

// Nothing changed in code, tests, migrations, or specs: nothing to verify.
const status = spawnSync(
	"git",
	["status", "--porcelain", "--", "src", "test", "migrations", "openspec"],
	{
		cwd: process.env.CLAUDE_PROJECT_DIR,
		encoding: "utf8",
	},
);
if (status.stdout.trim() === "") process.exit(0);

const verify = spawnSync("pnpm", ["verify"], {
	cwd: process.env.CLAUDE_PROJECT_DIR,
	encoding: "utf8",
});
if (verify.status !== 0) {
	const tail = `${verify.stdout}${verify.stderr}`.trim().split("\n").slice(-60).join("\n");
	process.stdout.write(
		JSON.stringify({
			decision: "block",
			reason: `\`pnpm verify\` failed, so the work is not done. Fix the cause (do not weaken tests or thresholds):\n${tail}`,
		}),
	);
}
process.exit(0);
