# Tasks: add-expense-groups

## 1. Foundations

- [ ] 1.1 Add the D1 binding and `migrations/0001_create_expense_tables.sql`; tests apply migrations before each run. Verify: `pnpm db:migrate:local` applies cleanly and `pnpm test` starts against the migrated local D1.
- [ ] 1.2 Add `GET /health`, the problem+json error handler, the 16 KB body limit, and the 404 fallback. Verify: tests for the "Health check" and "Consistent error responses" scenarios pass.

## 2. Money logic

- [ ] 2.1 Write `splitEqually(amountCents, participants)` test-first. Verify: unit tests cover even splits, leftover cents to the first participants, and the invariant "shares sum to the amount and differ by at most 1 cent" over many generated amounts.

## 3. Groups

- [ ] 3.1 `POST /groups` with validation. Verify: tests for "Valid group", "Too few members", "Duplicate member names" pass.
- [ ] 3.2 `GET /groups/{id}`. Verify: tests for "Existing group" and "Unknown group" pass.

## 4. Expenses

- [ ] 4.1 `POST /groups/{id}/expenses`, writing the expense and its shares in one D1 batch. Verify: tests for all "Record an expense" scenarios pass, including that nothing is stored on `422`.
- [ ] 4.2 `GET /groups/{id}/expenses`, newest first. Verify: test for "Newest first" passes.

## 5. Balances

- [ ] 5.1 `GET /groups/{id}/balances` from one aggregate query. Verify: tests for "Balances after two expenses" and "New group" pass, plus a check that balances sum to zero after a series of random expenses.

## 6. Verification and security

- [ ] 6.1 `pnpm verify` is green: typecheck, lint, tests with coverage at or above the thresholds, and `openspec validate --all --strict`.
- [ ] 6.2 Independent review: the `code-reviewer` subagent checks the implementation against every scenario in the spec. Findings and their resolutions are recorded in `verification.md`.
- [ ] 6.3 Security review: the `security-reviewer` subagent reviews the change; findings and resolutions are recorded in `verification.md`. CI security scans (secrets, CodeQL, dependency audit) pass.
