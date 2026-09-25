import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside the real Workers runtime (workerd) with a local D1 —
// no Cloudflare account, no network, no cost.
const migrations = await readD1Migrations("./migrations");

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
		}),
	],
	test: {
		setupFiles: ["./test/apply-migrations.ts"],
		coverage: {
			provider: "istanbul", // v8 coverage is not available inside workerd
			include: ["src/**/*.ts"],
			thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
		},
	},
});
