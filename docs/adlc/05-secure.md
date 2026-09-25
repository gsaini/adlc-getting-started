# Phase 5 — Secure: assume the code was written by a stranger

**Goal:** catch the security problems AI-written code is prone to — plausible-looking injection, missing validation, over-broad permissions, leaked secrets — before they merge.

## Layers

| Layer | Tool | Where |
|-------|------|-------|
| Secrets in history | gitleaks (full history) | [`security.yml`](../../.github/workflows/security.yml) |
| Code patterns (injection, unsafe APIs) | CodeQL `security-extended` | `security.yml` — free for public repos |
| Vulnerable dependencies | `pnpm audit --audit-level high`, weekly | `security.yml` |
| New dependencies in a PR | GitHub dependency review | `security.yml` (PRs) |
| Supply chain at install | pnpm 11: build scripts blocked, packages < 1 day old refused | [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) |
| Judgment | `security-reviewer` agent (read-only) | `.claude/agents/security-reviewer.md` |
| The agent itself | deny rules on `.env`/`.dev.vars`; Bash guard hook | `.claude/` |

## What the reviewer looks for in this stack

- Every D1 query uses bound parameters (`.bind()`); no SQL built from strings.
- Every request body validated at the edge; size-limited; no stack traces or SQL in error responses.
- What an unauthenticated caller can do — and whether the spec's non-goals really accept that.
- Anything that could burn the free plan's daily CPU, request, or D1 write budget.
- CI least privilege: `permissions:` blocks, secrets only in jobs that need them, and **no workflow inputs interpolated into shell commands** (the rollback workflow passes them through environment variables).

## Accepting a risk is a decision, not a shrug

`add-expense-groups` ships without rate limiting. That is written in `design.md` with the impact (the daily write budget can be exhausted), the owner (the repo owner), the reason, and the follow-up change required before real use. If you can't name an owner, the risk isn't accepted — it's ignored.

## Exit gate

No open critical/high findings; the Security workflow is green.
