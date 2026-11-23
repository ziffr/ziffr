// @ts-nocheck
import base from "./stryker.config.mjs";

// A local run on the what-if files with only the tests that cover them (not committed): MUTATE says which file or lines.
export default { ...base, vitest: { configFile: "vitest.mutation.local.config.ts" }, mutate: [process.env.MUTATE], incrementalFile: `reports/stryker-local-${process.env.MUTATE.replace(/[^a-z0-9]/gi, "_")}.json`, tempDirName: ".stryker-tmp-697b" };
