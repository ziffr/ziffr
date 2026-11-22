import { defineConfig } from "vitest/config";

// The SDK's tests that need nothing running, and the check that every example in the docs is marked. The ones against
// the app have their own config (vitest.app.config.ts).
export default defineConfig({ test: { globals: true, include: ["src/**/*.test.ts", "test/docs-blocks.test.ts"], passWithNoTests: true } });
