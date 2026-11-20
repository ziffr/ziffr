import { defineConfig } from "vitest/config";

// The GitHub Feed's tests: they need nothing running.
export default defineConfig({ test: { globals: true, include: ["src/**/*.test.ts"], passWithNoTests: true } });
