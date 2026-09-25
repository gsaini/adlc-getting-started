## Change

OpenSpec change: `openspec/changes/<name>/` <!-- link the proposal -->

## How this was built

- [ ] Planned with `/opsx:propose`; a human approved proposal, spec, design, and tasks before implementation
- [ ] Implemented by: <!-- e.g. "Claude Code (all tasks)", "human", "mixed" -->
- [ ] Every task in `tasks.md` is ticked, and every spec scenario has a test

## Verification (the reviewer checks these, not the author)

- [ ] CI green: `pnpm verify` (typecheck, lint, coverage thresholds, openspec validate)
- [ ] Security workflow green (gitleaks, CodeQL, dependency audit)
- [ ] `code-reviewer` and `security-reviewer` findings are recorded in the change's `verification.md` and resolved or accepted
- [ ] Migrations are new files only; the rollback plan in `design.md` still holds
- [ ] (Optional) Acceptance tested through `pnpm tunnel` before merge

## After merge

- [ ] Staging deploy and smoke test passed
- [ ] Production approved in the `production` environment
- [ ] Change archived: `/opsx:archive <name>`
