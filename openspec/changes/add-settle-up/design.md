# Design: add-settle-up

## Context

Balances come from `repo.balances()`, which returns `{member, netCents}` for every member, in group member order (`ORDER BY m.position`). `GET /groups/{id}/balances` makes 2 D1 round trips: `findGroup` and the balances aggregate. On a worst-case group (20 members, 500 expenses) the aggregate reads about 11,000 rows and took 4 ms (measured in `add-expense-groups`). Groups have at most 20 members. See proposal.md for the motivation and specs/settle-up for the exact behavior.

## Goals / Non-Goals

**Goals:** a pure, deterministic `settle(balances)` function that is easy to test exhaustively; no new storage.

**Non-Goals:** an optimal (minimum) transfer count; persisting settlements; changing the read-only production smoke check.

## Decisions

### 1. Greedy: largest debtor pays largest creditor, on the remaining balances
Each step fully settles at least one member, and the last step settles two, so there are at most `n − 1` steps for `n` members. Sizes and ties are re-evaluated on the balances that remain after each transfer. Ties go to the earlier member in group order, so the output is deterministic.
- **Rejected: an optimal minimum-transfer search.** It's NP-hard and exponential in the worst case, so 20 members could exceed the 10 ms CPU budget.
- **Rejected: pairing debtors with creditors in member order.** It's simpler, but it often produces more transfers.

### 2. `settle()` contract
`settle(balances: {member: string, netCents: number}[])` takes balances in group member order, as `repo.balances()` returns them, and returns `{from, to, cents}[]`.
- It throws `RangeError` if any `netCents` is not an integer, or if the sum is not zero. This follows the precedent of `splitEqually` in `src/split.ts`.
- The loop runs at most `n − 1` iterations, never "while any balance ≠ 0", so bad input can't spin the CPU.
- Real balances always sum to zero, so a `RangeError` would mean a bug. It surfaces as `500 Internal error` through the existing `app.onError`.

### 3. Compute on read, with the same queries as balances
There is no new table and no migration. A call costs what `/balances` costs (2 D1 round trips, about 11,000 rows read on a worst-case group) plus O(n²) work at most for n ≤ 20, which is trivial next to the query.

### 4. Path: `GET /groups/{id}/settle-up`
It matches the capability name.
- **Rejected: `/settlements`.** The follow-up `record-settlements` will want `POST`/`GET /groups/{id}/settlements` for payments that actually happened. Using that path now for suggestions would force a rename later, which breaks clients.
- **Rejected: `/suggested-transfers`.** It's longer, and it doesn't match the capability.

### 5. The staging smoke test checks settle-up too
The full-flow smoke test already creates Asha, Ben, Chen with one 1000-cent expense paid by Asha (Asha `+666`, Ben `-333`, Chen `-333`). After balances it will call `GET /groups/{id}/settle-up` once and expect `200` with `{"transfers":[{"from":"Ben","to":"Asha","cents":333},{"from":"Chen","to":"Asha","cents":333}]}`.
- That runs on every staging deploy and in `pnpm tunnel --smoke`.
- Production's `--read-only` check is unchanged: health only.
- The `deploy-smoke-check` requirements are unchanged: checks after health are single-shot, and read-only stops after health.

### 6. Property tests use a seeded PRNG, with no new dependency
They use the same linear-congruential generator as `test/split.test.ts`. Magnitudes go up to 5,000,000,000 (500 expenses × 10,000,000 cents), which would catch any 32-bit arithmetic (`|0`, bitwise operators).

## D1 migration

None. Settle-up is computed from existing data, so it's backward compatible by construction.

## Risks / Trade-offs

- **Suggestions change as expenses change.** → Expected: they're suggestions, not records. `record-settlements` is a later change.
- **Read budget.** Each call reads about as many rows as `/balances` (about 11,000 on a worst-case group), so this doubles an anonymous read surface. → This extends the **accepted risk owned by the repository owner** from `add-expense-groups` (no auth, no rate limit, demo data only). `add-rate-limiting` must cover `/settle-up` as well as `/balances` and listing. Task 2.1 measures the worst case, and verification.md records it.
- **CPU.** At most 19 transfers over 20 members is negligible. The worst-case test in task 2.1 confirms it.

## Migration Plan

No migration. Rollback: a human runs the **Rollback production** workflow (`.github/workflows/rollback.yml`) with `production` approval; agents are blocked from it. The previous Worker returns `404 Not found` for the route, and there's no data to undo.
