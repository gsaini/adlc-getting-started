# Phase 1 — Specify: write intent down before code

**Goal:** turn "I want X" into a **testable contract**: requirements with scenarios that state exact inputs and outputs.

## How

```text
/opsx:propose add-expense-groups     # or describe the idea; the agent derives the name
```

The agent reads [`openspec/config.yaml`](../../openspec/config.yaml) (stack, money rules, free-plan limits, artifact rules), asks about anything that would change scope, and writes:

- `proposal.md` — **why**, what changes, capabilities touched, non-goals, and who owns the approval gate.
- `specs/<capability>/spec.md` — a **delta** (`## ADDED` / `MODIFIED` / `REMOVED Requirements`), each requirement with `#### Scenario:` blocks in WHEN/THEN form.

`openspec validate <change> --strict` checks the structure.

## What a good scenario looks like

```markdown
#### Scenario: Leftovers follow member order, not request order
- **WHEN** an expense of `1001` cents includes `"splitAmong":["Chen","Asha"]`
- **THEN** `shares` is `[{"member":"Asha","cents":501},{"member":"Chen","cents":500}]`
```

Concrete input, exact output, a name you can give a test. Compare "splits should be fair" — untestable, and an agent will happily guess.

## The human's job

State the intent, then answer the agent's questions. The agent is good at filling in structure and bad at guessing business rules — if the spec says "fair", ask what fair means *now*, not after the code exists.

## Exit gate

`openspec validate --strict` passes. Then go straight to [Plan](02-plan.md) — the proposal isn't approved on its own.

## Anti-patterns

- Specs that describe implementation ("use a Map", "call the repository"). If it could change without changing observable behavior, it belongs in `design.md`.
- Happy-path-only specs. In this repo's first review, most findings were missing error paths.
- Skipping the non-goals. They are what stops scope creep during implementation.
