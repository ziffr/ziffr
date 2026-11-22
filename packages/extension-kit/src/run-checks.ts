// The Extension Kit's checks that run an Extension's code (GLOSSARY: Extension Kit): determinism, the time and memory
// budget, the refusals, the comparison with the reference, path coverage and the mutation check. The code of an
// Extension is only ever run in a process of its own (`sandbox/spawn.js`); this module builds the inputs, reads the
// answers as data and never loads, evaluates or imports a line an author wrote. It runs only on an Extension that
// already passed the shape and static checks.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import ts from "typescript";
import type { ExtensionManifest } from "./manifest.js";
import { decode, encode, isRefusal, same } from "./sandbox/wire.js";
import { LIMITS, prepareExtension, runChild } from "./sandbox/spawn.js";
import { position, sourceLine } from "./sourcemap.js";
import type { ExtensionFiles, ExtensionProblem } from "./check.js";

/** The name of the reason a check that runs the code refuses an Extension. */
export type RunRule =
  | "bad-cases" | "not-runnable" | "threw" | "forbidden-at-run" | "bad-answer" | "nondeterministic" | "too-slow" | "too-much-memory"
  | "no-refusal" | "differs-from-case" | "differs-from-reference" | "reference-shares-code" | "uncovered-code" | "mutant-survived" | "mutation-not-run";

/** Every reason of `RunRule`, for the tests that hold each to at least one bad Extension. */
export const RUN_RULES: readonly RunRule[] = [
  "bad-cases", "not-runnable", "threw", "forbidden-at-run", "bad-answer", "nondeterministic", "too-slow", "too-much-memory",
  "no-refusal", "differs-from-case", "differs-from-reference", "reference-shares-code", "uncovered-code", "mutant-survived", "mutation-not-run",
];

/** What the checks that run the code may be asked: fewer generated inputs, other limits, or no mutation check. */
export type RunOptions = {
  /** Generated inputs for the comparison with the reference (default 200). */
  generated?: number;
  /** The seed of the generated inputs; the same seed gives the same inputs on every machine (default 115, as the core's). */
  seed?: number;
  /** The most a call may take, in milliseconds (default 1000), and the memory ceilings of `sandbox/spawn.js`. */
  limits?: Partial<typeof LIMITS>;
  /** Whether to run the mutation check, which is the slow one (default true). */
  mutation?: boolean;
  /** The most the mutation check may take, in milliseconds (default 20 minutes). */
  mutationMs?: number;
};

type Wire = unknown;
type Item = { label: string; args: unknown[]; hand?: { expected?: unknown; refused?: string }; refusal?: true };
type HandCase = { name: string; args: unknown[]; expected?: unknown; refused?: string };

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_CASES = 200;
const MIN_REFUSAL_WORDS = 2;
const STUB_MARK = "ZIFFR-STUB";
const require = createRequire(import.meta.url);

const problem = (rule: RunRule, file: string, line: number | null, message: string): ExtensionProblem => ({ rule, file, line, message });

/** A list of problems that holds at most three of each reason in each file: the rest say the same thing. */
class Found {
  readonly list: ExtensionProblem[] = [];
  /** Adds a problem unless three like it are already there. */
  add(p: ExtensionProblem): void {
    if (this.list.filter((q) => q.rule === p.rule && q.file === p.file).length < 3) this.list.push(p);
  }
}

/** The shape of a function's body as tokens, with every name the same, so a copy with renamed variables is still a copy. */
function tokensOf(text: string): string {
  const scan = ts.createScanner(ts.ScriptTarget.ES2022, true, ts.LanguageVariant.Standard, text);
  let out = "";
  for (let t = scan.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scan.scan()) out += t === ts.SyntaxKind.Identifier ? "I " : `${scan.getTokenText()} `;
  return out;
}

