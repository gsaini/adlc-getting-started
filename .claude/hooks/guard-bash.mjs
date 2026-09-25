#!/usr/bin/env node
// PreToolUse(Bash): a tripwire, not a sandbox. It blocks the obvious ways an agent
// could skip the lifecycle's human gates. The real controls are elsewhere: no
// Cloudflare credentials on the agent's machine, deploy secrets only in GitHub
// environments, and branch protection on `main` (see docs/adlc/00-prepare.md).
//
// It looks at what each part of a command actually *runs*, so a commit message or
// a file name that merely mentions "wrangler deploy" is not blocked.
import { readFileSync } from "node:fs";

function deny(reason) {
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

let command;
try {
	command = JSON.parse(readFileSync(0, "utf8")).tool_input?.command;
	if (typeof command !== "string") throw new Error("no command");
} catch {
	deny("could not read the command, so it is refused (this hook fails closed).");
}

// Undo cheap evasions first: line continuations, quotes, escapes, ${…}.
const flat = command
	.replace(/\\\r?\n/g, " ")
	.replace(/["'`\\]/g, "")
	.replace(/\$\{([^}]*)\}/g, "$1");

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const WRAPPERS = new Set([
	"env",
	"command",
	"builtin",
	"noglob",
	"nice",
	"nohup",
	"time",
	"stdbuf",
]);
// Ways to run a package binary: `pnpm exec wrangler`, `npx wrangler`, `pnpm wrangler`, …
const RUNNERS = [
	["pnpm", "exec"],
	["pnpm", "dlx"],
	["yarn", "dlx"],
	["yarn"],
	["npx"],
	["bunx"],
	["pnpm"],
];

/** The program a pipeline stage runs, and its arguments. */
function program(stage) {
	let words = stage.trim().split(/\s+/).filter(Boolean);
	// Skip leading VAR=value assignments and wrappers like `timeout 30` or `env`.
	for (;;) {
		const [first = ""] = words;
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first) || WRAPPERS.has(first)) words = words.slice(1);
		else if (first === "timeout") words = words.slice(2);
		else break;
	}
	for (const runner of RUNNERS) {
		const matches = runner.every((w, i) => words[i] === w);
		// A bare `pnpm <x>` only counts as running a binary when <x> is wrangler.
		const bare = runner.length === 1 && runner[0] !== "npx" && runner[0] !== "bunx";
		if (matches && (!bare || words[1] === "wrangler")) {
			words = words.slice(runner.length);
			break;
		}
	}
	const name = (words[0] ?? "").split("/").pop() ?? "";
	return { name, args: words.slice(1) };
}

// Paths that hold credentials. The project's own `.wrangler/state` (local dev data) is fine.
const CREDENTIALS =
	/(^|[\s=:])(\.\/)?\.env(\.[\w-]+)*($|[\s;|&)])|\.dev\.vars\b|(~|\$HOME|\/Users\/[^/\s]+|\/home\/[^/\s]+)\/\.wrangler\b|\.config\/\.wrangler\b|Preferences\/\.wrangler\b|\.cloudflared\b/;

for (const commandPart of flat.split(/&&|\|\||;|\n/)) {
	commandPart.split("|").forEach((stage, index) => {
		const { name, args } = program(stage);
		if (!name) return;
		const [sub = "", sub2 = ""] = args;

		if (name === "wrangler") {
			if (sub === "deploy" || sub === "rollback")
				deny("Deploys and rollbacks run in CI after human approval.");
			if (sub === "versions" && (sub2 === "deploy" || sub2 === "upload"))
				deny("Version rollouts run in CI.");
			if (sub === "d1" && args.includes("--remote")) deny("Remote D1 is off-limits; use --local.");
			if (sub === "secret" || sub === "login")
				deny("Credentials and secrets are managed by humans.");
		}
		if (name === "pnpm" && (sub === "deploy" || (sub === "run" && sub2 === "deploy"))) {
			deny("Deploys run in CI after human approval.");
		}
		if (SHELLS.has(name) && (args.includes("-c") || index > 0)) {
			deny("No `sh -c` and no piping into a shell: run commands directly so they can be checked.");
		}
		if (name === "eval") deny("No `eval`: run commands directly so they can be checked.");
		if (name === "git") {
			if (sub === "push") {
				const rest = args.slice(1);
				const force = (w) =>
					/^(--force(-with-lease)?(=.*)?|-f|--mirror|--delete|-d)$/.test(w) || w.startsWith("+");
				if (rest.some(force)) deny("Never force-push or delete remote branches.");
				if (rest.some((w) => /^\+?([^:]*:)?(refs\/heads\/)?main$/.test(w))) {
					deny("Never push to main; open a pull request.");
				}
			}
			if (args.includes("--no-verify")) deny("Never skip hooks.");
			// Commit messages and history are text, not commands.
			if (["commit", "log", "show", "diff"].includes(sub)) return;
		}
		if (/api\.cloudflare\.com/.test(stage)) deny("The Cloudflare API is for CI only.");
		if (CREDENTIALS.test(stage)) deny("Credential and secret files are off-limits.");
		if (args.includes("--no-verify")) deny("Never skip hooks.");
	});
}
process.exit(0);
