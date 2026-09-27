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

## 4. Implementation (phase 3)

Tests were written first from the spec scenarios; before any implementation, 59 of 60 failed. After implementation, `pnpm verify` was green. The migration tests (task 1.1) show the database itself rejects cross-group shares, payers from another group, and out-of-range amounts.

Found along the way:

- **The test harness shared state between tests.** The first run failed on seed collisions. Fixed by calling `reset()` and re-applying migrations before each test (`test/apply-migrations.ts`).
- **`biome migrate` silently disabled linting.** It rewrote `"recommended": true` as `"preset": "none"`. Caught because lint suddenly reported nothing; restored to `"preset": "recommended"` and confirmed with a deliberate `==` violation. A tool "fixing" config into a weaker gate is exactly what the Stop hook and reviewers are there to catch.
- **The hooks never fired during this bootstrap.** It was built from a Claude Code session opened in a different directory, so this repo's `.claude/` hooks didn't apply, and formatting slipped through until `pnpm verify` ran by hand. Hooks protect only sessions started in the repo.

## 5. Code review — `code-reviewer`

### Round 1: PASS WITH FIXES (8 minor)

All 31 scenarios had tests.

| # | Finding | Resolution |
|---|---------|------------|
| 1 | Same name in NFC/NFD Unicode became two members | `nameKey` NFC-normalizes; test with a composed/decomposed pair |
| 2 | A 41-character non-member payer got 400, not 422 | `payer`/`splitAmong` are lookups (`min(1)` only), so any non-member is 422; 422 messages no longer echo the submitted name |
| 3 | Ordering relied on the implicit rowid of a TEXT-keyed table (VACUUM may renumber it) | `seq INTEGER PRIMARY KEY` (rowid alias, stable), ordered by `seq DESC` |
| 4 | Several error tests didn't assert the exact `title` | Added |
| 5 | Streamed 413 test checked only the status | Asserts problem+json `type`, `title`, `status` |
| 6 | Non-empty `id` and exact response fields unproven | `not.toBe("")` and exact key sets for group and expense |
| 7 | "Newest first" checked only the first item | The list must equal the recorded objects exactly |
| 8 | 422-before-409 untested | Test seeds 500 expenses and posts an unknown payer |

### Round 2: PASS WITH FIXES (1 major, 3 minor)

All 8 round-1 findings were resolved, and the pagination (below) was confirmed correct.

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| N1 | major | Migration 0001 was edited after it had been committed to (local) `main`, against CLAUDE.md, and the local dev D1 still had the old schema (`pnpm dev` would fail) | **Decision:** nothing had been pushed, merged, or applied to Cloudflare, so 0001 is treated as unmerged work and keeps a single final version. The rule's intent — never change a migration that is shared or applied remotely — is now spelled out in CLAUDE.md and enforced by a CI check on pull requests. The local D1 was reset with the new `pnpm db:reset:local`. |
| N2 | minor | The cursor was the raw global sequence: forgeable, and it revealed the total number of expenses across all groups | The cursor is the last expense's ID, resolved only within its group; malformed → 400 before the lookup, foreign/unknown → 400 after it |
| N3 | minor | Paging tests seeded expenses without shares; no exactly-50 case; one test asserted only the status | Added: 51 expenses via the API with shares compared across the page boundary; exactly 50 → `nextCursor: null`; title and path asserted |
| N4 | minor | Bookkeeping: task 5b.1 unticked, reviews not logged, tooling mixed with the change | Ticked; this log; tooling and CI changes committed separately |

## 6. Security review — `security-reviewer`

### Round 1: PASS WITH FIXES (2 high, 3 medium, 7 low)