/** The bodies of the functions at the top of a file, with the line each starts on, and the names it imports from `@ziffr/figures`. */
function codeOf(name: string, text: string): { bodies: { line: number; tokens: string }[]; figures: { name: string; line: number }[] } {
  const sf = ts.createSourceFile(name, text, ts.ScriptTarget.ES2022, true);
  const bodies: { line: number; tokens: string }[] = [];
  const figures: { name: string; line: number }[] = [];
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const take = (fn: ts.Node, body: ts.Node | undefined) => {
    if (body) bodies.push({ line: lineOf(fn), tokens: tokensOf(body.getText()) });
  };
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s)) take(s, s.body);
    else if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) if (d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) take(s, d.initializer.body);
    } else if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === "@ziffr/figures") {
      const named = s.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) for (const e of named.elements) if (!e.isTypeOnly) figures.push({ name: (e.propertyName ?? e.name).text, line: lineOf(e) });
    }
  }
  return { bodies, figures };
}

/** A reference that shares code with the implementation proves nothing: it imports the same function from `@ziffr/figures`, or repeats a function body. */
function sharedCode(files: ExtensionFiles, implementation: string): ExtensionProblem[] {
  const method = files.get(implementation);
  const reference = files.get("reference.ts");
  if (method === undefined || reference === undefined) return [];
  const a = codeOf(implementation, method);
  const b = codeOf("reference.ts", reference);
  const found: ExtensionProblem[] = [];
  for (const f of b.figures) {
    if (a.figures.some((g) => g.name === f.name)) found.push(problem("reference-shares-code", "reference.ts", f.line, `uses “${f.name}” from @ziffr/figures, which ${implementation} uses too: a reference must be worked out another way, sharing nothing.`));
  }
  for (const body of b.bodies) {
    if (body.tokens.length >= 40 && a.bodies.some((x) => x.tokens === body.tokens)) found.push(problem("reference-shares-code", "reference.ts", body.line, `repeats a function of ${implementation} (only its names differ): a reference must be worked out another way.`));
  }
  return found;
}

/** The series positions, and what an input of each kind may be, as fast-check arbitraries. */
function arbitraryFor(kind: string, points: number): fc.Arbitrary<unknown> | undefined {
  const smooth = fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true });
  const small = fc.integer({ min: -20, max: 20 });
  const ties = fc.integer({ min: 0, max: 3 });
  const wide = fc.double({ min: -1e300, max: 1e300, noNaN: true, noDefaultInfinity: true });
  const odd = fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -0);
  const list = (a: fc.Arbitrary<number>) => fc.array(a, { minLength: 0, maxLength: points });
  if (kind === "series") {
    return fc.oneof(
      { weight: 5, arbitrary: list(smooth) }, { weight: 3, arbitrary: list(small) }, { weight: 2, arbitrary: list(ties) },
      { weight: 1, arbitrary: list(wide) }, { weight: 1, arbitrary: list(fc.oneof({ weight: 9, arbitrary: smooth }, { weight: 1, arbitrary: odd })) },
    );
  }
  if (kind === "value") return fc.oneof({ weight: 8, arbitrary: smooth }, { weight: 1, arbitrary: small }, { weight: 1, arbitrary: odd });
  return undefined;
}

/** What each run of the Method is called when a problem names it. */
const labelOf = (items: Item[], i: number | null) => (i === null || !items[i] ? "while loading" : `on ${items[i].label}`);

/** The input lists for the budget: a series of the manifest's longest length made of the worst values there are. */
function budgetSeries(points: number): [string, number[]][] {
  const n = (f: (i: number) => number) => Array.from({ length: points }, (_, i) => f(i));
  let x = 12345;
  const random = n(() => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648) * 2000 - 1000);
  return [
    [`a constant series of ${points} points`, n(() => 5)],
    [`an alternating series of ${points} points`, n((i) => (i % 2 ? 1 : -1))],
    [`a series of ${points} huge values`, n((i) => (i % 2 ? 1e308 : -1e308))],
    [`a series of ${points} tiny values`, n((i) => (i % 2 ? 5e-324 : 1e-300))],
    [`a series of ${points} huge and tiny values`, n((i) => (i % 3 ? 1e-300 : 1e300))],
    [`a series of ${points} values that are not numbers`, n(() => Number.NaN)],
    [`a series of ${points} infinities`, n((i) => (i % 2 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY))],
    [`a rising series of ${points} points`, n((i) => i)],
    [`a falling series of ${points} points`, n((i) => -i)],
    [`a series of ${points} values that look random`, random],
  ];
}

