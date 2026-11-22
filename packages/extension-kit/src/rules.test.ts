import { describe, expect, it } from "vitest";
import { checkRules, type RuleName } from "./rules.js";

/** The reasons a snippet is refused for, once each; the snippet is the body of an Extension's one function. */
const reasons = (src: string, options?: { wording?: boolean }): RuleName[] => [...new Set(checkRules("x.ts", src, options).map((p) => p.rule))].sort() as RuleName[];
const inFn = (body: string, head = "") => `${head}\nexport function f(series: readonly number[]): number {\n${body}\n  return 0;\n}\n`;

describe("what the rules must not refuse (no false positives)", () => {
  const fine: [string, string][] = [
    ["a property that is named like a forbidden identifier", inFn("const a = (series as unknown as { process: number }).process; const b = { fetch: 1, Date: 2 }; return a + b.fetch;")],
    ["a method named fetch on a value", inFn("const x = { fetch() { return 1; } }; x.fetch();")],
    ["Math without random", inFn("const a = Math.floor(Math.max(1, 2)) + Math.PI; return a;")],
    ["a text that holds a forbidden word", inFn('const s = "Date.now and fetch and eval and Math.random"; return s.length;')],
    ["a comment that holds forbidden words", inFn("// Date, process, globalThis, setTimeout\n  /* eval(fetch) */")],
    ["identifiers that merely start with a forbidden one", inFn("const dateOfBirth = 1; const processed = 2; const fetchCount = 3; const Dates = 4; return dateOfBirth + processed + fetchCount + Dates;")],
    ["a number as a key", inFn("const a = series[0]; const i = 1; const b = series[i + 1]; const c = series[series.length - 1]; return a + b + c;")],
    ["a key that is a variable of numbers", inFn("let t = 0; for (let i = 0; i < series.length; i++) t += series[i]; return t;")],
    ["writing to a local array and a local object", inFn("const out: number[] = []; for (const v of series) out[out.length] = v; const o = { n: 0 }; o.n += 1; out.length = 0; delete o.n;")],
    ["writing to a local that a nested function changes", inFn("let t = 0; series.forEach((v) => { t += v; }); return t;")],
    ["a changed parameter name (not what it holds)", `export function f(n: number): number { n = n + 1; n++; return n; }\n`],
    ["destructuring into new locals", inFn("const [a, b] = series; const { length } = series; return a + b + length;")],
    ["swapping two locals", inFn("let a = 1; let b = 2; [a, b] = [b, a]; return a + b;")],
    ["import type from the allowed packages", `import type { Series } from "@ziffr/extension-kit";\nimport { formatNumber } from "@ziffr/figures";\nexport type S = Series;\nexport const g = formatNumber;\n`],
    ["an object written with text keys", inFn('const o = { "a-b": 1 }; return o["a-b" as never];').replace('return o["a-b" as never];', "return o === null ? 1 : 0;")],
    ["a word that only looks like a forbidden one in wording", 'export const w = { a: "The causeway is long and the significance..." };\n'],
  ];
  it.each(fine)("%s", (_name, src) => {
    // The last case holds the word "causeway" on purpose: only whole words are refused, and only in wording.ts.
    expect(checkRules("x.ts", src)).toEqual([]);
  });
});

