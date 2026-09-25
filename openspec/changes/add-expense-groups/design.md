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
- Pagination of expenses (groups are small; revisit when a group passes a few hundred expenses).
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
Request bodies are parsed with zod schemas; failures become RFC 9457 `application/problem+json` with an `errors` list. Member-reference errors (payer or participant not in the group) are `422`, because the JSON is well-formed but semantically wrong. **Rejected:** ad-hoc error shapes per route.

### 6. Opaque IDs
`crypto.randomUUID()` for groups and expenses — unguessable, so a group ID works as a capability link until auth exists. **Rejected:** sequential integers (enumerable).

### 7. Members stored by name, unique per group ignoring case
Members are identified by their display name inside a group. A normalized (trimmed, lower-cased) key enforces uniqueness in the database, so the rule holds even if validation is bypassed.

## Data model (migration `0001_create_expense_tables.sql`)

- `groups(id, name, created_at)`
- `members(group_id, name, name_key, position)` — PK `(group_id, name_key)`
- `expenses(id, group_id, payer, amount_cents CHECK > 0, description, created_at)` — index `(group_id, created_at)`
- `expense_shares(expense_id, member, cents CHECK >= 0)` — PK `(expense_id, member)`

Foreign keys cascade from groups. The migration only adds tables, so it is backward compatible by construction.

## Risks / Trade-offs

- **D1 free write budget (100k rows/day).** Each expense writes `1 + participants` rows (max 21). → Member cap of 20; monitor usage in the dashboard; documented in `docs/adlc/07-operate.md`.
- **No auth.** Anyone with a group ID can read and write the group. → Unguessable IDs; explicit non-goal; auth is the next change that must land before real use.
- **Reads grow with expense count.** → Index on `(group_id, created_at)`; revisit with materialized totals if p95 CPU approaches the 10 ms budget.
- **Name-based members make renames hard.** → Renaming is out of scope; a later change can introduce member IDs with a migration.

## Migration Plan

1. CI applies `migrations/` to the staging D1, deploys the Worker to staging, and smoke-tests `/health`.
2. After human approval, the same steps run for production.
3. Rollback: `wrangler rollback` restores the previous Worker version. D1 migrations are forward-only; 0001 only adds tables that the previous (empty) version never reads, so no data rollback is needed.
