import type { D1Migration } from "@cloudflare/vitest-plugin";

// Test-only binding injected by vitest.config.mts.
declare global {
	namespace Cloudflare {
		interface Env {
			TEST_MIGRATIONS: D1Migration[];
		}
	}
}