The application code passed. The findings were in the delivery machinery.

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | high | Deploy credentials as **repository** secrets: any pushed workflow could deploy production without approval | Environment secrets on `staging`/`production`; deploy and rollback jobs run only on `main`; environments restricted to `main`, with a required reviewer on `production` |
| 2 | high | Allow-listed `pnpm test`/`verify` (and the Stop hook) run files the agent could edit: `package.json`, test config, scripts | `ask` rules on build/test/lint/type config, `wrangler.jsonc`, `scripts/**`, `.github/**`, `CLAUDE.md`; CODEOWNERS; `wrangler logout` after setup |
| 3 | medium | The agent could edit its own guardrails | `deny` Edit/Write on `.claude/**` |
| 4 | medium | The Bash guard could be evaded (line continuation, quote splitting, `sh -c`, the API directly) | Normalization plus program-aware checks; documented as a tripwire, with credentials and branch protection as the real controls |
| 5 | medium | Read amplification: ~230 GETs on a full group could exhaust the daily D1 read budget | **Measured** (list: median 20 ms and 360 KB for a full group; balances: 4 ms, 704 B), then **looped back to Plan**: the list is paged (spec change, task 5b.1). The remainder is part of the owned accepted risk, and `add-rate-limiting` must cover reads |
| 6 | low | Push-to-main check missed full refspecs and `+` force refspecs | Handled |
| 7 | low | The guard failed open on unreadable input | Fails closed |
| 8 | low | `.env` readable through Bash | Guard denies credential paths |
| 9 | low | The Stop gate skipped config, scripts, and workflow changes | Runs unless every change is documentation |
| 10 | low | Wrangler output interpolated into `run:` | Passed through `env:` |
| 11 | low | Secret-bearing third-party actions on movable tags | Pinned to commit SHAs; Dependabot for `github-actions` |
| 12 | low | The Quick Tunnel stayed public indefinitely | Auto-shutdown after 30 minutes (`--minutes`, max 240) |

### Round 2: PASS WITH FIXES (2 medium, 4 low)

7 resolved; 5 partially resolved (their gaps are below, or GitHub settings applied when the repository was created).

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| N1 | medium | The hardened guard over-matched: it blocked `git add wrangler.jsonc …`, commit messages mentioning deploys, and `grep c.env.DB` | Rewritten to judge the **program each command segment runs**; 49-case allow/deny matrix recorded in the commit. Known residual: variable indirection and `node -e` string building still pass to the normal permission prompt — documented as tripwire limits |
| N2 | medium | Zero-prompt execution: Vitest prefers `vitest.config.ts` over `.mts`; `.git/hooks` and `.git/config` run under allow-listed git commands | `ask` on `vitest.config.*`, `vite.config.*`, `.npmrc`; `deny` on `.git/**`; CODEOWNERS updated |
| N3 | low | `pnpm/action-setup` (third party) on a tag, in jobs holding secrets | Pinned to the v6.1.0 commit |
| N4 | low | Migration 0001 edited (same as code review N2-round N1) | See the decision above |
| N5 | low | One account-scoped token in both environments: a merged malicious change could deploy production from the unreviewed staging job | Documented in `docs/cloudflare.md`: production approval protects against unmerged code; review of every merge protects against merged code; a second free Cloudflare account gives hard isolation |
| N6 | low | Cursor revealed the global sequence | Already fixed (code review round 2, N2) |

Also from round 2: each page read ~3,500 rows because listing sorted through a temporary B-tree. Adding the index `(group_id, seq)` makes it a covering-index search (`EXPLAIN QUERY PLAN`: `SEARCH e USING COVERING INDEX expenses_by_group`), for ~2,100 rows per page at the cost of one more written row per expense (44 in the worst case).

## 7. Acceptance — Cloudflare Quick Tunnel

`pnpm tunnel --smoke` served the local build at a public `https://<random>.trycloudflare.com` URL and passed the end-to-end smoke test through it: health, create group, 1000-cent expense split 334/333/333, balances summing to zero. Both processes then shut down cleanly.

The first attempt failed: the script queried the new hostname before the tunnel registered, and the OS cached the failed DNS lookup. The fix — wait for `Registered tunnel connection`, then 5 seconds — is in `scripts/tunnel.mjs` and documented in `docs/cloudflare.md`.

## 8. What's left for a human

- **Configure Cloudflare** (`docs/cloudflare.md`): `pnpm cf:setup`, environment secrets, `wrangler logout`. Then the first push deploys staging and waits for production approval.
- **Archive** this change with `/opsx:archive add-expense-groups` once the first staging smoke test passes, per `openspec/config.yaml`.
- **Enable the `main` branch ruleset** (`docs/adlc/00-prepare.md`) so CODEOWNERS review is enforced.
- **Before real use:** `add-rate-limiting`, covering reads and writes, with auth after it.
