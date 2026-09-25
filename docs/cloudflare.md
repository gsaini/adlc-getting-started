# Cloudflare setup (free plan)

Everything this repo runs on Cloudflare fits the **free** plan: Workers, D1, Workers Logs, a `workers.dev` subdomain, and Cloudflare Tunnel. You don't need a credit card or a domain unless you want a named tunnel on your own hostname.

## What runs where

| Piece | Cloudflare product | Free-plan limits that matter here |
|-------|-------------------|-----------------------------------|
| The API | Workers | 100,000 requests/day · 10 ms CPU per request · 100 Workers |
| Its data | D1 (SQLite) | 5,000,000 rows read/day · 100,000 rows written/day · 5 GB total (daily limits reset 00:00 UTC) |
| Logs | Workers Logs | 200,000 events/day, kept 3 days (`observability.enabled` in `wrangler.jsonc`) |
| Staging and production | Two Workers (`--env staging`, `--env production`), each with its own D1 database | as above, shared across the account |
| Acceptance testing | Cloudflare Tunnel (Quick Tunnel) | no account needed; 200 in-flight requests; no SSE; testing only |
| Local development and tests | none — `wrangler dev` and Vitest run the real Workers runtime (`workerd`) with a local D1 | free, offline |

## One-time setup

Do these steps yourself in a terminal. They create credentials, so they are not agent work — the Bash guard hook blocks `wrangler login` for that reason.

1. **Create a free Cloudflare account** and open **Workers & Pages** once, which gives you a free `<you>.workers.dev` subdomain.
2. **Log Wrangler in:** `pnpm exec wrangler login`.
3. **Create the databases:** `pnpm cf:setup`. It shows which account Wrangler is logged in to and asks before creating anything, then creates `adlc-staging` and `adlc-production` and writes their IDs into `wrangler.jsonc`. Re-running it is safe. If you're logged in to more than one account, check which one it shows.
4. **Create an API token** under **My Profile → API Tokens**. Start from the *Edit Cloudflare Workers* template, add **Account → D1 → Edit**, and limit it to this account.
5. **Set up GitHub environments** under **Settings → Environments**. Use **environment** secrets, not repository secrets:

   | Environment | Secrets | Protection rules |
   |-------------|---------|------------------|
   | `staging` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Deployment branches: `main` only |
   | `production` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Deployment branches: `main` only · **Required reviewers**: you |

   **Why environment secrets:** a repository secret is readable by *any* workflow on *any* branch, so someone who could push a workflow file could deploy to production without an approval. An environment secret is only released to a job running in that environment, after its protection rules pass.

   **The limit of one account:** Cloudflare API tokens are scoped to an account, not a Worker. The staging job runs without a reviewer, so its token could deploy production too, if a *merged* change told it to. The production approval therefore protects against unmerged code. Against a malicious *merged* change, the protection is reviewing every merge (the branch ruleset and CODEOWNERS in [Prepare](adlc/00-prepare.md#tripwires-versus-controls)). For hard isolation, run staging in a second free Cloudflare account with its own token.
6. **Log Wrangler out:** `pnpm exec wrangler logout`. Otherwise the OAuth token Wrangler stores on your machine lets anything running as you deploy, including a coding agent that has found a way around the guard hook. CI has its own token.
7. **Commit `wrangler.jsonc` and push to `main`.** [`deploy.yml`](../.github/workflows/deploy.yml) verifies, deploys to staging, smoke-tests it, then waits for your approval before production.

Until steps 3 and 5 are done, the deploy jobs skip with a notice rather than failing, so the repo stays green for anyone who forks it.

## Cloudflare Tunnel

A tunnel exposes a service on your machine to the internet **without opening any inbound port**. `cloudflared` makes an outbound connection to Cloudflare's edge, and Cloudflare forwards public requests to your local service through it. The ADLC uses one for **acceptance testing before merge**: a reviewer tries your local build before it's deployed anywhere.

### Quick Tunnel — free, no account, no domain

```bash
pnpm tunnel                 # wrangler dev + Quick Tunnel; prints https://<random>.trycloudflare.com
pnpm tunnel --smoke         # …and runs the end-to-end smoke test through the public URL
pnpm tunnel --minutes 60    # stays up for 60 minutes (default 30, max 240), then stops by itself
```

Under the hood this is `cloudflared tunnel --url http://localhost:8787`. It's ideal for a short review session. Know the limits:

- **Public and unauthenticated.** Anyone with the URL reaches your local API while the tunnel runs. That's why [`scripts/tunnel.mjs`](../scripts/tunnel.mjs) shuts itself down after 30 minutes by default. Use local test data only.
- **Testing only.** Cloudflare offers no SLA; tunnels allow 200 in-flight requests (then `429`) and don't support Server-Sent Events.
- **No default config file.** A `config.yml` or `config.yaml` in `~/.cloudflared` disables Quick Tunnels. If you run named tunnels, keep their config elsewhere and pass it explicitly (`cloudflared tunnel --config <file> run <name>`).
- **DNS gotcha (we hit it).** `cloudflared` prints the URL a few seconds before the connection registers. If you query the brand-new hostname too early, your OS caches the failed DNS lookup and keeps failing for minutes. The script waits for `Registered tunnel connection` plus a few seconds before its first request.

### Named tunnel + Access — a stable, login-protected URL

For something longer-lived, such as a standing review environment or a demo for a stakeholder, use a **named tunnel** on a domain you have on Cloudflare, with **Cloudflare Access** in front of it. Access is included in the Zero Trust free plan for up to 50 users.

```bash
cloudflared tunnel login                                 # authorize cloudflared for your zone
cloudflared tunnel create adlc-review                    # creates the tunnel + a credentials file
cloudflared tunnel route dns adlc-review review.example.com
```

`review-tunnel.yml` (kept out of `~/.cloudflared`, so Quick Tunnels keep working):

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /Users/<you>/.cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: review.example.com
    service: http://localhost:8787
  - service: http_status:404 # required catch-all
```

```bash
cloudflared tunnel --config review-tunnel.yml run adlc-review
```

Then in **Zero Trust → Access → Applications**, add a *self-hosted* application for `review.example.com` with a policy such as "emails ending in `@yourcompany.com`" (one-time PIN by email works without an identity provider). Only people who pass the policy reach the tunnel.

### Which one when

| Need | Use |
|------|-----|
| "Can you try my branch for 20 minutes?" | Quick Tunnel (`pnpm tunnel`) |
| Receiving a webhook from a third party while developing | Quick Tunnel, briefly |
| A standing review or demo URL for named people | Named tunnel + Access |
| Anything users rely on | Not a tunnel — deploy through [`deploy.yml`](../.github/workflows/deploy.yml) |
