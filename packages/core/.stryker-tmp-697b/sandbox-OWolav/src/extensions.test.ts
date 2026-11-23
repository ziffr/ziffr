// @ts-nocheck
// The registry of the Extensions built into Ziffr (spec 0042, ticket 3; GLOSSARY: Extension): it lists exactly the folders under
// extensions/<author>/<name>, is the file the generator writes, holds each folder's manifest as it is, and its Takeaway
// wording is the core's own.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUILT_IN_EXTENSIONS, builtInMethod } from "./extensions";
import { repoFile } from "./test/repo-file";
import { WORDING, type CaseKey } from "./takeaways/wording";

const ROOT = fileURLToPath(repoFile("extensions/"));
const dirs = (path: string) => readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "node_modules").map((e) => e.name);
/** The folders of the Extensions, as `author/name`. */
const folders = () => dirs(ROOT).flatMap((author) => dirs(`${ROOT}${author}`).map((name) => `${author}/${name}`)).sort();
const ids = () => BUILT_IN_EXTENSIONS.map((e) => e.id as string).sort();

/** What is wrong between the folders and the ids a registry names: a folder missing from it, an id with no folder. */
function registryProblems(found: string[], listed: string[]): string[] {
  return [
    ...found.filter((f) => !listed.includes(f)).map((f) => `extensions/${f} is not in the registry: run node scripts/generate-extensions.mjs`),
    ...listed.filter((i) => !found.includes(i)).map((i) => `the registry names ${i}, but there is no folder extensions/${i}`),
  ];
}

describe("the registry of built-in Extensions", () => {
  it("lists every Extension folder, and only those", () => {
    expect(registryProblems(folders(), ids())).toEqual([]);
    expect(folders()).toEqual(expect.arrayContaining(["ziffr/quantile", "ziffr/top-share"]));
  });

  it("notices a folder that is missing from it, and an id with no folder", () => {
    expect(registryProblems(["a/b", "a/c"], ["a/b"])).toEqual(["extensions/a/c is not in the registry: run node scripts/generate-extensions.mjs"]);
    expect(registryProblems(["a/b"], ["a/b", "a/phantom"])).toEqual(["the registry names a/phantom, but there is no folder extensions/a/phantom"]);
    expect(registryProblems(["a/b"], ["a/b"])).toEqual([]);
  });

  it("is the file the generator writes from the folders (a stale registry fails here)", async () => {
    const { renderRegistry } = (await import(repoFile("scripts/generate-extensions.mjs").href)) as { renderRegistry: () => string };
    expect(readFileSync(new URL("./extensions.ts", import.meta.url), "utf8")).toBe(renderRegistry());
  });

  it.each(folders())("%s: the manifest in the registry is the manifest in the folder, with its id and a LICENSE of the folder's own", (folder) => {
    const entry = BUILT_IN_EXTENSIONS.find((e) => e.id === folder);
    expect(entry?.manifest).toEqual(JSON.parse(readFileSync(`${ROOT}${folder}/extension.json`, "utf8")));
    expect(entry?.manifest.id).toBe(folder);
    for (const file of ["method.ts", "reference.ts", "cases.ts", "catalogue.md", "wording.ts", "LICENSE"]) expect(existsSync(`${ROOT}${folder}/${file}`), `${folder}/${file}`).toBe(true);
  });

  it.each(folders())("%s: its Takeaway wording is the core's words, key for key", async (folder) => {
    const { wording } = (await import(`@ziffr/extensions/${folder}/wording`)) as { wording: Record<string, string> };
    expect(Object.keys(wording).length).toBeGreaterThan(0);
    for (const [key, text] of Object.entries(wording)) expect(text, `${folder}: ${key}`).toBe(WORDING.en[key as CaseKey]);
  });

  it("gives each Method by its id, with the signature it has", () => {
    expect(builtInMethod("ziffr/quantile")([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(builtInMethod("ziffr/top-share")([{ label: "A", value: 3 }, { label: "B", value: 1 }], 1)).toMatchObject({ share: 0.75, percent: 75 });
  });
});
