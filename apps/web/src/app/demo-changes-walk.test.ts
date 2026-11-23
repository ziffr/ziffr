// Every server action is classified for the demo (GLOSSARY: Demo Mode; spec 0051, ticket 4), without a database: the
// source of every "use server" file is read for its exported functions, and each must be in packages/core/src/demo-changes.ts
// (and nothing there may name an action that is gone). A new server action fails here until someone says what it does in
// the demo. The walk that calls each one as a visitor is demo-read-only.db.test.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { demoAllows, demoClassOf, demoOperations } from "@ziffr/core/demo-changes";

const APP = __dirname;
const sourceFiles = (function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
})(APP);

/** The functions every "use server" file exports, as the walk keys them: "file-without-extension:name". */
function serverActions(): string[] {
  const keys: string[] = [];
  for (const file of sourceFiles) {
    const text = readFileSync(file, "utf8");
    if (!/^\s*["']use server["']/.test(text)) continue;
    for (const m of text.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) keys.push(`${relative(APP, file).replace(/\.tsx?$/, "")}:${m[1]}`);
    // A server action can also be an exported constant or a list of names; none is today, and one would need its own line here.
    expect(text.match(/^export\s+(?:const|let|var|\{|default)/gm) ?? [], `${file} exports something that is not a function declaration`).toEqual([]);
  }
  return keys.sort();
}

describe("the demo's classification of server actions", () => {
  it("names every server action and none that is gone", () => {
    const actions = serverActions();
    const known = demoOperations();
    expect(actions.filter((k) => !known.includes(k)), "unclassified: add each to packages/core/src/demo-changes.ts").toEqual([]);
    expect(known.filter((k) => !actions.includes(k)), "classified but gone: remove from packages/core/src/demo-changes.ts").toEqual([]);
  });

  it("blocks every change today and gives every blocked one its reason", () => {
    for (const key of demoOperations()) {
      const c = demoClassOf(key);
      expect(c, key).not.toBeNull();
      expect(["reads", "outside", "blocked"], `${key} is ${c?.class}; nothing is open yet`).toContain(c?.class);
      if (c?.class === "blocked") expect(c.reason).toBeTruthy();
    }
  });

  it("allows nothing, with the setting off or in effect, and nothing that is not classified", () => {
    const on = { ZIFFR_DEMO_ONLY: "1", ZIFFR_DEMO_CHANGES: "1" };
    for (const key of demoOperations()) {
      expect(demoAllows(key, {}), key).toBe(false);
      expect(demoAllows(key, on), key).toBe(false);
    }
    expect(demoAllows("made-up-actions:doSomething", on)).toBe(false);
  });
});
