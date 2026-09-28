# Proposal: smoke-health-retry

## Why

The first deploy of a Worker to a new `workers.dev` address failed its smoke test even though the deploy succeeded. In deploy run 36137173585, `GET /health` returned 404 about 0.2 s after `wrangler deploy` finished, and 200 moments later. The smoke script checks health exactly once, so a new address that is still coming up fails the release. Production has not had its first deploy yet, so the same timing will hit it next.

## What Changes

- `scripts/smoke.mjs` retries the initial `GET /health` check for a bounded window (30 s at most, with backoff) before it fails. That covers 404s, other non-200 responses, and network errors such as DNS not resolving yet.
- It logs each retry, so the deploy log shows the wait.
- The checks after health (create group, add expense, balances) stay single-shot. A real bug still fails at once.
- This applies to both modes: the staging full flow and production's `--read-only` check.

## Capabilities

### New Capabilities
- `deploy-smoke-check`: the post-deploy smoke check that CI runs against staging and production, and when it passes or fails.

### Modified Capabilities
<!-- None. -->

## Non-goals

- Retrying the write-path checks (groups, expenses, balances). A failure there is a real regression.
- Changing `deploy.yml`, for example by adding a separate sleep or poll step. The fix belongs in the script so local runs benefit too.
- Making the retry window configurable by flag or environment variable. Nothing needs that yet.
- Health checks after the release, or monitoring.

## Human approval gate

The repository owner approves this proposal (spec, design, tasks) before implementation starts, and approves the pull request before it merges. The first production deploy that uses it still needs approval through the `production` GitHub Environment.

## Impact

- `scripts/smoke.mjs` becomes a thin wrapper. Its logic moves to `scripts/lib/smoke.mjs`, with a typed `smoke.d.mts` for the tests.
- New tests for the retry behavior. The API code in `src/`, the D1 schema and the migrations are unchanged.
- A healthy deploy takes no longer. A deploy whose health never comes up fails after about 30 s instead of at once.
