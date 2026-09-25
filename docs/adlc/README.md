# The Agentic Development Lifecycle (ADLC)

> **ADLC here means building software *with* coding agents** — the classic SDLC, rebuilt for a world where an agent writes most of the code and humans own the decisions. (The same acronym is also used for the *Agent* Development Lifecycle — building and operating AI agents as products. That is a different topic.)

Code generation got cheap. What stayed expensive is knowing **what** to build, knowing **whether** what was built is right, and keeping the agent **inside safe bounds** while it works. The ADLC moves effort to exactly those three places:

1. **Intent is written down before code** — as a reviewed spec, not a chat message.
2. **Verification is independent of the author** — the agent that wrote the code never grades it.
3. **Guardrails are code, not prose** — permissions, hooks, and CI gates enforce the rules the agent is asked to follow.

## The loop

```text
          ┌───────────────────────── 7. Operate & learn ◄──────────────────────┐
          │   incidents, limits, retros → the next change                      │
          ▼                                                                    │
 0. Prepare ─► 1. Specify ─► 2. Plan ─► 3. Implement ─► 4. Verify ─► 5. Secure ─► 6. Release
 (once)        proposal +     design +    agent, test-     independent   scans +       staging →
               scenarios      tasks       first, hooked    reviewer + CI  review        approval → prod
                   ▲              ▲                                                 ▲         ▲
                   └── human ─────┘                                                 └ human ──┘
                     approves plan                                            approves PR & prod
```

## The phases

| # | Phase | The agent | The human | Artifact | Gate to leave the phase |
|---|-------|-----------|-----------|----------|-------------------------|
| 0 | [Prepare](00-prepare.md) | — | Sets up the rails once | `CLAUDE.md`, `.claude/`, CI | Hooks and CI run green on an empty change |
| 1 | [Specify](01-specify.md) | Drafts proposal and scenarios | States intent, answers questions | `proposal.md`, `specs/**/spec.md` | `openspec validate --strict` passes |
| 2 | [Plan](02-plan.md) | Drafts design and tasks; `spec-reviewer` critiques | **Approves the plan** | `design.md`, `tasks.md` | Reviewer verdict APPROVE + human approval |
| 3 | [Implement](03-implement.md) | Executes tasks test-first | Stays out of the loop | Code, tests, ticked `tasks.md` | Stop hook: `pnpm verify` green |
| 4 | [Verify](04-verify.md) | `code-reviewer` maps scenarios to tests | Reads the findings | `verification.md` | Every scenario has a test; findings resolved |
| 5 | [Secure](05-secure.md) | `security-reviewer` reviews | Accepts or rejects risks | `verification.md`, CI scans | No open critical/high findings |
| 6 | [Release](06-release.md) | Opens the PR | **Reviews the PR; approves production** | PR, deploys, archived change | Smoke tests pass in staging and production |
| 7 | [Operate & learn](07-operate.md) | Drafts the next change | Watches limits, runs rollbacks, holds the retro | Updated `CLAUDE.md`, new proposals | — (feeds phase 1) |

## Five principles

1. **Humans own the gates; agents do the work between them.** An agent never approves its own plan, merges its own PR, or deploys. Here that is enforced by a hook, not requested in a prompt.
2. **The verifier is never the implementer.** Review agents have no edit tools. CI runs the same gate for everyone.
3. **The spec is the source of truth.** Scenarios become tests; archived specs describe the system as built; the next change is a delta against them.
4. **Guardrails you can read in git.** Permissions, hooks, CI gates, and the approval environment are all files in this repo. If a rule isn't in a file, it isn't a rule.
5. **Everything leaves a trail.** Proposal, reviews, verification log, commits with `Co-Authored-By`, deploy approvals — anyone can reconstruct why the code is the way it is.

## Try a full change yourself

The repo ships with one change taken through every phase ([`add-expense-groups`](../../openspec/changes/add-expense-groups/) — its last step, archiving once your first staging deploy passes, is yours) and one waiting for you to build ([`add-settle-up`](../../openspec/changes/add-settle-up/)). In Claude Code:

```text
/opsx:apply add-settle-up          # phase 3 — the agent implements, test-first
> use the code-reviewer agent on add-settle-up        # phase 4
> use the security-reviewer agent on add-settle-up    # phase 5
pnpm tunnel --smoke                # phase 6 — acceptance test your local build through a Cloudflare Tunnel
# open a PR, review it, merge → staging → approve production
/opsx:archive add-settle-up        # the spec becomes the source of truth
```
