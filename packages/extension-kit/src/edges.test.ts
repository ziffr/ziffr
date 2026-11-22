// Tests of the checker's own edges, written from a mutation run: each one pins a condition that a change of the code
// (a `<` into `<=`, an `&&` into `||`) must not survive.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkExtensionFiles, problemLine } from "./check.js";
import { checkManifest } from "./manifest.js";
import { checkRules, type RuleName } from "./rules.js";
import { readExtensionFolder } from "./run.js";

const TEST = join(dirname(fileURLToPath(import.meta.url)), "../test");
const GOOD = readExtensionFolder(join(TEST, "good/example"));
const lines = (files: Map<string, string>) => checkExtensionFiles(files).map(problemLine);
const rules = (src: string, o?: { wording?: boolean; code?: boolean }): RuleName[] => [...new Set(checkRules("x.ts", src, o).map((p) => p.rule))].sort() as RuleName[];
const withFiles = (changes: Record<string, string | null>) => {
  const files = new Map(GOOD);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) files.delete(k);
    else files.set(k, v);
  }
  return files;
};
const manifest = (fn: (m: Record<string, any>) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = JSON.parse(GOOD.get("extension.json")!);
  fn(m);
  return `${JSON.stringify(m, null, 2)}\n`;
};
const APACHE = "Apache License\nVersion 2.0, January 2004\n";

describe("every problem of every bad Extension, as the command writes it", () => {
  it("says what is wrong, in words, with its file and line", () => {
    const out: Record<string, string[]> = {};
    for (const name of readdirSync(join(TEST, "bad")).sort()) {
      const files = new Map(GOOD);
      const dir = join(TEST, "bad", name);
      const meta = JSON.parse(readFileSync(join(dir, "bad.json"), "utf8")) as { remove: string[]; stage?: string };
      // The Extensions only running them shows to be wrong pass the static checks; run-checks.test.ts holds them.
      if (meta.stage === "run") continue;
      for (const f of readdirSync(dir)) if (f !== "bad.json") files.set(f, readFileSync(join(dir, f), "utf8"));
      for (const f of meta.remove) files.delete(f);
      out[name] = lines(files);
    }
    expect(out).toMatchSnapshot();
  });
});

