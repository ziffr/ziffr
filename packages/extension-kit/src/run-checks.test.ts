import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkExtensionFiles } from "./check.js";
import { checkManifest } from "./manifest.js";
import { RUN_RULES, runChecks, type RunOptions } from "./run-checks.js";
import { readExtensionFolder, run } from "./run.js";
import { decode, encode, isRefusal, same } from "./sandbox/wire.js";
import { prepareExtension, runChild } from "./sandbox/spawn.js";
import { position, sourceLine } from "./sourcemap.js";

const TEST = join(dirname(fileURLToPath(import.meta.url)), "../test");
const GOOD = join(TEST, "good/example");
const BAD = join(TEST, "bad");
const SLOW = 240_000;

/** A bad Extension is the good example with the files of its folder laid over it. */
function badExtension(name: string) {
  const files = readExtensionFolder(GOOD);
  const dir = join(BAD, name);
  const meta = JSON.parse(readFileSync(join(dir, "bad.json"), "utf8")) as { rule: string; stage?: string; remove: string[] };
  for (const f of readdirSync(dir)) if (f !== "bad.json") files.set(f, readFileSync(join(dir, f), "utf8"));
  for (const f of meta.remove) files.delete(f);
  return { files, rule: meta.rule, stage: meta.stage ?? "static" };
}

const manifestOf = (files: Map<string, string>) => {
  const res = checkManifest(files.get("extension.json") ?? "");
  if (!res.ok) throw new Error("the manifest of a test Extension is wrong");
  return res.manifest;
};

const runNames = readdirSync(BAD).filter((n) => badExtension(n).stage === "run").sort();
// Short limits keep the tests quick: the example answers in a millisecond.
const quick = (rule: string): RunOptions => ({ generated: 60, limits: { perCallMs: 400 }, mutation: rule === "mutant-survived" });

describe("the checks that run the code, on the good worked example", () => {
  it("passes every check, with the mutation check, and the command ends with 0", async () => {
    const res = await run(["check", GOOD]);
    expect(res.out).toEqual([`${GOOD}: ziffr-example/spread 1.0.0 passes every check: shape, static rules, determinism, budget, refusals, reference, coverage and mutation.`]);
    expect(res.code).toBe(0);
  }, SLOW);

  it("gives the same answer when the generated inputs have the same seed, and may be given others", async () => {
    const files = readExtensionFolder(GOOD);
    for (const seed of [115, 7]) expect(await runChecks(files, manifestOf(files), { seed, generated: 40, mutation: false })).toEqual([]);
  }, SLOW);
});

