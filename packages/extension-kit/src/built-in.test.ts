// The Extensions built into Ziffr (spec 0042, ticket 3; GLOSSARY: Extension, Extension Kit) pass every check the Kit holds an
// author to, the same as one submitted from outside: shape, static rules, then the checks that run the code, mutation included.
// They are the folders under extensions/<author>/<name>; the registry in the core lists the same folders.
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkExtensionFiles, problemLine } from "./check.js";
import { checkManifest } from "./manifest.js";
import { runChecks } from "./run-checks.js";
import { readExtensionFolder } from "./run.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../extensions");
const FOLDERS = readdirSync(ROOT, { withFileTypes: true })
  .filter((a) => a.isDirectory())
  .flatMap((a) => readdirSync(join(ROOT, a.name), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `${a.name}/${e.name}`))
  .sort();
const SLOW = 900_000;

describe("the Extensions built into Ziffr", () => {
  it("are found, so that this test cannot pass on an empty folder", () => {
    expect(FOLDERS).toEqual(expect.arrayContaining(["ziffr/quantile", "ziffr/top-share"]));
  });

  it.each(FOLDERS)("%s has the right shape and passes the static rules, and its folder is its id", (folder) => {
    const files = readExtensionFolder(join(ROOT, folder));
    expect(checkExtensionFiles(files).map(problemLine)).toEqual([]);
    const manifest = checkManifest(files.get("extension.json") ?? "");
    expect(manifest.ok && manifest.manifest.id).toBe(folder);
  });

  it.each(FOLDERS)("%s passes the checks that run its code: determinism, budget, refusals, reference, coverage and mutation", async (folder) => {
    const files = readExtensionFolder(join(ROOT, folder));
    const manifest = checkManifest(files.get("extension.json") ?? "");
    if (!manifest.ok) throw new Error(`${folder}: the manifest is wrong`);
    const problems = await runChecks(files, manifest.manifest, { mutation: process.env.EXTENSIONS_NO_MUTATION === undefined });
    expect(problems.map(problemLine)).toEqual([]);
  }, SLOW);
});
