import { defineConfig } from "vitest/config";

// The MCP server's tests that need nothing running (src and test/*.test.ts). The ones against the app have their own config (vitest.app.config.ts).
export default defineConfig({ test: { globals: true, include: ["src/**/*.test.ts", "test/**/*.test.ts"], exclude: ["test/**/*.app.test.ts", "**/node_modules/**"], passWithNoTests: true } });
