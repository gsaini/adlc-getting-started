# Design: smoke-health-retry

## Context

`scripts/smoke.mjs` is a plain Node ESM script with no dependencies. CI runs it right after `wrangler deploy` in `.github/workflows/deploy.yml`: the full flow on staging, `--read-only` on production. It is not unit-tested today.
- Vitest runs inside the Workers runtime (`@cloudflare/vitest-plugin`).
- `pnpm typecheck` runs `tsc --noEmit -p test` under a strict config without `allowJs`.
- Coverage thresholds apply to `src/**` only.

See proposal.md for why the change is needed and specs/deploy-smoke-check for the exact behavior.

## Goals / Non-Goals

**Goals:**
- Every scenario in the spec is covered by an automated test, with no real network calls or real waiting.
- The script stays dependency-free and runs with plain `node`.

**Non-Goals:**
- A general retry helper for the API itself. This is release tooling only.

## Decisions

### The logic moves into `scripts/lib/smoke.mjs`, with a typed `scripts/lib/smoke.d.mts`
The module exports two functions:
- `waitForHealthy({ probe, sleep, now, log, timeoutMs = 30_000, attemptTimeoutMs = 5_000 })`
  - `probe(signal)` returns `{ status, json }` or throws.
  - It resolves with the healthy result. Otherwise it rejects with an error that carries the last observation: `{ status, json }` or the error.
- `runSmoke({ base, readOnly, call, waitForHealthy, log })`
  - It runs the health wait and then the single-shot flow.
  - It returns `{ ok: true }`, or `{ ok: false, message }` for the first failed check.

`smoke.mjs` stays a thin wrapper. It parses argv, checks the base URL with `new URL()` (and exits 1 at once if it's invalid), and wires in real `fetch`, `setTimeout`, `Date.now` and `AbortSignal.timeout`. It prints failures to stderr and sets the exit code. `runSmoke` never calls `process.exit`, so tests can assert on how many requests were made.

The hand-written `.d.mts` gives `tsc` a strict type for the test imports.
- *Rejected: `allowJs` + `checkJs` in `test/tsconfig.json`.* It widens typecheck to every script, which is scope creep for this change.
- *Rejected: `// @ts-ignore` on the import.* It hides real type errors in tests.
- *Rejected: inlining the loop in `smoke.mjs`.* Tests could only reach it by spawning the script against a live server.
- *Rejected: vitest fake timers around real `fetch`.* It's harder to follow in the Workers pool, and still needs a server.

### Per-attempt timeout: `min(5000, remaining)` via `AbortSignal`
Without it, one stalled `fetch` (undici waits up to 300 s for headers) breaks the 30 s bound. An abort counts as a network error and is retried like one. The wrapper passes `AbortSignal.timeout(ms)`. Tests pass a fake signal and a probe that rejects when it fires.

### Backoff: 500 ms doubling, capped at 5 s, deadline 30 s, final attempt at the deadline
Attempts come at 0, 0.5, 1.5, 3.5, 7.5, 12.5, 17.5, 22.5, 27.5 and 30 s, 10 in total. A new `workers.dev` address was reachable within a couple of seconds in run 36137173585, so the first attempts come fast. 30 s leaves plenty of slack and stays well under the job timeout.
- *Rejected: a fixed `sleep 10` in `deploy.yml`.* It slows every deploy, it's still a guess, and local runs don't get it.
- *Rejected: a 2-minute window.* It hides a broken deploy for longer before the rollback decision.

### Only health retries, and only for things that are plausibly transient
The write-path checks run once. Health is the only check that "not ready yet" explains, and retrying writes could create duplicate throwaway groups on staging. A bad base URL is a config error, not a transient one, so it fails before the loop.

## D1 migration

None. This change doesn't touch the schema, so backward compatibility doesn't arise.

## Risks / Trade-offs

- [A broken deploy takes about 30 s longer to fail] → Acceptable: it happens rarely, and the job still fails before production can be approved.
- [A valid but wrong URL, such as a stale `deployment-url`, retries its 404 for 30 s] → The final stderr line prints the URL, the last status and the body, so the cause is still obvious.
- [`scripts/**` is outside `coverage.include`, so no threshold enforces the helper's coverage] → Accepted. Every spec scenario has its own test instead. Coverage config and thresholds are unchanged.
- [The `.d.mts` could drift from the `.mjs`] → Both files are small and sit side by side. The tests call every exported function with the declared shapes, so a drift in call signatures shows up in the tests.

## Migration Plan

Merge, then the next deploy uses it. Rollback: revert the commit, since the script has no persisted state.
