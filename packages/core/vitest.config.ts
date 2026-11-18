import { defineConfig } from "vitest/config";

// Unit tests of the pure rules; tests against the database (*.db.test.ts) run with vitest.db.config.ts.
// Coverage (spec 0022): every line and branch of the calculation modules runs in a test. Coverage only shows that code
// ran; the references (src/test/reference) show that it is right. The other calculation modules join the list as
// they reach 100 % (#126): numbers, formula, format, parse, correlation, workflow-rules and the forecast.
export const CALCULATION_MODULES = ["src/display-periods.ts", "src/periods.ts", "src/snapshot-periods.ts", "src/compare.ts"];

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.db.test.ts", "node_modules/**"],
    // The tests against the reference walk many series: more than the default five seconds on a busy machine.
    testTimeout: 300_000,
    coverage: {
      provider: "v8",
      include: CALCULATION_MODULES,
      reporter: ["text-summary", "text"],
      thresholds: { perFile: true, lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
