# Design: add-expense-groups

## Context

A new Cloudflare Worker on the free plan (see `openspec/config.yaml` for the budgets). No existing code or data. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- Money that is exact to the cent, with no float arithmetic anywhere.
- Writes that are all-or-nothing: an expense and its shares land together or not at all.
- Balances that can never drift from the expenses they come from.
- Well inside the free plan: ~10 ms CPU per request, 100k D1 row writes/day.

**Non-Goals:**
- Pagination of expenses (replaced for now by the 500-expense cap, decision 8).
- Caching.

## Decisions

### 1. Hono on Workers
Routing, typed bindings, and middleware (body limit, error handling) in a few KB. **Rejected:** a raw `fetch` handler (hand-written routing and error plumbing), itty-router (smaller ecosystem, fewer built-in middlewares).

### 2. D1 for storage
Balances are aggregates over relational data, and D1's `batch()` runs its statements as one transaction. **Rejected:** Workers KV (eventually consistent — a balance read could miss a just-written expense), Durable Objects (strongly consistent, but more machinery than a small CRUD API needs).

### 3. Integer cents and deterministic remainders
Each participant's share is `floor(amount / n)`; the `amount mod n` leftover cents go one each to the first participants in the group's member order. Shares always sum exactly to the amount, and the same input always produces the same split. **Rejected:** floating-point dollars (rounding drift); random assignment of leftovers (non-reproducible tests and bills).

### 4. Balances computed on read
`netCents = SUM(paid) − SUM(shares)` per member, in one SQL query. Nothing is stored that could fall out of sync. **Trade-off:** reads cost O(expenses in the group). **Rejected:** stored running totals (faster reads, but a missed update corrupts every later balance).

### 5. Validation at the edge with zod; errors as problem+json
Request bodies are parsed with zod schemas; failures become RFC 9457 `application/problem+json` with an `errors` list. Member-reference errors (payer or participant not in the group) are `422`, because the JSON is well-formed but semantically wrong. Each problem has its own `type` URI pointing at a section of `docs/problems.md`, so the specific titles are RFC-compliant (with `type: "about:blank"`, RFC 9457 expects the plain HTTP status phrase as the title). Forks should change the base URI. **Rejected:** ad-hoc error shapes per route; `about:blank` with generic titles (clients couldn't tell "group not found" from "no such route").

### 6. Opaque IDs
`crypto.randomUUID()` for groups and expenses — unguessable, so a group ID works as a capability link until auth exists. **Rejected:** sequential integers (enumerable).

### 7. Members referenced by a normalized key, enforced by foreign keys
Each member row stores its display `name` and a `name_key` (trimmed, lower-cased); `(group_id, name_key)` is the primary key, so "unique ignoring case" holds in the database itself. Expenses and shares store the `name_key`, and every reference carries the group: the payer is `(group_id, payer_key)` → `members`, and a share is both `(group_id, expense_id)` → `expenses(group_id, id)` and `(group_id, member_key)` → `members`. Because a share's single `group_id` column appears in both keys, its expense and its member must belong to the same group. D1 enforces foreign keys by default, so this holds even if validation is bypassed. Responses join back to the display name. **Rejected:** storing display names in expenses (case drift, no referential check); surrogate member IDs (clearer for future renames, but more API surface than this change needs).

### 8. Bounded reads: at most 500 expenses per group
Listing and balances read every expense in a group, so the group itself is capped at 500 expenses; the 501st is refused with `409`. Every query is therefore bounded, as CLAUDE.md requires. The cap is enforced **inside the write batch**: the expense is inserted with `INSERT … SELECT … WHERE (SELECT COUNT(*) …) < 500`, each share with `… WHERE EXISTS` the new expense, and `409` is returned when the expense insert changed no rows. A separate count-then-insert would let two concurrent requests both pass at 499. **Rejected:** cursor pagination (more API surface than a first slice needs — the cap can be raised when pagination arrives); an unbounded list (breaks the "no unbounded queries" rule and the 10 ms CPU budget).

### 9. Cheapest checks first
Order: route match (404 `Not found`) → body size (413) → JSON and field validation (400) → group lookup (404 `Group not found`) → member references (422) → expense cap (409). The router decides first, so a bad body sent to a path that doesn't exist is simply `Not found`. After that, bad input is rejected before touching D1, so garbage requests cost no database reads. The body limit applies to the `POST` routes and is 16,384 bytes measured on the actual body, so a chunked request without `Content-Length` is limited too.

### 10. Order by recording, not by clock
Expenses list by `rowid DESC` — SQLite's insertion order. `created_at` is for display only: it comes from whichever Worker instance recorded the expense, and one instance's clock may lag another's. **Rejected:** ordering by `created_at` with a `rowid` tie-breaker (still wrong under clock skew).

### 11. Unmatched routes and methods
Anything the router doesn't match — including a wrong method on a known path, such as `DELETE /groups/{id}` — is `404 Not found`. **Rejected:** `405` with an `Allow` header (more correct HTTP, extra code for no client benefit in this slice).

## Data model (migration `0001_create_expense_tables.sql`)

- `groups(id TEXT PK, name, created_at)`
- `members(group_id FK→groups, name_key, name, position)` — PK `(group_id, name_key)`
- `expenses(id TEXT PK, group_id FK→groups, payer_key, amount_cents CHECK 1..10000000, description, created_at)` — `UNIQUE(group_id, id)` (the target of the shares' foreign key, and the index for listing a group's expenses); FK `(group_id, payer_key)`→`members`
- `expense_shares(expense_id, group_id, member_key, cents CHECK >= 0)` — PK `(expense_id, member_key)`; FK `(group_id, expense_id)`→`expenses(group_id, id)`; FK `(group_id, member_key)`→`members`

Foreign keys cascade on delete. The migration only adds tables, so it is backward compatible by construction.

## Risks / Trade-offs

- **D1 free write budget (100,000 rows/day).** D1 counts each index entry as an extra written row. Worst cases: creating a group of 20 writes 42 rows (group + its primary-key index, 20 members × 2); recording an expense split 20 ways writes 43 rows (expense + its primary-key and `(group_id, id)` indexes, 20 shares × 2). That is roughly 2,300 maximum-size expenses per day for the whole account. → Member cap of 20; expense cap of 500 per group; usage visible in the dashboard (see `docs/adlc/07-operate.md`).
- **Abuse: no auth and no rate limit.** Anyone can create groups until the day's write budget is gone, and then every write fails until 00:00 UTC. → **Accepted risk for this change, owned by the repository owner**, because the demo holds no real data. The follow-up change `add-rate-limiting` must land before real use. It is not in this change because the Workers rate-limiting binding's free-plan availability isn't documented, and the binding is explicitly approximate ("permissive, eventually consistent").
- **No auth.** Anyone with a group ID can read and write the group. → Unguessable IDs; explicit non-goal; auth is a later change.
- **Reads grow with expense count.** → Bounded by the 500 cap and the `(group_id, id)` index; each insert also counts the group's expenses (up to 500 rows read, against a budget of 5 million a day). Revisit with pagination or stored totals if p95 CPU approaches the 10 ms budget.

## Migration Plan

1. CI applies `migrations/` to the staging D1, deploys the Worker to staging, and smoke-tests `/health`.
2. After human approval, the same steps run for production.
3. Rollback: a human runs the **Rollback production** workflow (`.github/workflows/rollback.yml`), which needs the same `production` environment approval as a release, and it calls `wrangler rollback`. Agents are blocked from rolling back by the Bash guard hook. D1 migrations are forward-only; 0001 only adds tables that the previous (empty) version never reads, so no data rollback is needed.
