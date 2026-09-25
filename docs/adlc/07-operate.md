# Phase 7 — Operate & learn: close the loop

**Goal:** keep the running system healthy inside its budgets, recover fast when it isn't, and feed what you learn back into the rails.

## Watch the free-plan budgets

| Resource (Workers Free) | Limit | This app's exposure |
|-------------------------|-------|---------------------|
| Requests | 100,000 / day | every API call |
| CPU per request | 10 ms | balances query; bounded by the 500-expense cap |
| D1 rows written | 100,000 / day (resets 00:00 UTC) | worst case ~43 rows per expense, ~42 per group |
| D1 rows read | 5,000,000 / day | listing and balances |
| D1 storage | 5 GB total | small |
| Workers Logs | 200,000 events / day, kept 3 days | `observability.enabled` in `wrangler.jsonc` |

When a D1 daily limit is hit, queries fail until the reset — the app keeps running but every write errors. That is why the design caps members and expenses, and why `add-rate-limiting` is required before real use.

Where to look: **Workers & Pages → your Worker → Logs / Metrics**, and **D1 → your database → Metrics** in the Cloudflare dashboard.

## Roll back

Run **Actions → Rollback production** with a reason. It needs the same `production` approval as a release, and restores the previous Worker version (or one you name).

D1 migrations are **forward-only**. A Worker rollback leaves the schema where it is, which is safe only because every migration is additive (expand now, contract in a later release). If a migration itself is wrong, fix forward with a new migration.

## Learn

After each change (or incident), hold a short retro and turn every lesson into a **file change**, not a resolution:

| Lesson | Goes into |
|--------|-----------|
| The agent keeps doing X | `CLAUDE.md` rule, or a hook if it's dangerous |
| Reviews keep missing Y | the reviewer agent's checklist |
| Specs keep omitting Z | `openspec/config.yaml` rules |
| Production surprised us | a new proposal via `/opsx:propose` |

## Measure the process

```bash
# Share of commits co-authored by an agent
git log --format='%(trailers:key=Co-Authored-By,valueonly)' | grep -c . ; git rev-list --count HEAD

# Findings caught before merge (plan + code + security reviews)
grep -c '^| [0-9]' openspec/changes/archive/*/verification.md
```

Track lead time (proposal → production), findings caught per phase, and escaped defects (bugs found after release). If escaped defects rise, move effort earlier: tighter scenarios, stricter reviewers.
