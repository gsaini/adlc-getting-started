# Design: add-settle-up

## Context

Balances already come from one bounded aggregate query (`expense-groups`, design decision 4). Groups have at most 20 members.

## Goals / Non-Goals

**Goals:** a pure, deterministic `settle(balances)` function that is easy to test exhaustively; no new storage.

**Non-Goals:** optimal (minimum) transfer count; persisting settlements.

## Decisions

### 1. Greedy: largest debtor pays largest creditor
Each step fully settles at least one member, so there are at most `n − 1` steps for `n` members. Ties go to the earlier member in group order, so the output is deterministic. **Rejected:** an optimal minimum-transfer search (NP-hard; exponential in the worst case, and 20 members could blow the 10 ms CPU budget); pairing debtors with creditors in member order (simpler, but it often produces more transfers).

### 2. Compute on read, from the balances query
There is no new table and no migration. The cost is one aggregate query plus O(n log n) work for n ≤ 20.

## Risks / Trade-offs

- **Suggestions change as expenses change.** → Expected: they're suggestions, not records. `record-settlements` is a later change.

## Migration Plan

None. Rollback is a Worker rollback.
