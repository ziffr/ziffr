import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// The tests Stryker runs (stryker.config.mjs): the unit tests, without those that read files of the repository outside
// this package (docs/automations) and test no calculation module; they do not exist in Stryker's sandbox copy. Nor the
// false-discovery simulation of the Heads-ups (spec 0041): it runs minutes, so every mutant would, and it is a check of the whole
// path, the pieces having tests of their own.
export default mergeConfig(base, defineConfig({ test: { exclude: ["src/**/*.db.test.ts", "node_modules/**", "src/automation-templates.test.ts", "src/methods/heads-up-simulation.test.ts"] } }));