/** Runs one file's function on inputs in a process of its own, in a fresh directory, and removes the directory. */
async function execute(files: ExtensionFiles, file: string, prefer: string, items: Item[], limits: Partial<typeof LIMITS>, coverage: boolean) {
  const prepared = prepareExtension(files);
  try {
    const job = { op: "run", file: file.replace(/\.ts$/, ".js"), prefer, inputs: items.map((i) => encode(i.args)), coverage };
    const res = await runChild(prepared, job, limits);
    return { ...res, compiled: prepared.compiled.get(file) };
  } finally {
    prepared.cleanup();
  }
}

type Executed = Awaited<ReturnType<typeof execute>>;

/** Turns what went wrong in a run (a kill, a crash, an error, an answer that is not data) into problems, and says whether the run is usable. */
function trouble(res: Executed, file: string, items: Item[], limits: Partial<typeof LIMITS>, found: Found): boolean {
  const ms = limits.perCallMs ?? LIMITS.perCallMs;
  const where = labelOf(items, res.at);
  if (res.end === "timeout") found.add(problem("too-slow", file, null, `did not finish ${where} within ${ms} ms: an endless loop, or too slow for a series of this length.`));
  else if (res.end === "memory") found.add(problem("too-much-memory", file, null, `ran out of memory ${where} (the limit is ${limits.heapMb ?? LIMITS.heapMb} MB): its memory grows without end, or with the series.`));
  else if (res.end === "output") found.add(problem("bad-answer", file, null, `sent back far more than an answer ${where}.`));
  else if (res.end !== "done") found.add(problem("not-runnable", file, null, res.detail ? `could not be run: ${res.detail}.` : `could not be run: the process stopped without an answer ${where}.`));
  for (const ev of res.events) {
    const label = labelOf(items, ev.i);
    if (typeof ev.threw === "string") {
      const stub = ev.threw.includes(STUB_MARK);
      found.add(problem(stub ? "forbidden-at-run" : "threw", file, null, stub ? `reached for something an Extension has no access to ${label}: ${ev.threw.replace(`${STUB_MARK}: `, "")}.` : `threw an error ${label} (“${ev.threw}”) instead of answering or refusing.`));
    } else if (ev.bad !== undefined || ev.tooBig) found.add(problem("bad-answer", file, null, `gave an answer ${label} that is not plain data of at most 1 MB (${ev.bad ?? "too large"}).`));
    else if (typeof ev.ms === "number" && ev.ms > ms) found.add(problem("too-slow", file, null, `took ${Math.round(ev.ms)} ms ${label}; the limit is ${ms} ms.`));
  }
  return res.end === "done" && !res.events.some((e) => e.threw !== undefined || e.bad !== undefined || e.tooBig);
}

/** The answers of a usable run by input number, as decoded values. */
function answers(res: Executed): Map<number, unknown> {
  const out = new Map<number, unknown>();
  for (const ev of res.events) if (typeof ev.i === "number" && "out" in ev) out.set(ev.i, decode(ev.out as Wire));
  return out;
}

/** The text of an answer for a message, cut short. */
const show = (v: unknown): string => {
  const s = isRefusal(v) ? `a refusal (“${(v as { refused: string }).refused}”)` : JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isFinite(x) ? String(x) : x));
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
};

