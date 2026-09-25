#!/usr/bin/env node
// Reset the LOCAL development database (used by `pnpm dev` and `pnpm tunnel`) and
// re-apply migrations/. Touches nothing but .wrangler/state/v3/d1 in this repo.
// Tests don't need this: every test already starts from a fresh, migrated D1.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

rmSync(".wrangler/state/v3/d1", { recursive: true, force: true });
const migrate = spawnSync("pnpm", ["db:migrate:local"], { stdio: "inherit" });
process.exit(migrate.status ?? 1);
