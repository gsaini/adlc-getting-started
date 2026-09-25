# Proposal: add-settle-up

> **This change is yours to take through the lifecycle.** It has been planned and validated, but not yet reviewed or approved. Start at the plan gate: run the `spec-reviewer` agent on it, fix what it finds, approve it, then `/opsx:apply add-settle-up`.

## Why

Balances say who is up and who is down, but not what to do about it. People want the short answer: "Chen pays Asha 45.00, Ben pays Asha 15.00, and you're square."

## What Changes

- New endpoint `GET /groups/{id}/settlements` that suggests transfers which, if made, bring every member's balance to zero.
- At most one fewer transfer than there are members, computed deterministically from the current balances.

## Capabilities

### New Capabilities
- `settle-up`: suggested transfers that settle a group's balances.

### Modified Capabilities
<!-- None. Balances (expense-groups) are read, not changed. -->

## Non-goals

- Recording a settlement as a payment (a later change: `record-settlements`).
- The provably smallest number of transfers. That is NP-hard in general; the greedy method here is bounded by `members − 1` and is the standard practical choice.
- Rounding to "nice" amounts.

## Human approval gate

The repository owner approves this plan after the `spec-reviewer` agent's review, and approves the pull request before merge.

## Impact

- New route in `src/index.ts`; a pure `settle()` function in `src/`.
- No migration: settlements are computed from existing data.