describe("the bad Extensions that only running them shows", () => {
  it("has at least one for every reason, apart from the two that cannot be written without breaking a static rule first", () => {
    const named = new Set(runNames.map((n) => badExtension(n).rule));
    // forbidden-at-run needs a clock or random call the static rules refuse (it is tried on the process directly below);
    // mutation-not-run is Stryker failing to start.
    expect([...named].sort()).toEqual(RUN_RULES.filter((r) => r !== "forbidden-at-run" && r !== "mutation-not-run").sort());
  });

  it.each(runNames)("%s passes the static checks and is refused for exactly its one reason", async (name) => {
    const { files, rule } = badExtension(name);
    expect(checkExtensionFiles(files), "static checks pass, so only running shows it").toEqual([]);
    const problems = await runChecks(files, manifestOf(files), quick(rule));
    expect(problems.length, "refused at all").toBeGreaterThan(0);
    expect([...new Set(problems.map((p) => p.rule))]).toEqual([rule]);
    for (const p of problems) expect(p.message.length).toBeGreaterThan(20);
  }, SLOW);

  it("names the line of code that never ran, and of the change no input noticed", async () => {
    const dead = badExtension("run-uncovered-code");
    const line = dead.files.get("method.ts")!.split("\n").findIndex((l) => l.includes("takes at most 500")) + 1;
    expect((await runChecks(dead.files, manifestOf(dead.files), quick("x"))).map((p) => [p.file, p.line])).toEqual([["method.ts", line]]);
    const survivor = badExtension("run-mutant-survives");
    const found = await runChecks(survivor.files, manifestOf(survivor.files), quick("mutant-survived"));
    const lines = survivor.files.get("method.ts")!.split("\n");
    expect(found.map((p) => lines[(p.line ?? 0) - 1].trim()).sort()).toEqual(["if (v < low) low = v;", "if (v > high) high = v;"]);
  }, SLOW);

  it("says which case a run failed on", async () => {
    const { files } = badExtension("run-flat-series-gets-a-number");
    const problems = await runChecks(files, manifestOf(files), quick("x"));
    expect(problems[0].message).toContain("a flat series");
    expect(problems[0].message).toContain("instead of refusing");
  }, SLOW);

  it("accepts a relative tolerance when the manifest names one, and refuses a difference beyond it", async () => {
    const { files } = badExtension("run-differs-from-reference");
    const withTolerance = (relative: number) => ({ ...manifestOf(files), equality: { relative } });
    // A Method that is out by one on values of this size differs by more than 1e-6.
    expect((await runChecks(files, withTolerance(1e-6), quick("x"))).map((p) => p.rule)).toContain("differs-from-reference");
    const good = readExtensionFolder(GOOD);
    expect(await runChecks(good, withTolerance(1e-9), { ...quick("x"), mutation: false })).toEqual([]);
  }, SLOW);

  it("checks a Method of two inputs and a parameter, and a mark is left to its own checks", async () => {
    const files = readExtensionFolder(GOOD);
    files.set("extension.json", JSON.stringify({ ...JSON.parse(files.get("extension.json")!), kind: "mark", signature: { inputs: [{ name: "series", kind: "series" }], gives: "shapes" } }));
    files.delete("method.ts");
    files.set("mark.ts", "// a mark\n");
    expect(await runChecks(files, manifestOf(files), quick("x"))).toEqual([]);
  });
});