/** Reads `cases.ts`: runs it in a process of its own and checks what came back is a list of well-formed cases. */
async function readCases(files: ExtensionFiles, limits: Partial<typeof LIMITS>, found: Found): Promise<HandCase[] | undefined> {
  const prepared = prepareExtension(files);
  try {
    const res = await runChild(prepared, { op: "cases", file: "cases.js", inputs: [] }, limits);
    const ev = res.events.find((e) => "out" in e);
    if (res.end !== "done" && res.end !== "fatal") {
      found.add(problem("bad-cases", "cases.ts", null, `could not be read: ${res.end === "timeout" ? "it did not finish" : "the process stopped"}.`));
      return undefined;
    }
    if (!ev) {
      found.add(problem("bad-cases", "cases.ts", null, `${res.detail || "does not export a list called cases"}.`));
      return undefined;
    }
    const raw = decode(ev.out as Wire);
    const bad = (why: string) => void found.add(problem("bad-cases", "cases.ts", null, `${why}.`));
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_CASES) {
      bad(`must be a list of 1 to ${MAX_CASES} cases`);
      return undefined;
    }
    const out: HandCase[] = [];
    for (const [i, c] of raw.entries()) {
      const o = c as Record<string, unknown> | null;
      const name = typeof o?.name === "string" && o.name.trim() ? o.name : `case ${i + 1}`;
      const hasExpected = o !== null && typeof o === "object" && "expected" in o;
      const hasRefused = o !== null && typeof o === "object" && "refused" in o;
      const hasInput = o !== null && typeof o === "object" && ("input" in o || Array.isArray(o.args));
      if (!o || typeof o !== "object" || typeof o.name !== "string" || hasExpected === hasRefused || !hasInput || (hasRefused && (typeof o.refused !== "string" || !o.refused.trim()))) {
        bad(`“${name}” needs a name, an input (or args) and either expected (the answer worked out by hand) or refused (the words of the refusal)`);
        return undefined;
      }
      const params = Array.isArray(o.params) ? o.params : undefined;
      out.push({ name, args: [...(Array.isArray(o.args) ? o.args : [o.input]), ...(params ?? [])], ...(hasExpected ? { expected: o.expected } : { refused: o.refused as string }) });
    }
    return out;
  } finally {
    prepared.cleanup();
  }
}

/** The lines of the implementation whose code never ran, from the offsets of the compiled text. */
function uncoveredLines(compiled: { js: string; map: string } | undefined, ranges: unknown): number[] {
  if (!compiled || !Array.isArray(ranges)) return [];
  const lines = new Set<number>();
  for (const [start, end] of ranges as [number, number][]) {
    const text = compiled.js.slice(start, end);
    const lead = text.length - text.trimStart().length;
    if (!text.trim()) continue;
    const at = position(compiled.js, start + lead);
    const line = sourceLine(compiled.map, at.line, at.column);
    if (line !== null) lines.add(line);
  }
  return [...lines].sort((x, y) => x - y);
}

/** Runs Stryker on the Method, with the checker's own command as its test, and lists each change no input noticed. */
async function mutation(files: ExtensionFiles, implementation: string, job: object, options: RunOptions): Promise<ExtensionProblem[]> {
  const project = mkdtempSync(join(tmpdir(), "ziffr-mut-"));
  try {
    writeFileSync(join(project, implementation), files.get(implementation) ?? "");
    writeFileSync(join(project, "ziffr-job.json"), JSON.stringify({ ...job, file: implementation }));
    writeFileSync(join(project, "package.json"), '{ "name": "mutation", "private": true, "type": "module" }\n');
    const mutant = join(HERE, "sandbox", "mutant.js");
    writeFileSync(join(project, "stryker.config.json"), JSON.stringify({
      mutate: [implementation], testRunner: "command", commandRunner: { command: `"${process.execPath}" "${mutant}"` }, coverageAnalysis: "off",
      reporters: ["json"], jsonReporter: { fileName: "report.json" }, logLevel: "error", concurrency: Math.max(1, Math.min(4, availableParallelism() - 1)),
      timeoutMS: 20_000, tempDirName: "stryker-tmp", cleanTempDir: "always", disableTypeChecks: false, ignoreStatic: false,
    }));
    const bin = join(dirname(require.resolve("@stryker-mutator/core/package.json")), "bin", "stryker.js");
    let tail = "";
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(process.execPath, [bin, "run"], { cwd: project, env: { PATH: process.env.PATH ?? "" }, stdio: ["ignore", "pipe", "pipe"] });
      const timer = setTimeout(() => child.kill("SIGKILL"), options.mutationMs ?? 20 * 60_000);
      for (const s of [child.stdout, child.stderr]) s.on("data", (d: Buffer) => void (tail = (tail + d.toString()).slice(-1500)));
      child.on("error", () => resolve(null));
      child.on("close", (c) => {
        clearTimeout(timer);
        resolve(c);
      });
    });
    let report: { files?: Record<string, { mutants?: { mutatorName: string; replacement?: string; status: string; location: { start: { line: number } } }[] }> };
    try {
      report = JSON.parse(readFileSync(join(project, "report.json"), "utf8"));
    } catch {
      return [problem("mutation-not-run", implementation, null, `the mutation check could not run (${code === null ? "it did not start or was stopped" : `Stryker ended with ${code}`}): ${tail.trim().split("\n").slice(-3).join(" ")}`)];
    }
    const found = new Found();
    for (const m of report.files?.[implementation]?.mutants ?? []) {
      if (m.status !== "Survived" && m.status !== "NoCoverage") continue;
      const to = (m.replacement ?? "").replace(/\s+/g, " ");
      found.add(problem("mutant-survived", implementation, m.location.start.line, `a change here (${m.mutatorName}${to ? `: ${to.length > 60 ? `${to.slice(0, 57)}...` : to}` : ""}) made no case and no comparison with the reference fail: add a case that notices it, or take out code that does nothing.`));
    }
    return found.list;
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