describe("attempts to get round the rules", () => {
  const refused: [string, string, RuleName][] = [
    ["aliasing Date", inFn("const D = Date; D.now();"), "clock"],
    ["taking now out of Date", inFn("const { now } = Date; now();"), "clock"],
    ["Date written with an escape", inFn("const D = \\u0044ate;"), "clock"],
    ["Date as a type", inFn("let d: Date | null = null;"), "clock"],
    ["shadowing Date with a parameter", `export function f(Date: number): number { return Date; }\n`, "clock"],
    ["aliasing Math", inFn("const M = Math; M.random();"), "random"],
    ["taking random out of Math", inFn("const { random } = Math;"), "random"],
    ["Math.random by optional chain", inFn("Math?.random();"), "random"],
    ["Math handed to a function", inFn("[Math].map((m) => m.floor);"), "random"],
    ["Math reached by a text", inFn('Math["random"]();'), "string-access"],
    ["a key made of pieces on any object", inFn('const o = {} as Record<string, number>; o["Da" + "te"];'), "string-access"],
    ["a key in a constant made of pieces", inFn('const k = "con" + "structor"; const o = {} as Record<string, number>; o[k];'), "string-access"],
    ["a key in a constant made of a constant made of pieces", inFn('const a = "con"; const k = a + "structor"; const o = {} as Record<string, number>; o[k];'), "string-access"],
    ["a key in a template", inFn("const o = {} as Record<string, number>; o[`fe${\"tch\"}`];"), "string-access"],
    ["a key that is a plain text", inFn('const o = { a: 1 }; o["a"];'), "string-access"],
    ["reaching Function by constructor", inFn('(0 as number).constructor.constructor;'), "reach-by-property"],
    ["reaching Function through a text key", inFn('(0 as unknown as Record<string, Record<string, (s: string) => () => void>>)["constructor"]["constructor"]("x")();'), "string-access"],
    ["the prototype chain", inFn("({}).__proto__;"), "reach-by-property"],
    ["prototype", inFn("series.prototype;"), "reach-by-property"],
    ["fetch", inFn('fetch("x");'), "network"],
    ["fetch taken as a value", inFn("const f = fetch;"), "network"],
    ["XMLHttpRequest", inFn("new XMLHttpRequest();"), "network"],
    ["eval", inFn('eval("1");'), "dynamic-code"],
    ["eval passed on", inFn("[eval].length;"), "dynamic-code"],
    ["Function", inFn('new Function("return 1")();'), "dynamic-code"],
    ["Function without new", inFn('Function("return 1")();'), "dynamic-code"],
    ["require", inFn('require("fs");'), "dynamic-code"],
    ["import()", inFn('import("node:fs");'), "dynamic-code"],
    ["import() of an allowed package", inFn('import("@ziffr/figures");'), "dynamic-code"],
    ["an import type", inFn('let x: import("node:fs").Stats | null = null;'), "dynamic-code"],
    ["import.meta", inFn("import.meta.url;"), "dynamic-code"],
    ["import = require", `import fs = require("fs");\n`, "import-not-allowed"],
    ["setTimeout", inFn("setTimeout(() => 1, 0);"), "timer"],
    ["process", inFn("process.exit(1);"), "ambient-global"],
    ["window", inFn("window.open;"), "ambient-global"],
    ["document", inFn("document.cookie;"), "ambient-global"],
    ["globalThis", inFn("globalThis;"), "ambient-global"],
    ["an import of a Node module", `import fs from "node:fs";\n`, "import-not-allowed"],
    ["an import of a relative file", `import { a } from "./other";\n`, "import-not-allowed"],
    ["an import of a path inside an allowed package", `import { a } from "@ziffr/figures/x";\n`, "import-not-allowed"],
    ["an import of a package that only starts like an allowed one", `import { a } from "@ziffr/figures-evil";\n`, "import-not-allowed"],
    ["a side-effect import", `import "node:fs";\n`, "import-not-allowed"],
    ["a re-export", `export { a } from "node:fs";\n`, "import-not-allowed"],
    ["export star", `export * from "lodash";\n`, "import-not-allowed"],
    ["any", inFn("let a: any = 1;"), "any-type"],
    ["as any", inFn("const a = series as any;"), "any-type"],
    ["an angle assertion to any", inFn("const a = <any>series;"), "any-type"],
    ["any in a generic", inFn("const a: Array<any> = [];"), "any-type"],
    ["any in a parameter", `export function f(x: any): number { return 0; }\n`, "any-type"],
    ["writing to a module variable", `let n = 0;\nexport function f(): number { n = n + 1; return n; }\n`, "outside-assignment"],
    ["changing a module object", `const s = { n: 0 };\nexport function f(): number { s.n++; return s.n; }\n`, "outside-assignment"],
    ["compound assignment to a module variable", `let n = 0;\nexport function f(): number { n += 1; return n; }\n`, "outside-assignment"],
    ["the increment of a module variable", `let n = 0;\nexport function f(): number { return ++n; }\n`, "outside-assignment"],
    ["the decrement of a module variable", `let n = 0;\nexport function f(): number { return n--; }\n`, "outside-assignment"],
    ["logical assignment", `let n = 0;\nexport function f(): number { n ||= 1; return n; }\n`, "outside-assignment"],
    ["deleting from a module object", `const s: { n?: number } = { n: 0 };\nexport function f(): void { delete s.n; }\n`, "outside-assignment"],
    ["swapping by destructuring onto module variables", `let a = 1;\nlet b = 2;\nexport function f(): number { [a, b] = [b, a]; return a; }\n`, "outside-assignment"],
    ["destructuring an object onto a module variable", `let a = 1;\nexport function f(): number { ({ a } = { a: 2 }); return a; }\n`, "outside-assignment"],
    ["for-of onto a module variable", `let v = 0;\nexport function f(xs: number[]): number { for (v of xs) { } return v; }\n`, "outside-assignment"],
    ["an undeclared name", inFn("total = 1;"), "outside-assignment"],
    ["changing the input", inFn("series[0] = 1;").replace("readonly number[]", "number[]"), "outside-assignment"],
    ["changing a field of the input", `export function f(o: { n: number }): number { o.n = 1; return 0; }\n`, "outside-assignment"],
    ["a class writing to this", `export class Box { n = 0; add(v: number) { this.n = this.n + v; return this; } }\n`, "outside-assignment"],
    ["this",`export function f(): number { (this as { n: number }).n = 1; return 0; }\n`, "outside-assignment"],
    ["a call's result", `export function f(g: () => { n: number }): number { g().n = 1; return 0; }\n`, "outside-assignment"],
    ["a class writing a global", `let n = 0;\nexport class B { go() { n = 1; } }\n`, "outside-assignment"],
    ["a nested function writing a global", `let n = 0;\nexport function f(): number { const g = () => { n = 1; }; g(); return n; }\n`, "outside-assignment"],
    ["not TypeScript", "export function (", "syntax"],
  ];
  it.each(refused)("%s", (_name, src, rule) => {
    expect(reasons(src)).toEqual([rule]);
  });

  it("refuses globalThis with a key made of pieces for both of its faults", () => {
    expect(reasons(inFn('globalThis["Da" + "te"];'))).toEqual(["ambient-global", "string-access"]);
  });

  it("refuses every forbidden identifier of the spec, each for a reason of its own", () => {
    const spec: [string, RuleName][] = [
      ["Date", "clock"], ["process", "ambient-global"], ["globalThis", "ambient-global"], ["window", "ambient-global"], ["document", "ambient-global"],
      ["fetch", "network"], ["XMLHttpRequest", "network"], ["eval", "dynamic-code"], ["Function", "dynamic-code"], ["require", "dynamic-code"], ["setTimeout", "timer"],
    ];
    for (const [id, rule] of spec) expect(reasons(inFn(`const x = ${id};`)), id).toEqual([rule]);
  });
});