describe("the shape", () => {
  it("takes a mark: mark.ts is its implementation, and method.ts beside it is refused", () => {
    const mark = manifest((m) => { m.kind = "mark"; m.signature.gives = "shapes"; });
    const files = withFiles({ "extension.json": mark, "mark.ts": GOOD.get("method.ts")!, "method.ts": null });
    expect(lines(files)).toEqual([]);
    files.set("method.ts", "export const a = 1;\n");
    expect(lines(files)).toEqual(["method.ts:1: is here, but extension.json says this is a mark: it has mark.ts."]);
  });

  it("asks a mark for mark.ts, not method.ts", () => {
    const mark = manifest((m) => { m.kind = "mark"; m.signature.gives = "shapes"; });
    expect(lines(withFiles({ "extension.json": mark }))).toEqual(["method.ts:1: is here, but extension.json says this is a mark: it has mark.ts.", "mark.ts: is missing: the implementation of a mark."]);
  });

  it("accepts the Apache licence when the manifest names it, and not the MIT text then", () => {
    const apache = manifest((m) => { m.license = "Apache-2.0"; });
    expect(lines(withFiles({ "extension.json": apache, LICENSE: APACHE }))).toEqual([]);
    expect(lines(withFiles({ "extension.json": apache }))).toEqual(["LICENSE:1: is not the Apache-2.0 licence that extension.json names."]);
    expect(lines(withFiles({ LICENSE: APACHE }))).toEqual(["LICENSE:1: is not the MIT licence that extension.json names."]);
    expect(lines(withFiles({ "extension.json": apache, LICENSE: "Apache License\nVersion 1.0\n" }))).toHaveLength(1);
    expect(lines(withFiles({ "extension.json": apache, LICENSE: "Version 2.0\n" }))).toHaveLength(1);
  });

  it("takes an MIT text that starts after blank lines, and refuses one that does not start with the name", () => {
    expect(lines(withFiles({ LICENSE: `\n\n  MIT License\n\ntext\n` }))).toEqual([]);
    expect(lines(withFiles({ LICENSE: "The MIT License\n" }))).toHaveLength(1);
    expect(lines(withFiles({ LICENSE: "x\nMIT License\n" }))).toHaveLength(1);
  });

  it("does not look at the licence of an empty file twice", () => {
    expect(lines(withFiles({ LICENSE: "  \n" }))).toEqual(["LICENSE:1: is empty."]);
  });

  it("refuses an empty implementation as empty, not as too long", () => {
    expect(lines(withFiles({ "method.ts": "\n" }))).toEqual(["method.ts:1: is empty."]);
    expect(lines(withFiles({ "method.ts": "" }))).toEqual(["method.ts:1: is empty."]);
  });

  it("counts lines without the final line break", () => {
    const body = (n: number, end: string) => `${Array.from({ length: n }, () => "// x").join("\n")}${end}`;
    expect(lines(withFiles({ "method.ts": body(400, "\n") }))).toEqual([]);
    expect(lines(withFiles({ "method.ts": body(400, "") }))).toEqual([]);
    expect(lines(withFiles({ "method.ts": body(401, "\n") }))).toEqual(["method.ts:401: has 401 lines; at most 400 are allowed, so that a person can read it all."]);
    expect(lines(withFiles({ "method.ts": body(401, "") }))).toHaveLength(1);
  });

  it("measures an implementation whose manifest is broken, and asks for one when there is none", () => {
    const broken = "{ }\n";
    expect(lines(withFiles({ "extension.json": broken })).every((l) => l.startsWith("extension.json"))).toBe(true);
    const long = Array.from({ length: 401 }, () => "// x").join("\n");
    expect(lines(withFiles({ "extension.json": broken, "method.ts": long })).some((l) => l.startsWith("method.ts:401"))).toBe(true);
    expect(lines(withFiles({ "extension.json": broken, "method.ts": null }))).toContain("method.ts: is missing: an Extension has method.ts or mark.ts.");
    expect(lines(withFiles({ "extension.json": broken, "method.ts": null, "mark.ts": "export const a = 1;\n" })).some((l) => l.startsWith("method.ts"))).toBe(false);
    expect(lines(withFiles({ "extension.json": null, "method.ts": null }))).toEqual(["extension.json: is missing: every Extension has extension.json, reference.ts, cases.ts, catalogue.md, wording.ts, LICENSE and method.ts or mark.ts.", "method.ts: is missing: an Extension has method.ts or mark.ts."]);
    expect(lines(withFiles({ "extension.json": null, "mark.ts": "export const a = 1;\n", "method.ts": null }))).toHaveLength(1);
  });

  it("holds every .ts file to the rules, in the order of their names, and only wording.ts to the words", () => {
    const files = withFiles({ "z.ts": "export const a = Date;\n", "a.ts": "export const b = Date;\n", "method.ts": `${GOOD.get("method.ts")}export const w = "because";\n`, "fixtures/data.ts": "export const c = Date;\n" });
    expect(lines(files).map((l) => l.split(":")[0])).toEqual(["a.ts", "fixtures/data.ts", "z.ts"]);
    expect(lines(withFiles({ "notes.md": "Date because" }))).toEqual([]);
  });
});

