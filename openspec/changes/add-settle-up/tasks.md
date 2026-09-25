# Tasks: add-settle-up

Every task is test-first: write the failing test named after the spec scenario, make it pass, run `pnpm verify`, then tick the box.

## 1. Settle logic

- [ ] 1.1 Tests first, then a pure `settle(balances)` in `src/settle.ts`. Verify: unit tests for "Two debtors, one creditor", "Ties follow member order", "Already settled", plus a property test over many random zero-sum balance sets: applying the transfers zeroes every balance, there are at most `n − 1` transfers, and every amount is a positive integer.

## 2. Endpoint

- [ ] 2.1 Tests first for every scenario through the API (seeding expenses that produce the stated balances), then `GET /groups/{id}/settlements`. Verify: they pass, including "Unknown group".

## 3. Verification and security

- [ ] 3.1 `pnpm verify` is green.
- [ ] 3.2 Independent review by the `code-reviewer` agent; findings and resolutions in `verification.md`.
- [ ] 3.3 Security review by the `security-reviewer` agent; findings and resolutions in `verification.md`.
- [ ] 3.4 Acceptance: `pnpm tunnel --smoke`, then a reviewer tries `GET /groups/{id}/settlements` through the tunnel URL.