/**
 * Runs the checks that run a Method's code, on an Extension that passed the shape and static checks: determinism (each
 * answer twice, in fresh processes, with the clock and the random generator throwing), the budget, the refusals, the
 * comparison with the reference and the hand cases, 100 % coverage, and the mutation check.
 */
export async function runChecks(files: ExtensionFiles, manifest: ExtensionManifest, options: RunOptions = {}): Promise<ExtensionProblem[]> {
  const implementation = manifest.kind === "method" ? "method.ts" : "mark.ts";
  if (manifest.kind !== "method") return [];
  const limits = options.limits ?? {};
  const found = new Found();
  for (const p of sharedCode(files, implementation)) found.add(p);

  const cases = await readCases(files, limits, found);
  if (!cases) return found.list;
  const params = (manifest.signature.params ?? []).map((p) => p.default);
  const kinds = manifest.signature.inputs.map((i) => i.kind);
  const points = manifest.limits.points;
  const filler = (k: string) => (k === "series" ? [1, 2, 4, 3, 5] : k === "value" ? 1 : []);

  // The inputs: the hand-worked cases, the refusals every Method owes, and generated ones.
  const items: Item[] = cases.map((c) => ({ label: `the case “${c.name}”`, args: c.args, hand: "expected" in c ? { expected: c.expected } : { refused: c.refused } }));
  const base = (cases.find((c) => c.expected !== undefined) ?? cases[0]).args.slice(0, kinds.length);
  const baseArgs = kinds.map((k, i) => (i < base.length ? base[i] : filler(k)));
  for (const [i, k] of kinds.entries()) {
    if (k !== "series") continue;
    for (const [what, series] of [["a flat series", [3, 3, 3, 3, 3]], ["a series with a value that is not a number", [1, 2, Number.NaN, 4, 5]], ["an empty series", []], ["a series of one value", [1]]] as [string, number[]][]) {
      items.push({ label: what + (kinds.filter((x) => x === "series").length > 1 ? ` as ${manifest.signature.inputs[i].name}` : ""), args: [...baseArgs.map((a, j) => (j === i ? series : a)), ...params], refusal: true });
    }
  }
  const generatedCount = options.generated ?? 200;
  const arbs = kinds.map((k) => arbitraryFor(k, points));
  if (generatedCount > 0 && arbs.every((a) => a !== undefined)) {
    const paramArbs = (manifest.signature.params ?? []).map((p) => fc.double({ min: p.min, max: p.max, noNaN: true }));
    const made = fc.sample(fc.tuple(...(arbs as fc.Arbitrary<unknown>[]), ...paramArbs), { seed: options.seed ?? 115, numRuns: generatedCount });
    made.forEach((args, n) => items.push({ label: `generated input ${n + 1}`, args }));
  }

  // The budget: the worst inputs, a series of the longest length, in a run of their own, so that a kill names the input.
  const budget: Item[] = [];
  for (const [i, k] of kinds.entries()) {
    if (k !== "series") continue;
    for (const [what, series] of budgetSeries(points)) budget.push({ label: what, args: [...baseArgs.map((a, j) => (j === i ? series : a)), ...params] });
  }

  const [first, second, hard] = await Promise.all([
    execute(files, implementation, "", items, limits, true),
    execute(files, implementation, "", items, limits, false),
    execute(files, implementation, "", budget, limits, false),
  ]);
  const okFirst = trouble(first, implementation, items, limits, found);
  trouble(second, implementation, items, limits, found);
  trouble(hard, implementation, budget, limits, found);
  if (found.list.length) return found.list;

  const bytes = (r: Executed) => new Map(r.events.filter((e) => "out" in e).map((e) => [e.i as number, JSON.stringify(e.out)]));
  const [one, two] = [bytes(first), bytes(second)];
  for (const [i, text] of one) {
    if (two.get(i) !== text) found.add(problem("nondeterministic", implementation, null, `gave a different answer the second time ${labelOf(items, i)} (${show(decode(JSON.parse(text)))} then ${show(decode(JSON.parse(two.get(i) ?? "null")))}): the same input must give the same bytes in every run.`));
  }
  if (found.list.length || !okFirst) return found.list;

  // The reference, run the same way, on every input but the budget's.
  const reference = await execute(files, "reference.ts", "reference", items, limits, false);
  if (!trouble(reference, "reference.ts", items, limits, found)) return found.list;
  const method = answers(first);
  const ref = answers(reference);
  const relative = manifest.equality?.relative ?? 0;
  for (const [i, item] of items.entries()) {
    const got = method.get(i);
    const want = ref.get(i);
    if (item.hand) {
      for (const [who, ans, file] of [["Method", got, implementation], ["reference", want, "reference.ts"]] as const) {
        const right = item.hand.refused !== undefined ? isRefusal(ans) && (ans as { refused: string }).refused === item.hand.refused : same(item.hand.expected, ans, relative);
        if (!right) found.add(problem("differs-from-case", file, null, `the ${who} gave ${show(ans)} ${labelOf(items, i)}, but the case says ${item.hand.refused !== undefined ? `it refuses with “${item.hand.refused}”` : show(item.hand.expected)}.`));
      }
    } else if (item.refusal) {
      if (!isRefusal(got)) found.add(problem("no-refusal", implementation, null, `returned ${show(got)} ${labelOf(items, i)} instead of refusing: a flat, empty, too short or non-numeric series has no answer, and the Method must say so in words.`));
      else if ((got as { refused: string }).refused.trim().split(/\s+/).length < MIN_REFUSAL_WORDS) found.add(problem("no-refusal", implementation, null, `refused ${labelOf(items, i)} without saying why: its refusal must be a sentence in words.`));
    }
    if (!same(want, got, relative)) found.add(problem("differs-from-reference", implementation, null, `gave ${show(got)} ${labelOf(items, i)}, the reference gave ${show(want)}${relative > 0 ? ` (relative tolerance ${relative})` : " (they must be exactly equal)"}.`));
  }
  if (found.list.length) return found.list;

  // Path coverage: every block of the implementation ran for some input.
  const { uncovered } = (first.events.find((e) => e.done) ?? {}) as { uncovered?: unknown };
  for (const line of uncoveredLines(first.compiled, uncovered)) found.add(problem("uncovered-code", implementation, line, "never ran for any case, refusal or generated input: take out code that cannot be reached, or add a case that reaches it."));
  if (found.list.length || options.mutation === false) return found.list;

  // The mutation check: what the Method and the reference agree on is the right answer for every input.
  const expect = items.map((item, i) => (item.hand ? (item.hand.refused !== undefined ? { refused: item.hand.refused } : { answer: encode(item.hand.expected) }) : isRefusal(ref.get(i)) ? { refused: "" } : { answer: encode(ref.get(i)) }));
  return mutation(files, implementation, { inputs: items.map((i) => encode(i.args)), expect, relative, perCallMs: limits.perCallMs ?? LIMITS.perCallMs, heapMb: limits.heapMb ?? LIMITS.heapMb }, options);
}
