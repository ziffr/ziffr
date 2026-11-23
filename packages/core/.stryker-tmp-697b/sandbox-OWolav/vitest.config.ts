// @ts-nocheck
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Unit tests of the pure rules; tests against the database (*.db.test.ts) run with vitest.db.config.ts.
// Coverage (spec 0022): every line and branch of the calculation modules runs in a test. Coverage only shows that code
// ran; the references (src/test/reference) show that it is right. The modules are listed once, in
// calculation-modules.json, for coverage and the Calculation Catalogue's test (catalogue.test.ts).
export const CALCULATION_MODULES: string[] = JSON.parse(readFileSync(new URL("./calculation-modules.json", import.meta.url), "utf8"));

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.db.test.ts", "node_modules/**"],
    // The tests against the reference walk many series: more than the default five seconds on a busy machine.
    testTimeout: 300_000,
    coverage: {
      provider: "v8",
      include: [...CALCULATION_MODULES, "src/schedule-calendar.ts"],
      reporter: ["text-summary", "text"],
      thresholds: { perFile: true, lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
