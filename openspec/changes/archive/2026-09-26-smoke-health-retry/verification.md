# Verification log: smoke-health-retry

Every review of this change, by a reviewer that is **not** the author, with how each finding was resolved.
Reviews are run with the read-only agents in `.claude/agents/`.

## 0. Why the change exists

On the first deploy to a new `workers.dev` address (deploy run 36137173585), `GET /health` returned 404 about 0.2 s after `wrangler deploy` finished, and 200 moments later. The smoke script checked only once, so a healthy release failed its smoke test. The staging job was re-run and passed. This change came out of that incident (phase 7 feeding phase 1).

## 1. Plan review — `spec-reviewer`

**Verdict: REVISE.** 1 blocker, 3 major, 6 minor.

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | blocker | `pnpm typecheck` (`tsc -p test`, strict, no `allowJs`) would fail when a `.ts` test imports a `.mjs` helper | Hand-written `scripts/lib/smoke.d.mts` (design decision 1). Rejected: `allowJs`/`checkJs` (widens scope) and `@ts-ignore` |
| 2 | major | The 30 s bound wasn't real: a bare `fetch` can wait about 300 s for headers | Per-attempt `AbortSignal.timeout(min(5 s, time left))`; a timeout counts as a network error; scenario "A request that never responds is aborted" |
| 3 | major | Both "single-shot" scenarios had no test (top-level `smoke.mjs` isn't testable) | The flow moved into `runSmoke()`, which returns `{ ok, message }` instead of exiting; tests count the requests |
| 4 | major | "Health never becomes ready" wasn't exact: no attempt schedule, and no output for the network-error case | Attempts at 0, 0.5, 1.5, 3.5, 7.5, 12.5, 17.5, 22.5, 27.5 and 30 s (10 in total); stderr names the URL and the last status and body, or the last error; scenario "Network errors throughout" |
| 5 | minor | No scenario for a 200 with the wrong body | "200 with the wrong body is not healthy" |
| 6 | minor | Log line format unspecified | Exact format: `health attempt <n>: <observation>, retrying in <ms> ms` |
| 7 | minor | The backoff test came after the implementation (not test-first) | Folded into task 1.1 |
| 8 | minor | An empty `deployment-url` would be retried for 30 s as a "network error" | The base URL is validated before any request; scenario "Invalid base URL fails immediately" |
| 9 | minor | `scripts/**` is outside `coverage.include` | **Accepted**: every scenario has its own test; coverage config and thresholds unchanged |
| 10 | minor | The wrapper's catch-and-exit behaviour was unstated | Stated in task 3.1 |

No second review round was run. The revised artifacts passed `openspec validate --strict`, and the code review (section 4) later mapped every scenario to its test.

## 2. Plan approval

- **Agent gate:** `spec-reviewer` REVISE, with all 10 findings resolved in the artifacts.
- **Human gate:** the repository owner approved the plan in the Claude Code session by starting `/opsx:apply` (2026-09-25). The approval wasn't recorded on GitHub. The planning artifacts were committed on the same branch as the code (`5931e54`), not reviewed on their own planning pull request as `docs/adlc/02-plan.md` describes. Later changes should record the approval on a pull request.

## 3. Implementation (phase 3)

Each task was written test-first, with one commit per task:

- Task 1.1: all 8 health-retry tests failed against a stub, and `tsc -p test` passed.
- Task 2.1: all 5 `runSmoke` tests failed against the stub.
- After each implementation task, `pnpm verify` was green.

Found along the way:

- **The spec contradicted itself.** It required a final attempt at the 30 s deadline, and also required every attempt to be aborted at the deadline, which would give that attempt 0 ms. **Decision:** the final attempt gets a 1 s floor, so the check ends by about 31 s. The spec and design were amended in the same commit as the tests (`7cb4af5`).

Manual checks (tasks 3.1 and 3.2):

- Against `pnpm dev`, the full flow and `--read-only` both exited 0.
- `""` and `"localhost:8787"` were rejected at once, with no request made.
- Against a dead port (`http://localhost:9`), it logged attempts 1–9 with the specified lines, gave up after 10, and exited 1 after 30 s, naming the URL and the last error. The last wait was 2469 ms rather than 2500 ms because of real request latency; the loop never waits past the deadline.

## 4. Code review — `code-reviewer`

**Verdict: PASS WITH FIXES.** 1 major, 4 minor. The backoff, deadline and timeout arithmetic matched the spec exactly. The full-flow and read-only checks were unchanged.

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | major | "Invalid base URL fails immediately" had no automated test; the check sat in the untestable wrapper | Moved into `parseBase()` in the library, with a test per invalid case (`""`, `"not a url"`, no scheme, `ftp:`, query, fragment) |
| 2 | minor | `smoke.d.mts` didn't declare `HealthCheckError`'s real constructor `(last, attempts)` | Declared |
| 3 | minor | Unclear what happens when an attempt itself runs into the deadline | **Spec clarified**: that attempt is the final one. A test pins it (9 attempts when attempt 9 times out at the deadline) |
| 4 | minor | A probe throwing a non-`Error` would crash the log line on `.message` | `error?.message ?? String(error)`, with a test |
| 5 | minor | Write-check failure output changed from `util.inspect` to JSON | **No change needed**: the checks, order and exit codes are unchanged |

## 5. Security review — `security-reviewer`

**Verdict: PASS.** 3 low. No writes reach production (the retry is only for `GET /health`, and production keeps `--read-only`). The run is bounded at about 31 s and 10 requests. Response bodies can't inject GitHub Actions workflow commands, because every log line is single-line and JSON-encoded.

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | low | Failure messages copied the whole response body into CI logs; a wrong URL could return anything | Bodies cut to 500 characters plus `…(truncated)`, in both health and write-check failures; scenario "Long response body is cut in the failure message" |
| 2 | low | Only the health probe has a timeout; write calls and the deploy jobs (no `timeout-minutes`) can hang up to GitHub's 6 h limit | **Deferred**: pre-existing, and editing `deploy.yml` is a non-goal of this change. Owned by the repository owner as a follow-up change (see section 8) |
| 3 | low | The URL check was scheme-only: credentials would be printed, and a query or fragment would swallow the path | `parseBase` rejects credentials (without echoing them), query strings and fragments, and rebuilds `base` from the parsed URL |

Also noted, outside this change: `actions/checkout` and `actions/setup-node` are pinned by tag, not SHA. And `--read-only` is opt-in, so running the script against production without it would write a throwaway group.

## 6. Pull request review (#2)

- **Amazon Q Developer** left two inline comments. Both were false positives, and its own summary review withdrew them:
  - *line 63*: it proposed checking the deadline before the attempt. That would skip the specified final attempt, fail two tests, and read a variable before it's declared.
  - *line 130*: it said the `reduce` lacked an initial value. It already starts at `0`, and the suggested `?? 0` would let a response with no balances array pass the check.

  Both were answered on the pull request and the threads resolved.
- **GitHub Advanced Security (AI review)** failed with `CAPIError: 400 The requested model is not supported`. That's a GitHub-side service error, not a finding.
- All repository checks passed: `verify`, secret scan, CodeQL, dependency audit, dependency review, and the Claude `review`.

## 7. Release

Deploy run 36139614406 (merge of #2):

- Staging: the full-flow smoke test passed, with health ready on the first attempt.
- Production: approved by `gsaini` through the `production` environment, and the read-only smoke test passed.

The change was archived on 2026-09-26.

## 8. What's left for a human

- **A follow-up change** for security finding 2 and the notes after it:
  - timeouts on the smoke script's write calls
  - `timeout-minutes` on the deploy jobs
  - SHA pins for `actions/checkout`, `actions/setup-node`, `github/codeql-action` and `actions/dependency-review-action`
  - an explicit `--write` flag instead of relying on `--read-only`
