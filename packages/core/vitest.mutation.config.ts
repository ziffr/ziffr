import { readdirSync, readFileSync } from "node:fs";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// The tests Stryker runs (stryker.config.mjs): the unit tests, without those that read files of the repository outside
// this package (docs/automations, extensions/, scripts/) and test no calculation module; they do not exist in Stryker's sandbox copy.
// Nor the false-discovery simulation of the Heads-ups (spec 0041): it runs minutes, so every mutant would, and it is a check of the
// whole path, the pieces having tests of their own.
// Any other test that reads a migration, a doc or the web app by a path of its own (not through test/repo-file.ts, which finds the repository root from
// the sandbox too) cannot run in the copy either: it is found by what it reads, so a new one does not stop the run.
const readsOutside = readdirSync(new URL("./src/", import.meta.url))
  .filter((f) => f.endsWith(".test.ts") && !f.endsWith(".db.test.ts"))
  .filter((f) => {
    const text = readFileSync(new URL(`./src/${f}`, import.meta.url), "utf8");
    return /supabase\/migrations|\.\.\/\.\.\/\.\.\//.test(text) && !text.includes("repoFile");
  })
  .map((f) => `src/${f}`);
export default mergeConfig(base, defineConfig({ test: { exclude: [...readsOutside, "src/**/*.db.test.ts", "node_modules/**", "src/automation-templates.test.ts", "src/demo-visiting.test.ts", "src/included-packs.test.ts", "src/demo-words-columns.test.ts", "src/personal-webhooks-surface.test.ts", "src/trial-limits.test.ts", "src/n8n-workflow.test.ts", "src/extensions.test.ts", "src/recipe-calibration.test.ts", "src/methods/heads-up-simulation.test.ts", "src/methods/heads-up-single-simulation-a.test.ts", "src/methods/heads-up-single-simulation-b.test.ts", "src/methods/heads-up-single-simulation-c.test.ts"] } }));