describe("the process that runs an Extension", () => {
  const code = (body: string, imports = "") => new Map([["method.ts", `${imports}\nexport function f(series: number[]) {\n${body}\n}\n`]]);
  const answerOf = async (files: Map<string, string>, limits: Parameters<typeof runChild>[2] = {}, input: unknown[] = [[1, 2, 3]]) => {
    const prepared = prepareExtension(files);
    try {
      return await runChild(prepared, { op: "run", file: "method.js", prefer: "", inputs: [encode(input)], coverage: false }, { perCallMs: 500, totalMs: 10_000, ...limits });
    } finally {
      prepared.cleanup();
    }
  };
  const out = (res: Awaited<ReturnType<typeof answerOf>>) => decode(res.events.find((e) => "out" in e)?.out);
  const thrown = (res: Awaited<ReturnType<typeof answerOf>>) => String(res.events.find((e) => "threw" in e)?.threw);

  it("runs a function and sends its answer back as data", async () => {
    const res = await answerOf(code("return series.reduce((a, b) => a + b, 0);"));
    expect(res.end).toBe("done");
    expect(out(res)).toBe(6);
  });

  it("is given no environment variables and runs in a temporary directory", async () => {
    process.env.ZIFFR_TEST_SECRET = "hunter2";
    try {
      const res = await answerOf(code("return [Object.keys(process.env).length, process.cwd().includes('ziffr-ext-')];"));
      expect(out(res)).toEqual([0, true]);
    } finally {
      delete process.env.ZIFFR_TEST_SECRET;
    }
  });

  it.each([
    ["the clock: new Date()", "return new Date().getTime();", /clock/],
    ["the clock: Date.now()", "return Date.now();", /clock/],
    ["the clock: performance.now()", "return performance.now();", /clock/],
    ["the random generator: Math.random()", "return Math.random();", /random/],
    ["the random generator: crypto", "return crypto.getRandomValues(new Uint8Array(1))[0];", /random/],
    ["a timer", "return setTimeout(() => 1, 1);", /timer/],
    ["the network: fetch", "return fetch('http://127.0.0.1:1/');", /fetch/],
    ["the network: net", "return net.connect(1, '127.0.0.1');", /node:net/],
    ["the network: http", "return http.get('http://127.0.0.1:1/');", /node:http/],
    ["the network: dns", "return dns.lookup('example.com', () => 1);", /node:dns/],
    ["a child process", "return child_process.execSync('echo hi');", /node:child_process/],
    ["a worker", "return new Worker('x');", /Worker/],
  ])("stops %s with a stub that throws", async (_what, body, message) => {
    const imports = 'import net from "node:net";\nimport http from "node:http";\nimport dns from "node:dns";\nimport child_process from "node:child_process";';
    const res = await answerOf(code(body, imports));
    expect(res.end).toBe("done");
    expect(thrown(res)).toContain("ZIFFR-STUB");
    expect(thrown(res)).toMatch(message);
  });

  it("does not run code made from a string", async () => {
    const res = await answerOf(code("return new Function('return 1')();"));
    expect(thrown(res)).toMatch(/code generation|EvalError|disallowed/i);
    const evaled = await answerOf(code("return (0, eval)('1 + 1');"));
    expect(thrown(evaled)).toMatch(/code generation|EvalError|disallowed/i);
  });

  it("hands the input over frozen: writing to it is an error", async () => {
    const res = await answerOf(code("series[0] = 9; return series[0];"));
    expect(thrown(res)).toMatch(/read only|frozen|Cannot assign/i);
  });

  it("kills a loop that does not end, and says which input it was on", async () => {
    const res = await answerOf(code("for (;;) { series.length; }"), { perCallMs: 200 });
    expect(res.end).toBe("timeout");
    expect(res.at).toBe(0);
  });

  it("kills a loop in the file's top level before any call", async () => {
    const files = new Map([["method.ts", "for (;;) { Math.abs(1); }\nexport function f() { return 1; }\n"]]);
    const res = await answerOf(files, { totalMs: 1500 });
    expect(res.end).toBe("timeout");
    expect(res.at).toBeNull();
  });

  it("stops a Method that fills its memory, by the heap limit", async () => {
    const res = await answerOf(code("const a: number[] = []; for (;;) a.push(a.length);"), { heapMb: 64, perCallMs: 20_000, totalMs: 30_000 });
    expect(res.end).toBe("memory");
  }, 60_000);

  it("stops a process that holds more than the memory it may, by watching it from outside", async () => {
    const res = await answerOf(code("const b = Buffer.alloc(900_000_000, 1); for (;;) b[0] = 1;"), { rssMb: 300, perCallMs: 20_000, totalMs: 30_000 });
    expect(res.end).toBe("memory");
  }, 60_000);

  it("stops a process that floods its channel, and one that answers with too much", async () => {
    const flood = await answerOf(code("for (;;) writeSync(3, 'x'.repeat(100000));", 'import { writeSync } from "node:fs";'), { perCallMs: 5000, maxLineBytes: 500_000 });
    expect(flood.end).toBe("output");
    const big = await answerOf(code("return 'x'.repeat(5_000_000);"));
    expect(big.events.find((e) => "tooBig" in e)).toBeTruthy();
    const garbage = await answerOf(code("writeSync(3, 'not json\\n'); return 1;", 'import { writeSync } from "node:fs";'));
    expect(garbage.end).toBe("garbage");
  });

  it("reports a process that dies without answering, and a file that cannot be loaded", async () => {
    const dies = await answerOf(code("process.exit(3);"));
    expect(dies.end).toBe("crash");
    const broken = await answerOf(new Map([["method.ts", "export function f() {\n  return missing.thing;\n}\nthrow new Error('no');\n"]]));
    expect(broken.end).toBe("fatal");
  });

  it("answers with data of every kind, and refuses what is not data", async () => {
    const res = await answerOf(code("return { a: [NaN, Infinity, -0, 1.5], b: 'text', c: null, d: undefined };"));
    expect(out(res)).toEqual({ a: [NaN, Infinity, -0, 1.5], b: "text", c: null, d: undefined });
    expect(res.events.find((e) => "bad" in e)).toBeUndefined();
    const fn = await answerOf(code("return () => 1;"));
    expect(fn.events.find((e) => "bad" in e)?.bad).toContain("function");
    const cls = await answerOf(code("return new Map();"));
    expect(cls.events.find((e) => "bad" in e)?.bad).toContain("plain data");
    const deep = await answerOf(code("let v: unknown = 1; for (let i = 0; i < 30; i++) v = [v]; return v;"));
    expect(deep.events.find((e) => "bad" in e)?.bad).toContain("nested");
  });

  it("measures coverage of the file it was asked about", async () => {
    const prepared = prepareExtension(code("if (series.length > 5) {\n  return 1;\n}\nreturn 2;"));
    try {
      const res = await runChild(prepared, { op: "run", file: "method.js", prefer: "", inputs: [encode([[1, 2, 3]])], coverage: true }, {});
      const { uncovered } = res.events.find((e) => e.done);
      expect(uncovered.length).toBe(1);
      const js = prepared.compiled.get("method.ts")!;
      const [start] = uncovered[0] as [number, number];
      const at = position(js.js, start + js.js.slice(start).search(/\S/));
      // The block that never ran starts at the brace after the condition, on line 3 of the file.
      expect(sourceLine(js.map, at.line, at.column)).toBe(3);
    } finally {
      prepared.cleanup();
    }
  });
});

