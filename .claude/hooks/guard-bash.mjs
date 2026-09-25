#!/usr/bin/env node
// PreToolUse(Bash): block commands that bypass the lifecycle's human gates.
// Deploys, rollbacks, and remote-database commands only run in CI after approval.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const command = input.tool_input?.command ?? "";

const rules = [
	[
		/\bwrangler\b[^\n]*\b(deploy|rollback)\b/,
		"Deploys and rollbacks run in CI after human approval.",
	],
	[/\bwrangler\b[^\n]*\bversions\s+(deploy|upload)\b/, "Version uploads and rollouts run in CI."],
	[/\bwrangler\b[^\n]*\bd1\b[^\n]*--remote\b/, "Remote D1 is off-limits; use --local."],
	[/\bwrangler\b[^\n]*\bsecret\b/, "Secrets are managed by humans, not agents."],
	[/\bgit\b[^\n]*\bpush\b[^\n]*(--force|-f\b|--force-with-lease)/, "Never force-push."],
	[/\bpnpm\s+(run\s+)?deploy\b/, "Deploys run in CI after human approval."],
	[/--no-verify\b/, "Never skip hooks."],
	[/\bcurl\b[^\n]*\|\s*(ba|z)?sh\b/, "Never pipe downloads into a shell."],
];

// `git push … main` (or `…:main`) as an argument — but not a branch like `fix-main`.
const pushesMain = command.split(/&&|\|\||;|\n/).some((part) => {
	const words = part.trim().split(/\s+/);
	const at = words.indexOf("push");
	return words[0] === "git" && at > 0 && words.slice(at + 1).some((w) => /^(\S*:)?main$/.test(w));
});
if (pushesMain) rules.unshift([/[\s\S]*/, "Never push to main; open a pull request."]);

for (const [pattern, reason] of rules) {
	if (pattern.test(command)) {
		process.stdout.write(
			JSON.stringify({
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason: `Blocked by .claude/hooks/guard-bash.mjs: ${reason}`,
				},
			}),
		);
		process.exit(0);
	}
}
process.exit(0);
