import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// The tests Stryker runs (stryker.config.mjs): the unit tests, without those that read files of the repository outside
// this package (docs/automations, extensions/, scripts/) and test no calculation module; they do not exist in Stryker's sandbox copy.
export default mergeConfig(base, defineConfig({ test: { exclude: ["src/**/*.db.test.ts", "node_modules/**", "src/automation-templates.test.ts", "src/extensions.test.ts"] } }));
