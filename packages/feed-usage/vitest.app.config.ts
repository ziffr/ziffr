import { defineConfig } from "vitest/config";

// The Usage Feed against the local Postgres and a running app (spec 0031, ticket #366): ZIFFR_TEST_URL (default
// http://localhost:3000) with the local Supabase it uses. Test data is made through the core, like the SDK's tests.
export default defineConfig({ test: { globals: true, include: ["test/**/*.app.test.ts"], setupFiles: ["../core/src/test/db-env.ts"], fileParallelism: false, testTimeout: 60_000 } });
