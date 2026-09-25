<div align="center">

# 🔁 ADLC — Getting Started

**The Agentic Development Lifecycle, end to end: build software *with* coding agents — spec → plan → implement → verify → secure → release → operate — with humans owning every gate. Runs on Cloudflare's free tier.**

[![CI](https://github.com/gsaini/adlc-getting-started/actions/workflows/ci.yml/badge.svg)](https://github.com/gsaini/adlc-getting-started/actions/workflows/ci.yml)
[![Security](https://github.com/gsaini/adlc-getting-started/actions/workflows/security.yml/badge.svg)](https://github.com/gsaini/adlc-getting-started/actions/workflows/security.yml)
![Claude Code](https://img.shields.io/badge/Claude%20Code-hooks%20·%20agents%20·%20skills-D97757?style=for-the-badge&logo=anthropic&logoColor=white)
![OpenSpec](https://img.shields.io/badge/OpenSpec-1.13-4F46E5?style=for-the-badge)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20·%20D1%20·%20Tunnel-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Free tier](https://img.shields.io/badge/Cost-%240%20(free%20tier)-16A34A?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-EAB308?style=for-the-badge)

</div>

---

## Why this exists

Coding agents made writing code cheap. What stayed expensive is knowing **what** to build, knowing **whether** what got built is right, and keeping the agent **inside safe bounds** while it works. The ADLC moves the effort to those three places:

1. **Intent is written down before code** — a reviewed spec with testable scenarios, not a chat message.
2. **Verification is independent of the author** — the agent that wrote the code never grades it.
3. **Guardrails are code, not prose** — permissions, hooks, CI gates, and deploy approvals enforce what `CLAUDE.md` asks for.

This repo is a working template of that process, not a diagram of it. A small real app went through every phase, and all the evidence is committed — including the parts that went wrong.

> *ADLC* here means building software **with** agents. The same acronym is also used for the *Agent* Development Lifecycle — building AI agents as products — which is a different topic.

## The loop

```text
 0. Prepare ─► 1. Specify ─► 2. Plan ─► 3. Implement ─► 4. Verify ─► 5. Secure ─► 6. Release ─► 7. Operate
 (once)        proposal +     design +    agent, test-     independent   scans +       tunnel → PR →      logs, limits,
               scenarios      tasks       first, hooked    reviewer + CI  review        staging → prod     rollback, retro
                   ▲              ▲                                                         ▲       ▲          │
                   └── human approves the plan ─┘                          human approves PR ┘       └ + prod   │
                   └──────────────────────────────── lessons become rules, next change ◄────────────────────────┘
```

| Phase | Guide | In this repo |
|-------|-------|--------------|
| 0. Prepare | [00-prepare](docs/adlc/00-prepare.md) | [`CLAUDE.md`](CLAUDE.md), [`.claude/settings.json`](.claude/settings.json), [hooks](.claude/hooks/), [reviewer agents](.claude/agents/), [CODEOWNERS](.github/CODEOWNERS) |
| 1. Specify | [01-specify](docs/adlc/01-specify.md) | [proposal](openspec/changes/add-expense-groups/proposal.md), [spec — 7 requirements, 34 scenarios](openspec/changes/add-expense-groups/specs/expense-groups/spec.md) |
| 2. Plan | [02-plan](docs/adlc/02-plan.md) | [design](openspec/changes/add-expense-groups/design.md), [tasks](openspec/changes/add-expense-groups/tasks.md) |
| 3. Implement | [03-implement](docs/adlc/03-implement.md) | [`src/`](src/), [`test/`](test/), [`migrations/`](migrations/) |
| 4. Verify | [04-verify](docs/adlc/04-verify.md) | [`ci.yml`](.github/workflows/ci.yml), [verification log](openspec/changes/add-expense-groups/verification.md) |
| 5. Secure | [05-secure](docs/adlc/05-secure.md) | [`security.yml`](.github/workflows/security.yml), same log |
| 6. Release | [06-release](docs/adlc/06-release.md) | [`pnpm tunnel`](scripts/tunnel.mjs), [`deploy.yml`](.github/workflows/deploy.yml), [PR template](.github/pull_request_template.md) |
| 7. Operate | [07-operate](docs/adlc/07-operate.md) | [`rollback.yml`](.github/workflows/rollback.yml), Workers Logs |

## The case study: what actually happened

The app is **Split**, a small expense-splitting API: groups, members, expenses split to the cent, balances, and a paged expense list. It runs on Cloudflare Workers with D1. Built by Claude Code, reviewed by read-only agents, with the numbers from the [verification log](openspec/changes/add-expense-groups/verification.md):

| Gate | Result | What it caught |
|------|--------|----------------|
| Plan review, round 1 | **REVISE** — 13 findings | An empty `splitAmong` would divide by zero; missing error shapes and paths; an unbounded query; abuse of the write budget |
| Plan review, round 2 | APPROVE WITH CHANGES — 7 | A share could mix one group's expense with another's member, and every foreign key would still pass |
| Tests first | 59 of 60 red before any code | — |
| Code review, rounds 1–2 | PASS WITH FIXES — 12 | Unicode duplicates, ordering that `VACUUM` could reshuffle, a forgeable cursor, a migration edited after it was committed |
| Security review, rounds 1–2 | PASS WITH FIXES — 18 | Repository-level deploy secrets any pushed workflow could use; agent-editable scripts run by allow-listed commands; guard-hook evasions; read amplification (measured: 20 ms and 360 KB for one list call) |
| Acceptance | ✅ through a public Cloudflare Quick Tunnel | A DNS-caching bug in our own tunnel script |

**50 findings before merge.** One of them sent the change back to Plan: the paged list exists because the security review's measurement showed the unpaged one would break the free plan's 10 ms CPU budget. That loop — review finds a problem, the spec changes, the code follows — is the ADLC working.

Three honest notes:
- `biome migrate` silently rewrote the lint config to disable every rule. It was caught because lint suddenly reported nothing.
- This bootstrap ran from a Claude Code session opened in another directory, so this repo's hooks never fired on its edits. Hooks protect only sessions started in the repo.
- The guard hook is a **tripwire, not a sandbox**; variable indirection can still get past it. The real controls are where credentials live — see [Tripwires versus controls](docs/adlc/00-prepare.md#tripwires-versus-controls).

## Quick start (local, no account needed)

**You need:** Node 22+, pnpm 11, and optionally [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) for the tunnel.

```bash
git clone https://github.com/gsaini/adlc-getting-started.git
cd adlc-getting-started
pnpm install              # pnpm 11: only esbuild, workerd, and sharp may run build scripts
pnpm verify               # typecheck + lint + 74 tests in the real Workers runtime + openspec validate
pnpm db:migrate:local     # local D1
pnpm dev                  # http://localhost:8787
pnpm tunnel --smoke       # share it through a free Quick Tunnel and smoke-test the public URL
```

Then open the repo in **Claude Code**. The hooks, permissions, reviewer agents, and `/opsx:*` commands load automatically.

## Deploy on Cloudflare's free tier

[docs/cloudflare.md](docs/cloudflare.md) walks through it. In short:

1. `pnpm cf:setup` — creates the staging and production D1 databases.
2. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as **environment** secrets.
3. `wrangler logout`.
4. Push to `main`: CI deploys staging automatically and production after your approval.

Until then, the deploy jobs skip cleanly.

## Your turn: `add-settle-up`

[`openspec/changes/add-settle-up/`](openspec/changes/add-settle-up/) is planned and validated but not yet reviewed or built. Take it through the lifecycle yourself:

```text
> use the spec-reviewer agent on openspec/changes/add-settle-up   # 2. plan gate — then approve it
/opsx:apply add-settle-up                                         # 3. implement, test-first
> use the code-reviewer agent on add-settle-up                    # 4. verify
> use the security-reviewer agent on add-settle-up                # 5. secure
pnpm tunnel --smoke                                               # 6. acceptance, then PR → staging → production
/opsx:archive add-settle-up                                       #    the spec becomes the source of truth
```

After your first staging deploy passes, also run `/opsx:archive add-expense-groups` — the last step of the case study.

## The API

| Method | Path | Returns |
|--------|------|---------|
| `GET` | `/health` | `{"status":"ok"}` |
| `POST` | `/groups` | `201` group `{id, name, members, createdAt}` — 2–20 members, unique ignoring case |
| `GET` | `/groups/{id}` | the group |
| `POST` | `/groups/{id}/expenses` | `201` expense `{id, payer, amountCents, description, createdAt, shares}` — split equally to the cent |
| `GET` | `/groups/{id}/expenses?cursor=` | `{expenses, nextCursor}` — 50 per page, newest first |
| `GET` | `/groups/{id}/balances` | `{balances: [{member, netCents}]}` — always sums to zero |

Errors are RFC 9457 problem details: [docs/problems.md](docs/problems.md).

## What's deliberately not done

- **Archive `add-expense-groups`** — after your first staging deploy, per [`openspec/config.yaml`](openspec/config.yaml).
- **Rate limiting and auth** — the design records them as an owned, accepted risk; both are required before real use.
- **Branch ruleset on `main`** — recommended in [00-prepare](docs/adlc/00-prepare.md#tripwires-versus-controls); it changes how you push, so it's your call.

## License

[MIT](LICENSE). An independent learning project — not affiliated with Anthropic, Cloudflare, or OpenSpec.