describe("the manifest", () => {
  const problems = (m: string) => { const r = checkManifest(m); return r.ok ? [] : r.problems.map((p) => `${p.path}: ${p.message}`); };
  it("refuses a name used twice among inputs, and between an input and a parameter, but not a name used once", () => {
    expect(problems(manifest((m) => { m.signature.inputs = [{ name: "a", kind: "series" }, { name: "a", kind: "series" }]; }))).toEqual(["signature.inputs[1].name: “a” is used twice: every input and parameter needs a name of its own."]);
    expect(problems(manifest((m) => { m.signature.params = [{ name: "w", min: 1, max: 3, default: 2 }, { name: "w", min: 1, max: 3, default: 2 }]; }))).toEqual(["signature.params[1].name: “w” is used twice: every input and parameter needs a name of its own."]);
    expect(problems(manifest((m) => { m.signature.params = [{ name: "w", min: 1, max: 3, default: 2 }, { name: "v", min: 1, max: 3, default: 2 }]; }))).toEqual([]);
  });

  it("holds a parameter's range to min below max and the default between them, ends included", () => {
    const p = (min: number, max: number, d: number) => problems(manifest((m) => { m.signature.params = [{ name: "w", min, max, default: d }]; }));
    expect(p(1, 5, 1)).toEqual([]);
    expect(p(1, 5, 5)).toEqual([]);
    expect(p(1, 5, 3)).toEqual([]);
    expect(p(1, 5, 0)).toEqual(["signature.params[0].default: must be between min and max."]);
    expect(p(1, 5, 6)).toEqual(["signature.params[0].default: must be between min and max."]);
    expect(p(2, 2, 2)).toEqual(["signature.params[0].max: must be above min."]);
    expect(p(3, 2, 2)).toEqual(["signature.params[0].max: must be above min."]);
  });

  it("asks a mark for something to draw, and a Method for nothing", () => {
    expect(problems(manifest((m) => { m.signature.inputs = []; }))).toEqual([]);
    expect(problems(manifest((m) => { m.kind = "mark"; m.signature.gives = "shapes"; m.signature.inputs = []; }))).toEqual(["signature.inputs: of a mark must name what it draws: a mark takes its numbers from a Method."]);
  });

  it("is held to its size and depth, and to the newest format it reads", () => {
    expect(problems(`${manifest(() => undefined).trimEnd()}${" ".repeat(20_000)}`)[0]).toMatch(/bytes/);
    expect(problems("[[[[[[[[1]]]]]]]]")[0]).toMatch(/deep/);
    expect(problems(manifest((m) => { m.format = "ziffr.extension/2"; }))).toEqual(["format: This file is in format ziffr.extension/2; this Ziffr reads ziffr.extension/1."]);
  });
});

