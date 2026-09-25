# Phase 6 — Release: humans approve, pipelines deploy

**Goal:** get verified code to users in steps that can each be checked and stopped — and never let the agent deploy.

## The path

```text
PR ──► CI + Security (+ optional Claude review) ──► human review ──► merge
                                                                        │
    ┌───────────────────────────────────────────────────────────────────┘
    ▼
deploy.yml: verify ─► staging (auto): D1 migrations → deploy → full smoke test
                          │
                          ▼
                  production (waits for approval in the "production" environment)
                          │  D1 migrations → deploy → read-only smoke test
                          ▼
                     /opsx:archive <change>   — the spec becomes the source of truth
```

## 1. Acceptance before merge: share your local build with a Cloudflare Tunnel

Reviewers (or a product owner) can try a change **before it exists anywhere but your laptop**:

```bash
pnpm tunnel            # wrangler dev + a Cloudflare Quick Tunnel → https://<random>.trycloudflare.com
pnpm tunnel --smoke    # …and run the end-to-end smoke test through the public URL
```

A **Quick Tunnel** is free and needs no Cloudflare account, no domain, and no open inbound ports: `cloudflared` makes an outbound connection to Cloudflare, which proxies the random URL to `localhost:8787`. It's ideal for a 20-minute acceptance session. Details, limits, and the step up to named tunnels with Cloudflare Access are in [Cloudflare setup](../cloudflare.md#cloudflare-tunnel).

> The URL is public and unauthenticated while the tunnel runs. Local test data only; stop it when the session ends.

## 2. The PR

Open it with the [PR template](../../.github/pull_request_template.md). It asks *how* the change was built (who implemented it, whether the plan was approved) and points the reviewer at `verification.md` — a reviewer who reads the log first spends their time on judgment, not re-discovery.

If an `ANTHROPIC_API_KEY` secret is set, [`claude-review.yml`](../../.github/workflows/claude-review.yml) adds inline review comments. It is a **second** reviewer, never a replacement for the human one.

## 3. Staging, then production

[`deploy.yml`](../../.github/workflows/deploy.yml) runs on every push to `main`:

- **verify** — the full CI gate again, on the merged code.
- **staging** — applies new D1 migrations to the staging database, deploys the `staging` Worker, and runs the full smoke test (throwaway data).
- **production** — waits for approval by a required reviewer on the `production` GitHub environment, then migrates, deploys, and runs a **read-only** smoke test.

Everything runs on Cloudflare's free plan. Until you run `pnpm cf:setup` and add the two secrets, the deploy jobs skip with a notice instead of failing. See [Cloudflare setup](../cloudflare.md).

## 4. Archive

```text
/opsx:archive add-expense-groups
```

The change's spec deltas merge into `openspec/specs/`, and the change folder moves to `openspec/changes/archive/<date>-<name>/` with its proposal, design, tasks, and verification log intact. The next change is written against the updated spec.

## Exit gate

Staging and production smoke tests pass; the change is archived.

## Anti-patterns

- "The agent can deploy staging, it's harmless." Staging deploys run migrations. The agent is blocked from both.
- Skipping staging because the change is small. Small is when nobody looks closely.
- Migrations that break the running version. Deploy order is *migrate, then deploy*, so every migration must work with the code that's already live (add columns and tables first; remove them in a later release).
