# Phase 2 — Plan: design, tasks, and the first human gate

**Goal:** decide **how** before anyone writes code, get an independent critique, and get a human "yes".

## How

`/opsx:propose` also writes:

- `design.md` — decisions **with the alternatives rejected**, risks with mitigations (or explicitly accepted risks with an owner), the migration, and the rollback plan.
- `tasks.md` — small, ordered, test-first tasks, each stating how it is verified. OpenSpec tracks progress by the checkboxes.

Then run the independent critique:

```text
> use the spec-reviewer agent on openspec/changes/add-expense-groups
```

## What happened in this repo

The first review of `add-expense-groups` came back **REVISE**: 1 blocker (an empty `splitAmong` list would divide by zero), 7 major findings (missing response shapes and error paths, case-sensitivity, an unbounded query, write-budget abuse), and 5 minor ones. Every finding and its resolution is in [`verification.md`](../../openspec/changes/add-expense-groups/verification.md). Fixing them in the plan took minutes; finding them in code review — or production — would not have.

One finding was **not** fixed but **accepted**: no rate limiting in the first slice. The design names the risk, the owner, the reason, and the follow-up change that must land before real use. An explicit, owned risk is a legitimate outcome of review; a silent one is not.

## The human gate

The repo owner approves proposal, spec, design, and tasks **together**. In a team, do this on a PR that contains only the change folder, so the approval is recorded.

## Exit gate

`spec-reviewer` verdict is APPROVE (or APPROVE WITH CHANGES, with the changes made), and a human has approved.

## Anti-patterns

- Letting the author review its own plan. Same model, same blind spots.
- Open questions that would change the tasks. Resolve them now; the implementing agent will otherwise pick an answer for you.
- Tasks like "implement the API". Each task should fit one focused session and name its test.
