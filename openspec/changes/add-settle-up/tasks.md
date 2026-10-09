# Tasks: add-settle-up

Every task is test-first: write the failing test named after the spec scenario, make it pass, run `pnpm verify`, then tick the box.

## 0. Plan gate

- [ ] 0.1 Record the plan review and the human approval in `verification.md`: the `spec-reviewer` findings with their resolutions, and the owner's approval of the planning pull request. Verify: sections 1 and 2 of `verification.md` are complete, and section 2 links the approved pull request.

## 1. Settle logic

- [ ] 1.1 Tests first, then a pure `settle(balances)` in `src/settle.ts` (design decision 2). Verify that these unit tests pass:
  - The scenarios "Two debtors, one creditor", "Ties follow member order", "Several creditors" and "Already settled".
  - "Refuses impossible input": a non-integer or non-zero-sum input throws `RangeError`.
  - A property test using the seeded PRNG from `test/split.test.ts`, with no new dependency. It runs 2,000 sets of 2–20 members with `|netCents|` ≤ 5,000,000,000 and checks that every balance ends at 0, there are at most `n − 1` transfers, each `cents` is a positive integer, no zero-balance member appears, and the same input gives the same output.

## 2. Endpoint

- [ ] 2.1 Tests first through the API, then `GET /groups/{id}/settle-up`. Verify that they pass. The tests are:
  - Every scenario in the spec, seeding expenses that produce the stated balances. For example, "Several creditors": Ben pays 2000 split among `["Chen","Dev"]`, then Asha pays 500 split among `["Ben"]`.
  - "Unknown group".
  - "Transfers always settle the group", with a fixed seed, checked against `GET /balances`.
  - "Worst-case group": 20 members and 500 expenses seeded straight into D1, as the 409 test does. Record the measured time in `verification.md`.
- [ ] 2.2 Tests first in `test/smoke-retry.test.ts`, then extend `runSmoke` in `scripts/lib/smoke.mjs` (design decision 5). Verify that the tests pass and that `pnpm dev` + `pnpm smoke` exits 0. The tests check that:
  - The full flow calls `GET /groups/:id/settle-up` once after balances and expects the Ben→Asha 333, Chen→Asha 333 body.
  - A wrong body fails after a single request.
  - `--read-only` still makes no request after health.
- [ ] 2.3 Update the docs. Verify that every relative link in the changed files resolves.
  - Add a `GET /groups/{id}/settle-up` row to the API table in `README.md`.
  - Add settle-up to the CPU and rows-read rows of the budget table in `docs/adlc/07-operate.md`.

## 3. Verification, security and acceptance

- [ ] 3.1 `pnpm verify` is green.
- [ ] 3.2 Independent review by the `code-reviewer` agent; findings and resolutions in `verification.md`.
- [ ] 3.3 Security review by the `security-reviewer` agent; findings and resolutions in `verification.md`.
- [ ] 3.4 Acceptance, recorded in `verification.md`:
  1. `pnpm tunnel --smoke` passes. It now includes the settle-up check.
  2. `pnpm tunnel` (without `--smoke`, so it stays up) serves the build.
  3. A reviewer creates the "Several creditors" group through the tunnel URL.
  4. `GET /groups/{id}/settle-up` returns exactly the scenario's body.