describe("the rules' edges", () => {
  it("reports a syntax problem on its own line, and stops there", () => {
    expect(checkRules("x.ts", "export const a = 1;\nexport const = ;\n").map((p) => [p.rule, p.line])).toEqual([["syntax", 2]]);
    expect(checkRules("x.ts", "export const a = Date;\nexport const = ;\n").map((p) => p.rule)).toEqual(["syntax"]);
  });

  it("lists problems in the order of their lines", () => {
    const src = "export const a = fetch;\nexport const b = Date;\nexport const c = eval;\n";
    expect(checkRules("x.ts", src).map((p) => p.line)).toEqual([1, 2, 3]);
    expect(checkRules("x.ts", "export const a = eval;\n\n\nexport const b = fetch;\nexport const c = Date;\n").map((p) => p.line)).toEqual([1, 4, 5]);
  });

  it("allows an imported name from an allowed package, and refuses an import that is not a fixed name", () => {
    expect(rules('import { a } from "@ziffr/figures";\nexport const b = a;\n')).toEqual([]);
    expect(checkRules("x.ts", 'import { a } from "node:fs";\n')[0].message).toBe("imports “node:fs”; an Extension may import only “@ziffr/extension-kit” and “@ziffr/figures”.");
    expect(checkRules("x.ts", "export const a = 1;\nimport b = require(c);\n").filter((p) => p.rule === "import-not-allowed").map((p) => p.message)).toEqual(["imports something that is not a fixed name; an Extension may import only “@ziffr/extension-kit” and “@ziffr/figures”."]);
    expect(rules('export { a } from "@ziffr/figures";\n')).toEqual([]);
    expect(rules("export const a = 1;\nexport { a as b };\n")).toEqual([]);
    expect(rules("export const a = 1;\nexport { a };\n")).toEqual([]);
    expect(rules("export const a = 1;\nexport { c as a2 };\n")).toEqual(["ambient-global"]);
  });

  it("refuses import.meta but not another meta property", () => {
    expect(rules("export const a = import.meta;\n")).toEqual(["dynamic-code"]);
    expect(rules("export function f() { return new.target; }\n")).toEqual([]);
  });

  it("allows only the five Object functions, whichever way Object is written", () => {
    for (const m of ["keys", "values", "entries", "freeze", "fromEntries"]) expect(rules(`export const a = Object.${m};\n`), m).toEqual([]);
    expect(rules("export const a = Object.create;\n")).toEqual(["ambient-global"]);
    expect(rules("export const a = Object;\n")).toEqual(["ambient-global"]);
    expect(rules("export const a = x.Object;\nexport const x = {};\n")).toEqual([]);
    expect(rules("export const a = Object['keys'];\n")).toEqual(["ambient-global", "string-access"]);
    expect(rules("export const a = Math;\n")).toEqual(["random"]);
    expect(rules("export const a = Math[0];\n")).toEqual(["string-access"]);
    expect(rules("export const a = Math.max;\n")).toEqual([]);
    expect(rules("export const a = Other.random;\nconst Other = { random: 1 };\n")).toEqual([]);
    expect(rules("export const a = Math.random;\n")).toEqual(["random"]);
    expect(rules("export const a = Math.floor;\nexport const b = Other.random;\nconst Other = { random: 1 };\n")).toEqual([]);
  });

  it("knows what a file declares, in every form, and takes those names as its own", () => {
    const src = [
      "export function f({ a, b: [c, , d] }: { a: number; b: number[] }, [e, , g]: number[], ...rest: number[]): number {",
      "  const { h, i: [j] } = { h: 1, i: [2] };",
      "  const k = function named(): number { return named === undefined ? 1 : 2; };",
      "  class L { m = 1 }",
      "  interface N { p: number }",
      "  type O = N;",
      "  enum Q { R }",
      "  try { k(); } catch (err) { err; }",
      "  return a + c + d + e + g + rest.length + h + j + (new L().m) + Q.R;",
      "}",
    ].join("\n");
    expect(rules(src)).toEqual([]);
    expect(rules("import d, { e as f } from '@ziffr/figures';\nimport * as g from '@ziffr/figures';\nexport const h = [d, f, g];\n")).toEqual([]);
    expect(rules("export const h = [d, f, g];\nimport d, { e as f } from '@ziffr/figures';\nimport * as g from '@ziffr/figures';\n")).toEqual([]);
    expect(rules("namespace Ns { export const a = 1; }\nexport const b = Ns.a;\n")).toEqual([]);
    expect(rules("export const b = Missing.a;\n")).toEqual(["ambient-global"]);
    expect(rules("export function f<T>(x: T): T { type U = T; const y: U = x; return y; }\n")).toEqual([]);
  });

  it("takes names in the places that name and do not refer", () => {
    const src = [
      "type P = { a: number; b(): void };",
      "interface I { c: number; d(): void }",
      "enum E { F }",
      "class K { g = 1; h() { return 1; } }",
      "export const o = { i: 1, j() { return 1; } };",
      "export const { i: renamed } = o;",
      "import type * as ns from '@ziffr/extension-kit';",
      "export type T = ns.Series;",
      "export const u = [E.F, o.i, new K().g] as const;",
      "export type V = P | I;",
    ].join("\n");
    expect(rules(src)).toEqual([]);
    expect(rules("export const o = { missing };\n")).toEqual(["ambient-global"]);
    expect(rules("export function f() { loop: for (;;) { break loop; } }\n")).toEqual([]);
    expect(rules("export function f() { for (;;) { break missing; } }\n")).toEqual([]);
  });

  it("follows a built text through parentheses and sums, and lets a number sum through", () => {
    const key = (k: string) => `export function f(o: Record<string, number>, n: number): number { return o[${k}]; }\n`;
    for (const k of ['("a")', '(("a"))', '"a" + n', 'n + "a"', '("a" + n)', '1 + 2 + "a"', "`x${n}`", '"a"']) expect(rules(key(k)), k).toEqual(["string-access"]);
    for (const k of ["n", "n + 1", "1 + 2", "(n)", "n * 2"]) expect(rules(key(k)), k).toEqual([]);
    const viaConst = (init: string) => `export function f(o: Record<string, number>, n: number): number { const k = ${init}; const j = k; return o[k] + o[j]; }\n`;
    expect(rules(viaConst('"a"'))).toEqual(["string-access"]);
    expect(rules(viaConst("n + 1"))).toEqual([]);
    expect(rules(viaConst("(1 + n)"))).toEqual([]);
  });

  it("knows a function's own names: parameters, locals and its own name, but not those of a function inside it", () => {
    expect(rules("export function f(a: number): number { a = 1; let b = 0; b++; function g() { return 1; } class H {} return a + b + g() + (H ? 1 : 0); }\n")).toEqual([]);
    expect(rules("export const f = function inner(): number { inner = 1; return 1; };\n")).toEqual([]);
    expect(rules("export function f(): number { function g() { let inside = 0; return inside; } inside = 1; return g(); }\n")).toEqual(["outside-assignment"]);
    expect(rules("export function f(): number { const g = () => { let x = 1; return x; }; let x2 = 1; x2 += g(); return x2; }\n")).toEqual([]);
    expect(rules("let outer = 0;\nexport function f(): number { const g = () => { outer = 2; }; g(); return 1; }\n")).toEqual(["outside-assignment"]);
    expect(rules("export function f(): number { const g = () => { sib = 2; }; const h = () => { let sib = 1; return sib; }; g(); return h(); }\n")).toEqual(["outside-assignment"]);
  });

  it("follows every kind of assignment target through parentheses, destructuring and spreads", () => {
    const mod = (stmt: string) => `let a = 0;\nlet b = 0;\nconst o = { x: 0 };\nexport function f(xs: number[]): number { ${stmt} return 0; }\n`;
    for (const s of ["(a) = 1;", "[a] = xs;", "[, a] = xs;", "[a, ...b] = xs;", "({ a } = { a: 1 });", "({ k: a } = { k: 1 });", "({ ...o } = o);", "({ k: [a] } = { k: [1] });", "[a = 2] = xs;", "o.x = 1;", "(o as { x: number }).x = 1;", "o!.x = 1;", "o['x' as never] = 1;", "a **= 2;", "a >>>= 1;", "a &&= 1;", "a ??= 1;", "a %= 1;", "a <<= 1;", "a >>= 1;", "a &= 1;", "a |= 1;", "a ^= 1;", "a -= 1;", "a *= 1;", "a /= 1;", "a--;", "--a;", "++a;", "delete o.x;", "for (a in xs) { }", "for (o.x of xs) { }"]) {
      expect(rules(mod(s)).filter((r) => r !== "string-access"), s).toEqual(["outside-assignment"]);
    }
    expect(rules(mod("for (const a2 of xs) { void a2; } for (let a3 in xs) { void a3; }"))).toEqual([]);
    expect(rules(mod("a == 1; a === 1; a < 1; a <= 1; a + 1;"))).toEqual([]);
    expect(rules(mod("const c = -a; const d = +a; void c; void d;"))).toEqual([]);
  });

  it("refuses a call that changes what it is called on, by each of its names, unless it is a local", () => {
    for (const m of ["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin", "set", "add", "delete", "clear"]) {
      expect(rules(`export function f(x: number[]): number { x.${m}(); return 0; }\n`), m).toEqual(["outside-assignment"]);
      expect(rules(`export function f(x: number[]): number { const y = [...x]; y.${m}(); return 0; }\n`), m).toEqual([]);
    }
    expect(rules("export function f(x: number[]): number { x.slice().sort(); [...x].sort(); x.map((v) => v).reverse(); return 0; }\n")).toEqual([]);
    expect(rules("export function f(x: number[]): number { x.length; x.concat([1]); x.indexOf(1); return 0; }\n")).toEqual([]);
    expect(rules("export function f(x: { y: number[] }): number { x.y.push(1); return 0; }\n")).toEqual(["outside-assignment"]);
    expect(rules("export function f(x: { y: number[] }): number { x['y' as never].push(1); return 0; }\n")).toEqual(["outside-assignment", "string-access"]);
    expect(rules("export function f(x: number[]): number { const g = () => { x.push(1); }; g(); return 0; }\n")).toEqual(["outside-assignment"]);
    expect(rules("export function f(): number { const m = new Map<number, number>(); const g = () => { m.set(1, 1); }; g(); return m.size; }\n")).toEqual([]);
  });

  it("refuses a Math.random however Math is reached, and keeps Math.floor", () => {
    expect(rules("export const a = Math.random();\n")).toEqual(["random"]);
    expect(rules("export const a = Other.random();\nconst Other = { random: () => 1 };\n")).toEqual([]);
    expect(rules("export const a = Math['floor'];\n")).toEqual(["string-access"]);
    expect(checkRules("x.ts", "export const a = Math.random;\n").map((p) => p.message)).toContain("uses Math.random: an Extension is deterministic.");
  });

  it("applies the top-level rules to code files by their names, and the options override them", () => {
    expect(checkRules("method.ts", "let a = 1;\n").map((p) => p.rule)).toEqual(["module-state"]);
    expect(checkRules("x.ts", "let a = 1;\n")).toEqual([]);
    expect(checkRules("x.ts", "let a = 1;\n", { code: true }).map((p) => p.rule)).toEqual(["module-state"]);
    expect(checkRules("method.ts", "let a = 1;\n", { code: false })).toEqual([]);
    expect(rules("export function f(): number { let a = 1; return a; }\n", { code: true })).toEqual([]);
    expect(rules("const a = 1, b = [1];\nexport const c = [a, b];\n", { code: true })).toEqual(["module-state"]);
    expect(rules("const a: ReadonlyArray<number> = [1];\nconst b: Readonly<{ x: number }> = { x: 1 };\nconst c: readonly number[] = [1];\nexport const d = [a, b, c] as const;\n", { code: true })).toEqual([]);
    expect(rules("const a: Array<number> = [1];\nexport const d = a;\n", { code: true })).toEqual(["module-state"]);
    expect(rules("const a: keyof { x: 1 } = 'x';\nexport const d = a;\n", { code: true })).toEqual([]);
    expect(rules("const a = (Object.freeze([1]));\nconst b = ([1] as const);\nconst c = ({ x: 1 } satisfies { x: number });\nexport const d = [a, b, c];\n", { code: true })).toEqual(["module-state"]);
    expect(rules("const a = [1] as number[];\nexport const d = a;\n", { code: true })).toEqual(["module-state"]);
    expect(rules("const a = Other.freeze([1]);\nexport const d = a;\nconst Other = { freeze: (x: number[]) => x };\n", { code: true })).toEqual(["module-state"]);
    expect(rules("const a = -1;\nconst b = -x;\nexport const d = [a, b];\nconst x = 1;\n", { code: true })).toEqual(["module-state"]);
    expect(rules("const a = `x`;\nconst b = 1n;\nconst c = false;\nconst d = function () { return 1; };\nexport const e = [a, b, c, d];\n", { code: true })).toEqual(["module-state"]);
    expect(rules("export const e = 1 + 2;\n", { code: true })).toEqual(["module-state"]);
    expect(rules("let a: number;\nexport const e = a;\n", { code: true })).toEqual(["module-state"]);
    expect(rules("export declare const e: number;\n", { code: true })).toEqual(["module-state"]);
  });

  it("applies the wording words by option, and reads each part of a template", () => {
    expect(rules('export const a = "because";\n', { wording: true })).toEqual(["forbidden-word"]);
    expect(rules('export const a = "because";\n', { wording: false })).toEqual([]);
    expect(rules("export const a = (n: number) => `x ${n} y`;\n", { wording: true })).toEqual([]);
    for (const t of ["`because ${1} x`", "`x ${1} because ${2} x`", "`x ${1} because`", "`because`"]) expect(rules(`export const a = ${t};\n`, { wording: true }), t).toEqual(["forbidden-word"]);
    expect(checkRules("x.ts", 'export const a = "x";\nexport const b = "a because b";\n', { wording: true }).map((p) => [p.line, p.message])).toEqual([[2, "says “because”, which a Takeaway never says."]]);
  });
});
