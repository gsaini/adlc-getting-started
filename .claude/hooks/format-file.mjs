#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit): format the file that was just changed and
// tell Claude about any lint problems Biome can't fix on its own.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = input.tool_input?.file_path ?? "";
if (!/\.(ts|mts|js|mjs|json|jsonc)$/.test(file)) process.exit(0);

const result = spawnSync(
	"pnpm",
	["exec", "biome", "check", "--write", "--no-errors-on-unmatched", file],
	{ cwd: process.env.CLAUDE_PROJECT_DIR, encoding: "utf8" },
);
if (result.status !== 0) {
	const output = `${result.stdout}${result.stderr}`.trim().split("\n").slice(-40).join("\n");
	process.stdout.write(
		JSON.stringify({ decision: "block", reason: `Biome found problems in ${file}:\n${output}` }),
	);
}
process.exit(0);
