import { defineConfig } from "vitest/config";

// The formatter's tests: one table of values, Number Styles, units and period kinds.
export default defineConfig({ test: { globals: true, include: ["src/**/*.test.ts"], passWithNoTests: true } });
