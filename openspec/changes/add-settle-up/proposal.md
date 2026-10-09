# Proposal: add-settle-up

> **Status:** the plan was reviewed by `spec-reviewer` (APPROVE WITH CHANGES, all changes made; see `verification.md`) and is waiting for the owner's approval on its planning pull request. After approval: `/opsx:apply add-settle-up`.

## Why

Balances say who is up and who is down, but not what to do about it. People want the short answer: "Chen pays Asha 45.00, Ben pays Asha 15.00, and you're square."

## What Changes

- New endpoint `GET /groups/{id}/settle-up` that suggests transfers which, if made, bring every member's balance to zero. The path `/settlements` stays free for recording real payments in `record-settlements`.
- At most one fewer transfer than there are members, computed deterministically from the current balances.
- The staging smoke test checks the new endpoint after balances. The production smoke test stays read-only.

## Capabilities

### New Capabilities
- `settle-up`: suggested transfers that settle a group's balances.

### Modified Capabilities
<!-- None. Balances (expense-groups) are read, not changed. The deploy-smoke-check requirements (single-shot checks; read-only stops after health) are unchanged; the full flow gains one check. -->

## Non-goals

- Recording a settlement as a payment (a later change: `record-settlements`).
- The provably smallest number of transfers. That is NP-hard in general; the greedy method here is bounded by `members − 1` and is the standard practical choice.
- Rounding to "nice" amounts.
- Auth and rate limiting. The read cost extends the owner's existing accepted risk; `add-rate-limiting` must cover this endpoint.

## Human approval gate

The repository owner approves this plan by approving and merging its planning pull request, after the `spec-reviewer` review recorded in `verification.md`. The owner then approves the implementation pull request, and approves the production deploy through the `production` GitHub environment.

## Impact

- New route in `src/index.ts`, and a pure `settle()` function in `src/settle.ts`, with tests.
- `scripts/lib/smoke.mjs` and `test/smoke-retry.test.ts`: one more check in the full smoke flow.
- `README.md` (API table) and `docs/adlc/07-operate.md` (budget table).
- No migration: suggestions are computed from existing data.
