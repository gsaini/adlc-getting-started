# Phase 0 — Prepare: make the repo agent-ready

**Goal:** before any feature work, build the rails the agent runs on. Done once, improved after every retro.

## What to set up

| Rail | File | What it does |
|------|------|--------------|
| Project memory | [`CLAUDE.md`](../../CLAUDE.md) | The one rule (no code without an approved change), commands, project rules, and a **Never** list. Short on purpose — every line is loaded into every session. |
| Permissions | [`.claude/settings.json`](../../.claude/settings.json) | `allow` for the safe inner loop (tests, lint, OpenSpec), `ask` for anything that changes dependencies or pushes, `deny` for secrets (`.env`, `.dev.vars`) and destructive commands. |
| Bash guard hook | [`.claude/hooks/guard-bash.mjs`](../../.claude/hooks/guard-bash.mjs) | `PreToolUse` on Bash. Denies deploys, rollbacks, remote D1, `wrangler login`/`secret`, the Cloudflare API, credential files, `sh -c`/`eval`, force-push (incl. `+refspec`), pushing to `main`, `--no-verify`, and `curl \| sh` — with the reason shown to the agent. Normalizes quotes and line continuations first, and fails closed. |
| Format hook | [`.claude/hooks/format-file.mjs`](../../.claude/hooks/format-file.mjs) | `PostToolUse` on Edit/Write. Runs Biome on the changed file and feeds unfixable problems back to the agent immediately. |
| Definition of done | [`.claude/hooks/verify-on-stop.mjs`](../../.claude/hooks/verify-on-stop.mjs) | `Stop`. Unless every change is documentation, the agent can't finish until `pnpm verify` passes. Checks `stop_hook_active` so it can't loop forever. |
| Protected files | `.claude/settings.json` `deny`/`ask` + [`.github/CODEOWNERS`](../../.github/CODEOWNERS) | The agent **cannot** edit `.claude/**` (its own guardrails). Editing `package.json`, test/lint/type config, `wrangler.jsonc`, `scripts/**`, `.github/**`, or `CLAUDE.md` needs a human "yes" — they all change what `pnpm verify` or CI actually runs. |
| Reviewers | [`.claude/agents/`](../../.claude/agents/) | `spec-reviewer`, `code-reviewer`, `security-reviewer` — read-only, so they can report but never "fix" their way to a pass. |
| Spec workflow | [`openspec/`](../../openspec/) + `.claude/commands/opsx/` | OpenSpec 1.13: `/opsx:propose`, `/opsx:apply`, `/opsx:archive`, and friends. [`openspec/config.yaml`](../../openspec/config.yaml) gives every artifact the project context and rules. |
| CI gates | [`.github/workflows/`](../../.github/workflows/) | The same `pnpm verify` the Stop hook runs, plus security scans, an opt-in Claude review, and a staged deploy. |

## Design notes

- **Prompts are advice; hooks are law.** "Never deploy" in `CLAUDE.md` tells the agent the rule. `guard-bash.mjs` makes breaking it impossible. Keep both: the prompt avoids wasted attempts, the hook catches the rest.
- **Deny beats allow.** A broad deny like `Bash(rm -rf *)` wins over any narrower allow — Claude Code evaluates deny, then ask, then allow.
- **Keep the allowlist to the inner loop.** Anything that reaches outside the repo (network, deploys, dependency changes) stays at `ask` or `deny`.
- **Pin the supply chain.** pnpm 11 blocks dependency build scripts by default ([`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) allows exactly three) and refuses packages published less than a day ago. We pinned Wrangler to a mature release rather than add exceptions.

## Tripwires versus controls

The security review of this repo's first change made one point very concrete: **a hook is a tripwire, not a sandbox.** `guard-bash.mjs` catches the obvious routes (and some clever ones: quote-splitting, line continuations, `sh -c`), but it pattern-matches text, so something like `W=wrang; ${W}ler deploy` still gets past it. It also can't stop an agent from editing a script that an allow-listed command later runs — which is why those files are behind `ask`.

The **controls** — the things that hold even if every tripwire is bypassed — are about where credentials live:

| Control | Where |
|---------|-------|
| No Cloudflare credentials on the machine where agents run (`wrangler logout` after setup) | [Cloudflare setup](../cloudflare.md#one-time-setup), step 6 |
| Deploy credentials only as **environment** secrets, released after the environment's rules pass | [Cloudflare setup](../cloudflare.md#one-time-setup), step 5 |
| `staging` and `production` accept deployments from `main` only; `production` needs a reviewer | GitHub → Settings → Environments |
| `main` accepts changes only by reviewed pull request | GitHub → Settings → Rules (below) |

**Recommended branch ruleset for `main`:** require a pull request with 1 approval and *review from Code Owners*, require the `CI` and `Security` checks to pass, block force pushes and deletions. Then a change to the rails (`CODEOWNERS` paths) always needs your review — even when an agent wrote it.

## Exit gate

Hooks fire as expected (try asking the agent to `wrangler deploy` — it should be refused with the reason), and CI runs green.

## Anti-patterns

- A 400-line `CLAUDE.md` that restates the README. The agent reads it on every turn; keep it to rules and commands.
- `--dangerously-skip-permissions` "just for this change".
- Letting the agent edit `.claude/settings.json` or the hooks. Those are the rails; changes to them go through human review like any other security control.
