# Proposal: add-expense-groups

## Why

Friends who share costs (a trip, a flat, a dinner) need one place to record who paid for what and see who owes whom. This is the first slice of "Split": without groups, expenses, and balances there is no product to iterate on.

## What Changes

- New HTTP API on Cloudflare Workers to **create a group** of 2–20 named members and **read it back**.
- **Record an expense**: who paid, the amount in integer cents, a description, and who shares it (everyone by default). The amount is split equally, and leftover cents are assigned deterministically so shares always add up exactly.
- **List a group's expenses**, newest first.
- **Show balances**: each member's net position (paid minus owed), which always sums to zero.
- Consistent error responses (`application/problem+json`) and a request-size limit.
- A `/health` endpoint for deploy smoke tests.
- First D1 migration creating the tables.

## Capabilities

### New Capabilities
- `expense-groups`: groups, members, equally split expenses, and per-member balances over HTTP.

### Modified Capabilities
<!-- None: this is the first capability. -->

## Non-goals

- Accounts, login, or access control. Anyone with a group ID can read and write it (acceptable for a demo; a later change must add auth before real use).
- Unequal splits (percentages, shares, exact amounts).
- Editing or deleting expenses.
- Settle-up suggestions (a separate change: `add-settle-up`).
- Multiple currencies — a group has one implicit currency.
- Any UI.

## Human approval gate

The repository owner approves this proposal (spec, design, tasks) before implementation starts, and approves the pull request before it merges. Production deploys need a second approval through the `production` GitHub Environment.

## Impact

- New code: `src/` (Hono app, routes, domain logic, D1 queries), `test/`.
- New migration: `migrations/0001_create_expense_tables.sql`.
- New Cloudflare resources: one D1 database per environment (staging, production), all within free-plan limits.
- Dependencies: `hono`, `zod`.
