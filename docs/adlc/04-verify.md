# Phase 4 — Verify: someone else checks the work

**Goal:** establish, independently of the author, that the code does what the spec says — every scenario, not just the happy path.

## Two layers

1. **Mechanical** — `pnpm verify`, run by the Stop hook locally and by [CI](../../.github/workflows/ci.yml) on every PR:
   - `tsc` (strict, `noUncheckedIndexedAccess`) for the Worker and the tests
   - Biome lint and format
   - Vitest **inside workerd** against a local D1, with coverage thresholds (lines 90%, branches 85%)
   - `openspec validate --all --strict`
2. **Judgment** — the read-only `code-reviewer` agent:

   ```text
   > use the code-reviewer agent on add-expense-groups
   ```

   It builds a **scenario → test table** for every scenario in the spec, then reads the code for bugs the tests miss: partial writes, off-by-one, case handling, ordering, rounding. It can run `pnpm test` but cannot edit anything.

## Record it

Findings and resolutions go into the change's `verification.md`, next to the plan review. That file is the audit trail a human reads at PR time — faster than re-reviewing the code from scratch, and it shows what was checked, not just that something was.

## Why a separate reviewer works

The implementing agent has already rationalized every decision it made. A fresh reviewer with a checklist, no edit tools, and the spec as its reference reads the code the way a stranger would. In this repo that caught real issues — see [`verification.md`](../../openspec/changes/archive/2026-09-25-add-expense-groups/verification.md).

## Exit gate

Every scenario has a test that asserts its stated outcome; every finding is fixed or explicitly accepted; `pnpm verify` is green.

## Anti-patterns

- Coverage as the goal. 100% coverage with no assertions verifies nothing; the scenario table is the real measure.
- Asking the implementer "did you test everything?" It will say yes.
