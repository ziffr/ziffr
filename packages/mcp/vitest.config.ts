import { defineConfig } from "vitest/config";

// The MCP server's tests that need nothing running. The ones against the app have their own config (vitest.app.config.ts).
export default defineConfig({ test: { globals: true, include: ["src/**/*.test.ts"], passWithNoTests: true } });
