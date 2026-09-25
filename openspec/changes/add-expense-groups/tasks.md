# Tasks: add-expense-groups

Every task is test-first: write the failing test named after the spec scenario, make it pass, run `pnpm verify`, then tick the box.

## 1. Foundations

- [x] 1.1 Add `migrations/0001_create_expense_tables.sql` (the data model in design.md, with its foreign keys and checks). Verify: `pnpm db:migrate:local` applies cleanly, and tests show D1 rejects a share whose member is not in the group **and** a share that mixes one group's expense with another group's member.
- [x] 1.2 Tests first for "Health check", "Unknown route", "Unknown route wins over a bad body", and "Wrong method on a known path", then add `/health`, the problem+json helpers (with the `type` URIs), `docs/problems.md`, and the 404 fallback. Verify: those tests pass.

## 2. Money logic

- [x] 2.1 Tests first, then `splitEqually(amountCents, participants)`, where `participants` is already in group member order. Verify: unit tests for even splits and for leftover cents going to the first participants, plus a property test over many generated amounts and participant counts: the shares sum to the amount and differ by at most one cent.

## 3. Groups

- [x] 3.1 Tests first for every "Create a group" scenario plus "Malformed JSON" and "Oversized body" (with and without `Content-Length`), then `POST /groups` with the 16,384-byte body limit. Verify: they pass, including that a rejected request stores nothing.
- [x] 3.2 Tests first for "Existing group" and "Unknown group", then `GET /groups/{id}`. Verify: they pass.

## 4. Expenses

- [x] 4.1 Tests first for every "Record an expense" scenario and "Validation runs before the group lookup", then `POST /groups/{id}/expenses`, which writes the expense and its shares in one D1 batch with the 500 cap checked inside the batch. Verify: they pass, including that `400`/`404`/`409`/`422` store nothing (the 409 test seeds 500 expenses directly in D1).
- [x] 4.2 Tests first for every "List expenses" scenario, including expenses whose `createdAt` values are equal or out of order, then `GET /groups/{id}/expenses` ordered by recording. Verify: they pass.

## 5. Balances

- [x] 5.1 Tests first for every "Show balances" scenario plus a zero-sum check after many random expenses, then `GET /groups/{id}/balances` as one aggregate query. Verify: they pass.

## 5b. Paged list (added after the security review)

- [x] 5b.1 Tests first for "Pages of 50" (120 expenses → 50, 50, 20; no repeats or gaps), "Exactly one full page", "Invalid cursor" (malformed, or from another group), and the updated "Newest first" and "No expenses yet", then page the list 50 at a time with an opaque, group-bound cursor. Verify: they pass, including shares on both sides of a page boundary.

## 6. Verification and security

- [x] 6.1 `pnpm verify` is green: typecheck, lint, tests with coverage at or above the thresholds, and `openspec validate --all --strict`.
- [x] 6.2 Independent review: the `code-reviewer` subagent maps every spec scenario to its test and reviews the code. Findings and their resolutions are recorded in `verification.md`.
- [x] 6.3 Security review: the `security-reviewer` subagent reviews the change. Findings and their resolutions are recorded in `verification.md`. The CI security workflow (secrets, CodeQL, dependency audit) passes.
