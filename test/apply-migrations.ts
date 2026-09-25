import { applyD1Migrations, env } from "cloudflare:test";

// Each test file gets a fresh, isolated D1; bring it to the current schema first.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