describe("the wire format and source maps", () => {
  it("keeps NaN, the infinities and minus zero, and refuses what it does not know", () => {
    const v = { list: [NaN, Infinity, -Infinity, -0, 0.1, 1e308, 5e-324], text: "x", no: null, gone: undefined, nested: { a: [true] } };
    expect(decode(JSON.parse(JSON.stringify(encode(v))))).toEqual(v);
    expect(Object.is(decode(encode(-0)), -0)).toBe(true);
    expect(() => decode({ nonsense: 1 })).toThrow();
    expect(() => decode({ "#": "what" })).toThrow();
    expect(() => encode(10n)).toThrow(/bigint/);
    expect(() => encode(Array.from({ length: 200_001 }, () => 1))).toThrow(/200,000/);
  });

  it("compares exactly, within a relative tolerance, and refusals by being refusals", () => {
    expect(same(1, 1)).toBe(true);
    expect(same(1, 1 + 1e-12)).toBe(false);
    expect(same(1, 1 + 1e-12, 1e-9)).toBe(true);
    expect(same(1, 1 + 1e-6, 1e-9)).toBe(false);
    expect(same(NaN, NaN)).toBe(true);
    expect(same(Infinity, Infinity)).toBe(true);
    expect(same(Infinity, 1e308, 1)).toBe(false);
    expect(same([1, 2], [1, 2, 3])).toBe(false);
    expect(same({ a: 1 }, { a: 1 })).toBe(true);
    expect(same({ a: 1 }, { b: 1 })).toBe(false);
    expect(same({ refused: "a" }, { refused: "b" })).toBe(true);
    expect(same({ refused: "a" }, 1)).toBe(false);
    expect(isRefusal({ refused: "why", more: 1 })).toBe(false);
  });

  it("finds the line a compiled position came from, and gives null for a map that cannot be read", () => {
    const text = "const a = 1;\nconst b = 2;\n";
    expect(position(text, 14)).toEqual({ line: 1, column: 1 });
    expect(sourceLine("not json", 0, 0)).toBeNull();
    expect(sourceLine("{}", 0, 0)).toBeNull();
  });
});