describe("the words of a Takeaway", () => {
  const words = ["cause", "causes", "caused", "because", "significant", "significance", "p-value", "p value", "P-values", "regression", "R²", "r-squared", "coefficient", "coefficients", "confidence", "Because"];
  it.each(words)("refuses “%s” in wording", (w) => {
    expect(reasons(`export const w = "The result is ${w} of it.";\n`, { wording: true })).toEqual(["forbidden-word"]);
  });

  it("refuses it in a template, and in a part of one", () => {
    expect(reasons("export const w = (n: number) => `It rose ${n} because of the weather and ${n}.`;\n", { wording: true })).toEqual(["forbidden-word"]);
  });

  it("lets everyday words that only contain them pass", () => {
    expect(reasons('export const w = "A causeway and an ordinary sentence rose by 3."\n', { wording: true })).toEqual([]);
    expect(reasons('export const w = "Typically moved together, the numbers refer to a period."\n', { wording: true })).toEqual([]);
  });

  it("is held only for wording.ts, not for code", () => {
    expect(reasons('export const w = "because";\n')).toEqual([]);
  });
});

describe("a rule's problem", () => {
  it("names the line it is on", () => {
    const src = "export function f(): number {\n  const a = 1;\n  const b = Date.now();\n  return a + b;\n}\n";
    expect(checkRules("x.ts", src)).toEqual([{ rule: "clock", line: 3, message: "uses “Date”, which an Extension may not." }]);
  });
});
