# Verification log: add-settle-up

Every review of this change, by a reviewer that is **not** the author, with how each finding was resolved.
Reviews are run with the read-only agents in `.claude/agents/`.

## 1. Plan review — `spec-reviewer`

The reviewer checked the plan against the living spec `openspec/specs/expense-groups/spec.md`, the code in `src/`, `openspec/config.yaml` and `CLAUDE.md`.

**Verdict: APPROVE WITH CHANGES.** 0 blockers, 3 major, 8 minor. "Fix majors 1–3 before `/opsx:apply`. The minors are small edits that don't need another full review round."

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | major | Every scenario had a single creditor, so "pays the member who is owed the most" and the creditor-side tie were never tested. A largest-debtor, first-creditor implementation would pass everything. | New scenario "Several creditors" (Asha 500, Ben 1500, Chen −1000, Dev −1000), covering a debtor tie, the largest creditor beating an earlier member, and a creditor tie that only appears mid-run. The requirement now says sizes and ties are re-evaluated on the remaining balances. Covered in tasks 1.1 and 2.1 |
| 2 | major | The free-plan read budget wasn't considered: each call does 2 D1 round trips and about 11,000 rows read on a worst-case group (measured in `add-expense-groups`), doubling an anonymous read surface | Design Context and Decision 3 state the real cost. Risks: extends the owner's accepted risk, and `add-rate-limiting` must cover `/settle-up`. New scenario "Worst-case group", with its measurement recorded here (task 2.1) |
| 3 | major | Task 3.4 couldn't be carried out: `pnpm tunnel --smoke` stops the tunnel after the smoke test, and `runSmoke` never called the new endpoint | Design decision 5 and task 2.2: the full smoke flow checks settle-up (Ben→Asha 333, Chen→Asha 333), on every staging deploy too. Task 3.4 runs `pnpm tunnel --smoke`, then `pnpm tunnel` for a reviewer to query the "Several creditors" group with an exact expected body |
| 4 | minor | "Any mix of expenses" wasn't measurable and had no status or shape; "Ties follow member order" left out `200` and the wrapper | "Transfers always settle the group" is now concrete: fixed-seed groups of 2–20 members through the API, each `200`, checked against `GET /balances`. Every THEN states `200` and the full body |
| 5 | minor | `from`/`to`/order were under-defined | The requirement defines `from` (pays, negative balance) and `to`, both as display names as stored. Transfers are listed in the order the method produces them; zero-balance members never appear |
| 6 | minor | The `settle()` contract for impossible input was unspecified; a "while any balance ≠ 0" loop could spin the CPU | Design decision 2: input in member order; `RangeError` on non-integer or non-zero-sum input (the `splitEqually` precedent); at most `n − 1` iterations. Task 1.1 has a "Refuses impossible input" test |
| 7 | minor | The property test had no tooling decision, and no property-testing library is installed | Design decision 6: seeded PRNG from `test/split.test.ts`, no new dependency; magnitudes up to 5,000,000,000 to catch 32-bit arithmetic; also asserts determinism and that no zero-balance member appears |
| 8 | minor | `/settlements` would collide with the follow-up `record-settlements`, and renaming after release breaks clients | **Path changed to `GET /groups/{id}/settle-up`** (design decision 4), matching the capability; `/settlements` is kept for recorded payments. `/suggested-transfers` was also rejected |
| 9 | minor | "Rollback is a Worker rollback" didn't say who runs it or why it's safe | The Migration Plan names the human-run **Rollback production** workflow with `production` approval. The previous Worker returns `404 Not found` for the route, and there's no data to undo |
| 10 | minor | Docs weren't planned (README API table, `07-operate.md` budget table) | Task 2.3 and the proposal's Impact |
| 11 | minor | Nothing recorded this review or the human approval | This log, plus task 0.1 |

The expected transfers in every scenario, and in the smoke-test body, were checked against a reference implementation of the greedy method before this log was written. So was the API seeding for "Several creditors".

## 2. Plan approval

- **Agent gate:** `spec-reviewer` APPROVE WITH CHANGES; all 11 changes made (section 1).
- **Human gate:** *pending.* The repository owner approves by approving and merging the planning pull request. Task 0.1 records its link here when that happens.
