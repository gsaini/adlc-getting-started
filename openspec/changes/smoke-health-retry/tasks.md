## 1. Health retry (test-first)

- [x] 1.1 Add `scripts/lib/smoke.d.mts` declaring `waitForHealthy` and `runSmoke`, plus an empty `scripts/lib/smoke.mjs` stub. Write failing tests in `test/smoke-retry.test.ts` with fake `probe`, `sleep`, `now`, `log` and signal. There is one test per scenario: "Health is ready on the first attempt", "New workers.dev address returns 404 at first", "Network error while the address comes up", "200 with the wrong body is not healthy", "A request that never responds is aborted", "Health never becomes ready" (asserts the 10 attempt times and the sleeps `[500,1000,2000,4000,5000,5000,5000,5000,2500]`) and "Network errors throughout". Verify `pnpm test` fails on these tests and `pnpm typecheck` passes.
- [x] 1.2 Implement `waitForHealthy` in `scripts/lib/smoke.mjs`: backoff, deadline cut, final attempt at the deadline, per-attempt timeout of `max(min(5000, remaining), 1000)`, and exact log lines. Verify the 1.1 tests pass.

## 2. Single-shot flow (test-first)

- [x] 2.1 Add failing tests for "Write-path failure is not retried" (exactly one `POST /groups`, no expense or balance calls, `ok: false`) and "Read-only mode stops after health" (two `GET /health` calls, nothing else, `ok: true`) against `runSmoke` with a fake `call`. Verify they fail.
- [x] 2.2 Implement `runSmoke` by moving the existing flow out of `smoke.mjs`, with the checks unchanged. Verify the 2.1 tests pass.

## 3. Wire into the smoke script

- [x] 3.1 Rewrite `scripts/smoke.mjs` as a thin wrapper. It validates the base URL with `new URL()` and exits 1 at once if it's invalid ("Invalid base URL fails immediately"). It wires in real `fetch`, `AbortSignal.timeout`, `setTimeout` and `Date.now`. It catches the health failure and prints the base URL plus the last status and body, or the last error, to stderr, then exits 1. It exits 0 or 1 from `runSmoke`'s result. Verify with `pnpm dev` + `pnpm smoke` (full flow) and `pnpm smoke http://localhost:8787 --read-only`, which both exit 0, and `node scripts/smoke.mjs "" --read-only`, which exits 1 at once with no request.
- [ ] 3.2 Check the failure path by hand: `node scripts/smoke.mjs http://localhost:9 --read-only` logs attempts 1–9 with the specified retry lines, and exits 1 about 30 s after starting, with a stderr line naming the URL and the last error.

## 4. Verification

- [ ] 4.1 Run `pnpm verify` (typecheck, lint, tests with coverage, `openspec validate`) and verify it passes.
- [ ] 4.2 Independent review: run the `code-reviewer` subagent against this change's scenarios and resolve its findings.
- [ ] 4.3 Security review: run the `security-reviewer` subagent and resolve its findings.
