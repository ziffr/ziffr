// Mutation testing of the Kit's rules and checks: Stryker changes each condition on purpose and a test must fail. A
// mutant no test notices is a gap in the tests of the checker itself. `pnpm --filter @ziffr/extension-kit test:mutation`.
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: ["src/rules.ts", "src/check.ts", "src/manifest.ts"],
  // The tests read the Extensions under test/ as text: Stryker must not put a comment on their first line.
  disableTypeChecks: false,
  coverageAnalysis: "perTest",
  ignoreStatic: true,
  thresholds: { high: 95, low: 90, break: 90 },
  reporters: ["clear-text", "progress"],
  tempDirName: ".stryker-tmp",
  cleanTempDir: "always",
  timeoutMS: 60_000,
};
