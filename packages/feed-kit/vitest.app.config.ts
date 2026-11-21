import { defineConfig } from "vitest/config";
import "../core/src/test/serial-files";

// The feed kit's runner against a running app (spec 0012, testing decisions): ZIFFR_TEST_URL (default
// http://localhost:3000) with the local Supabase it uses. Test data is made through the core, like the SDK's tests.
export default defineConfig({ test: { globals: true, include: ["test/**/*.app.test.ts"], setupFiles: ["../core/src/test/db-env.ts"], fileParallelism: false, testTimeout: 60_000 } });
