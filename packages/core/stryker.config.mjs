// Mutation testing of the calculation modules (spec 0022, Testing Decisions; docs/guides/calculation-tests.md):
// Stryker changes the code on purpose (a `<` into `<=`, a `+` into `-`) and runs the tests that cover the change;
// a change no test notices is a gap in the tests. The modules are the ones coverage holds to 100 %
// (calculation-modules.json). `pnpm --filter @ziffr/core test:mutation` runs all of them, as the nightly run and the
// release do, and keeps the results (`--incremental --force`) for later runs to start from.
import { readFileSync } from "node:fs";

const modules = JSON.parse(readFileSync(new URL("./calculation-modules.json", import.meta.url), "utf8"));

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: modules,
  // Only the tests that run a mutant's line run for it.
  coverageAnalysis: "perTest",
  // Code that runs once when a module loads (tables, constants) is covered by every test; leave it out.
  ignoreStatic: true,
  // The score the calculation modules must keep (spec 0022): a run below it fails.
  thresholds: { high: 98, low: 95, break: 95 },
  reporters: ["clear-text", "progress", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  // What each mutant did, for the next run with --incremental: a pull request's run starts from the nightly one's.
  incrementalFile: "reports/stryker-incremental.json",
  tempDirName: ".stryker-tmp",
  cleanTempDir: "always",
  timeoutMS: 60_000,
  // How many test processes run at once. Stryker's default, one per core less one, left a 4-core GitHub runner no
  // headroom: it stopped answering an hour into the release of 0.10.0. The workflows set 2; a laptop keeps the default.
  ...(process.env.STRYKER_CONCURRENCY ? { concurrency: Number(process.env.STRYKER_CONCURRENCY) } : {}),
  // The first run of every test, before any mutant, takes about 10 minutes on a laptop: the generated tests are many.
  dryRunTimeoutMinutes: 45,
};
