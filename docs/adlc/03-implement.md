# Phase 3 — Implement: the agent works, the rails hold

**Goal:** turn the approved tasks into code, test-first, with no human in the inner loop.

## How

```text
/opsx:apply add-expense-groups
```

For each task the agent follows [`CLAUDE.md`](../../CLAUDE.md): read the task and its scenarios → write the failing test named after the scenario → write the simplest code that fits `design.md` → run `pnpm verify` → tick the box.

## What keeps it on the rails

| Moment | Mechanism |
|--------|-----------|
| Before every shell command | `guard-bash.mjs` denies deploys, remote D1, force-push, `--no-verify`, … |
| After every file edit | `format-file.mjs` runs Biome and feeds problems back immediately |
| When the agent tries to finish | `verify-on-stop.mjs` runs `pnpm verify`; on failure the agent is told why and keeps going |
| Always | Tests run inside the real Workers runtime against a local D1: no account, no network, no cost |

## Why tests first matters more with agents

An agent writing code and tests together will make them agree — including on the bug. A test written from the scenario *before* the code exists encodes the spec, not the implementation. The review in [Phase 4](04-verify.md) then checks that every scenario has such a test.

## The human's job

Stay out of the loop. Interrupt only if the agent asks, or if it proposes changing the spec — that's a new round of [Plan](02-plan.md), not an implementation detail.

## Exit gate

All tasks ticked; the Stop hook lets the agent finish (so `pnpm verify` is green).

## Anti-patterns

- "Just make the tests pass" — the agent may weaken the test. `CLAUDE.md` forbids it; the reviewer checks for it.
- Editing an applied migration instead of adding a new one.
- Scope creep ("while I was there I also added…"). Anything not in `tasks.md` is a new change.
