import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
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

// Nor can a test load whose imports lead outside this package (a JSON file under docs/, say), however many modules lie
// between: Stryker runs only the tests related to the modules a change touches, so such a chain stops the run of whichever
// change first reaches it. The imports are followed by their relative paths; a type is not loaded and not followed.
const here = fileURLToPath(new URL("./", import.meta.url));
const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.[^"'\n]*)["']/g;
const followed = new Map<string, boolean>();
function importsOutside(file: string): boolean {
  const known = followed.get(file);
  if (known !== undefined) return known;
  // Taken as inside while its own imports are followed, so modules that import each other end.
  followed.set(file, false);
  const text = readFileSync(file, "utf8").replace(/^(?:import|export) type [^;]*;/gm, "");
  const outside = [...text.matchAll(IMPORT)].some(([, path]) => {
    const to = resolve(dirname(file), path);
    if (!`${to}${sep}`.startsWith(here)) return true;
    const module = [to, `${to}.ts`, `${to}.tsx`, join(to, "index.ts")].find((f) => /\.tsx?$/.test(f) && existsSync(f) && statSync(f).isFile());
    return module !== undefined && importsOutside(module);
  });
  followed.set(file, outside);
  return outside;
}
const loadsOutside = readdirSync(new URL("./src/", import.meta.url), { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".test.ts") && !f.endsWith(".db.test.ts"))
  // Each test is followed afresh: an answer found inside a cycle holds only for the walk that found it.
  .filter((f) => (followed.clear(), importsOutside(join(here, "src", f))))
  .map((f) => `src/${f.split(sep).join("/")}`);

export default mergeConfig(base, defineConfig({ test: { exclude: [...readsOutside, ...loadsOutside, "src/**/*.db.test.ts", "node_modules/**", "src/automation-templates.test.ts", "src/demo-visiting.test.ts", "src/included-packs.test.ts", "src/demo-words-columns.test.ts", "src/personal-webhooks-surface.test.ts", "src/trial-limits.test.ts", "src/n8n-workflow.test.ts", "src/extensions.test.ts", "src/recipe-calibration.test.ts", "src/methods/heads-up-simulation.test.ts", "src/methods/heads-up-single-simulation-a.test.ts", "src/methods/heads-up-single-simulation-b.test.ts", "src/methods/heads-up-single-simulation-c.test.ts"] } }));
