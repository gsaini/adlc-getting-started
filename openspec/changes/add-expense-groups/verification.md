# Verification log: add-expense-groups

Every review of this change, by a reviewer that is **not** the author, with how each finding was resolved.
Reviews are run with the read-only agents in `.claude/agents/`.

## 1. Plan review — `spec-reviewer`, round 1 (before implementation)

**Verdict: REVISE** — 1 blocker, 6 major, 6 minor.

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | blocker | `"splitAmong": []` was allowed and would divide by zero; duplicates had no scenario | `splitAmong` is now 1–20 distinct names; scenarios for `[]` and `["Ben","ben"]` → `400` |
| 2 | major | Expense response shape incomplete; list items unspecified; no empty-list case | Full expense object defined once and referenced; "No expenses yet" scenario added |
| 3 | major | Most error paths had a status code but no body | New "Error responses" requirement: one fixed `title` per error, `errors` lists for 400/422 |
| 4 | major | Missing scenarios: >20 members, blank/overlong names and descriptions, unknown group on list/balances | All added, with exact `path` values |
| 5 | major | Case handling of `payer`/`splitAmong` unspecified; stored names not referentially checked | Matching is trimmed + case-insensitive, responses use display names; shares and payers store `name_key` with composite foreign keys (design decision 7) |
| 6 | major | Unbounded `GET /expenses` contradicted the "no unbounded queries" rule | Cap of 500 expenses per group → `409 Expense limit reached` (design decision 8) |
| 7 | major | Write budget exhaustible by one client; row math ignored index writes | Row math redone with index writes (42–43 rows worst case). No rate limit in this change: recorded as an **accepted risk owned by the repository owner**, with `add-rate-limiting` required before real use |
| 8 | minor | Same-millisecond expenses had no ordering tie-breaker (flaky test) | `ORDER BY created_at DESC, rowid DESC`; scenario covers same-millisecond inserts |
| 9 | minor | No scenario for leftovers when `splitAmong` is in a different order | "Leftovers follow member order, not request order" (1001 → Asha 501, Chen 500) |
| 10 | minor | "16 KB" ambiguous; chunked bodies; wrong-method status | 16,384 bytes on the actual body, with or without `Content-Length`; wrong method → `404 Not found` |
| 11 | minor | Error precedence unspecified | 413 → 400 → 404 → 422 → 409, cheapest check first (design decision 9) |
| 12 | minor | Rollback didn't say who runs it | Human-approved **Rollback production** workflow; agents are blocked by the Bash guard |
| 13 | minor | `db:migrate:local` not a documented command; tasks not phrased test-first | Added to CLAUDE.md; every task now starts "tests first" |

## 2. Plan review — `spec-reviewer`, round 2

Round-1 findings: 10 resolved, 3 partially resolved (#5, #6, #11 — their gaps are new findings 1–3 below). All arithmetic re-checked and correct.

**Verdict: APPROVE WITH CHANGES** — 1 major, 6 minor. "Fix new finding 1 before implementation; the rest are small edits that don't need another full review round."

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | major | A share could combine one group's expense with another group's member and pass both foreign keys | Share FK is now `(group_id, expense_id)` → `expenses(group_id, id)` plus `(group_id, member_key)` → `members`: one `group_id` column ties both. Task 1.1 tests the cross-group case. Row math unchanged (the new `UNIQUE(group_id, id)` replaces the old listing index) |
| 2 | minor | Count-then-insert cap check could race past 500 | Cap checked inside the batch with `INSERT … SELECT … WHERE COUNT < 500`; `409` when no row changed (design decision 8) |
| 3 | minor | Unmatched routes missing from the precedence order | Route matching is first; body limit applies to `POST` routes; new scenario "Unknown route wins over a bad body" |
| 4 | minor | Custom titles with `type: "about:blank"` go against RFC 9457 | Each problem has its own `type` URI in `docs/problems.md`, so custom titles are compliant (design decision 5) |
| 5 | minor | Task 1.2 tested `POST /groups` before task 3.1 creates it | Malformed-JSON and 413 tests moved to task 3.1 |
| 6 | minor | Ordering by `created_at` breaks under clock skew | Order by `rowid DESC` only; `createdAt` is for display (decision 10); spec wording updated |
| 7 | minor | `docs/adlc/07-operate.md` referenced but missing; wrong severity counts in round 1 | `07-operate.md` written; counts corrected above |

## 3. Plan approval

- **Agent gate:** `spec-reviewer` round 2, APPROVE WITH CHANGES; all changes made.
- **Human gate:** delegated by the repository owner for this bootstrap run (the request was to build the repository end to end). Later changes get a recorded approval on a planning pull request; see `docs/adlc/02-plan.md`.
