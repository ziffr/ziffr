import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkManifest, EXTENSION_SCHEMA } from "./manifest.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const GOOD = readFileSync(join(ROOT, "packages/extension-kit/test/good/example/extension.json"), "utf8");
const change = (fn: (m: Record<string, any>) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = JSON.parse(GOOD);
  fn(m);
  return JSON.stringify(m, null, 2);
};

describe("the published schema", () => {
  // The schema in docs/reference is generated from the definition the checks run, never written by hand.
  // UPDATE_REFERENCE=1 writes it.
  it("docs/reference/extension.schema.json is the one the checks run", () => {
    const path = join(ROOT, "docs/reference/extension.schema.json");
    const generated = `${JSON.stringify(EXTENSION_SCHEMA, null, 2)}\n`;
    if (process.env.UPDATE_REFERENCE) writeFileSync(path, generated);
    expect(readFileSync(path, "utf8")).toBe(generated);
  });
});

describe("the manifest check", () => {
  it("takes the good example", () => {
    const res = checkManifest(GOOD);
    expect(res.ok).toBe(true);
  });

  it("takes a mark that gives shapes, and refuses one that does not", () => {
    const mark = (gives: string) => change((m) => { m.kind = "mark"; m.signature.gives = gives; });
    expect(checkManifest(mark("shapes")).ok).toBe(true);
    const bad = checkManifest(mark("value"));
    expect(bad.ok ? [] : bad.problems.map((p) => p.path)).toEqual(["signature.gives"]);
  });

  it("refuses a mark that names nothing to draw", () => {
    const bad = checkManifest(change((m) => { m.kind = "mark"; m.signature.gives = "shapes"; m.signature.inputs = []; }));
    expect(bad.ok ? [] : bad.problems.map((p) => p.path)).toEqual(["signature.inputs"]);
  });

  it("refuses a name used twice, and a default outside the range", () => {
    const twice = checkManifest(change((m) => { m.signature.params = [{ name: "series", min: 1, max: 5, default: 2 }]; }));
    expect(twice.ok ? [] : twice.problems.map((p) => p.path)).toEqual(["signature.params[0].name"]);
    const outside = checkManifest(change((m) => { m.signature.params = [{ name: "window", min: 1, max: 5, default: 9 }]; }));
    expect(outside.ok ? [] : outside.problems.map((p) => p.path)).toEqual(["signature.params[0].default"]);
  });

  it("refuses a text with a web address or markup", () => {
    expect(checkManifest(change((m) => { m.summary = "See https://evil.example now"; })).ok).toBe(false);
    expect(checkManifest(change((m) => { m.name = "<b>x</b>"; })).ok).toBe(false);
  });

  it("names the line of each problem", () => {
    const res = checkManifest(change((m) => { m.version = "1.0"; }));
    const line = GOOD.length && JSON.stringify(JSON.parse(GOOD), null, 2).split("\n").findIndex((l) => l.includes('"version"')) + 1;
    expect(res.ok ? [] : res.problems.map((p) => p.line)).toEqual([line]);
  });
});
