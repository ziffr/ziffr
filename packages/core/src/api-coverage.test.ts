// API coverage (ticket #432; GLOSSARY: Access Key, Metric): every exported core operation that changes data is either
// reached by the REST API (apps/web/src/app/api/v1), and so by the MCP server, which only calls the API, or listed in
// docs/api-coverage.md with a reason. The list is what people read to see what programs cannot yet do; this test keeps
// it true. It follows imports and calls with the TypeScript compiler, as the other guards look at code rather than names.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { repoFile } from "./test/repo-file";

const path = (p: string) => fileURLToPath(repoFile(p));
const CORE = path("packages/core/src/");
const API = path("apps/web/src/app/api/v1/");
const LIB = path("apps/web/src/lib/");
const LIST = path("docs/api-coverage.md");

/** The TypeScript files under `dir` that are not tests or test helpers. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "test" || n === "node_modules" ? [] : sources(p);
    return /\.ts$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
  });
}

/** Where the actor is the first parameter: the mark of an operation (rule 2 of AGENTS.md). */
const ACTOR = /^(Actor|KeyActor|InstallationActor|FeedActor)(\s*\|\s*(Actor|KeyActor|InstallationActor|FeedActor))*$/;
/** A permission check: named as one and answering yes or no, or nothing. A guard is not an operation. */
const GUARD_NAME = /^(assert|require|can|may|is|has|ensure|check)[A-Z]/;
/** Calls that change a row (a database function called with `rpc` may too; the operations that only do that are few). */
const WRITES = new Set(["insert", "update", "upsert", "delete"]);

type Fn = { name: string; file: string; node: ts.Node; exported: boolean; refs: Set<Fn>; writes: boolean };

/** Reads the core and the API, and answers which operations change data and which of them the API reaches. */
function scan() {
  const files = [...sources(CORE), ...sources(API), ...sources(LIB)];
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, types: [],
    baseUrl: path("apps/web/"), paths: { "@/*": ["./src/*"] },
  });
  const checker = program.getTypeChecker();
  const fns: Fn[] = [];
  const keyOf = (n: ts.Node) => `${n.getSourceFile().fileName}:${n.pos}`;
  for (const file of files) {
    const sf = program.getSourceFile(file)!;
    ts.forEachChild(sf, (n) => {
      const exported = Boolean(ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
      if (ts.isFunctionDeclaration(n) && n.name) fns.push({ name: n.name.text, file, node: n, exported, refs: new Set(), writes: false });
      if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) fns.push({ name: d.name.text, file, node: d.initializer, exported, refs: new Set(), writes: false });
      }
    });
  }
  const byNode = new Map(fns.map((f) => [keyOf(f.node), f]));
  /** The functions an identifier stands for, through imports. */
  const targets = (id: ts.Identifier): Fn[] => {
    let s = checker.getSymbolAtLocation(id);
    if (s && s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s);
    return (s?.declarations ?? []).flatMap((d) => {
      const node = ts.isVariableDeclaration(d) && d.initializer ? d.initializer : d;
      const t = byNode.get(keyOf(node));
      return t ? [t] : [];
    });
  };
  /** Records what a piece of code calls and whether it writes. */
  const read = (root: ts.Node, into: { refs: Set<Fn>; writes: boolean }) => {
    const walk = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && WRITES.has(n.expression.name.text)) into.writes = true;
      if (ts.isIdentifier(n)) for (const t of targets(n)) into.refs.add(t);
      ts.forEachChild(n, walk);
    };
    walk(root);
  };
  for (const f of fns) read(f.node, f);

  const writes = (f: Fn, seen = new Set<Fn>()): boolean => {
    if (f.writes) return true;
    if (seen.has(f)) return false;
    seen.add(f);
    return [...f.refs].some((r) => writes(r, seen));
  };
  const isOperation = (f: Fn) => {
    if (!f.exported || !f.file.startsWith(CORE) || !("parameters" in f.node)) return false;
    const first = (f.node as ts.SignatureDeclaration).parameters[0]?.type?.getText();
    if (!first || !ACTOR.test(first)) return false;
    const sig = checker.getSignatureFromDeclaration(f.node as ts.SignatureDeclaration);
    const returns = sig ? checker.typeToString(checker.getReturnTypeOfSignature(sig)) : "";
    const guard = GUARD_NAME.test(f.name) && /^(Promise<)?(void|boolean|never)>?$/.test(returns);
    return !guard && writes(f);
  };
  const operations = fns.filter(isOperation);

  // What the API reaches: everything a route file names, followed through helpers and through the API's own layer in
  // the core (api*.ts), but not into other operations, which would count one reached by being part of another.
  const reached = new Set<Fn>();
  const seen = new Set<Fn>();
  const visit = (f: Fn) => {
    if (seen.has(f)) return;
    seen.add(f);
    if (operations.includes(f)) reached.add(f);
    const apiLayer = /\/(api[-.][^/]*|cloud-api)\.ts$/.test(f.file) || f.file === join(CORE, "api.ts");
    if (operations.includes(f) && !apiLayer) return;
    f.refs.forEach(visit);
  };
  for (const file of sources(API)) {
    const entry = { refs: new Set<Fn>(), writes: false };
    read(program.getSourceFile(file)!, entry);
    entry.refs.forEach(visit);
  }
  return { operations: operations.map((f) => ({ name: f.name, file: f.file.slice(CORE.length), reached: reached.has(f) })) };
}

/** The list's entries: name, the reason it sits under (its heading's first word) and the line, from docs/api-coverage.md. */
function listed() {
  const entries: { name: string; reason: string; line: string }[] = [];
  let reason = "";
  for (const line of readFileSync(LIST, "utf8").split("\n")) {
    const h = /^## (app-only|keys-only|planned|internal)\b/.exec(line);
    if (h) reason = h[1]; else if (line.startsWith("## ")) reason = "";
    const e = /^- `(\w+)`/.exec(line);
    if (e && reason) entries.push({ name: e[1], reason, line });
  }
  return entries;
}

describe("API coverage", () => {
  const { operations } = scan();
  const entries = listed();
  const names = new Set(operations.map((o) => o.name));

  it("finds the operations (a scan that finds nothing proves nothing)", () => {
    expect(operations.length).toBeGreaterThan(100);
    expect(operations.some((o) => o.reached)).toBe(true);
    expect(operations.some((o) => !o.reached)).toBe(true);
  });

  it("lists every operation the API does not reach, with a reason", () => {
    const missing = operations.filter((o) => !o.reached && !entries.some((e) => e.name === o.name)).map((o) => `${o.name} (${o.file})`);
    expect(missing, "Not reached by the API and not in docs/api-coverage.md: reach it from a route, or list it with a reason").toEqual([]);
  });

  it("lists nothing that is reached, gone, or twice", () => {
    const reachedNames = new Set(operations.filter((o) => o.reached).map((o) => o.name));
    expect(entries.filter((e) => reachedNames.has(e.name)).map((e) => e.name), "Reached now: remove from docs/api-coverage.md").toEqual([]);
    expect(entries.filter((e) => !names.has(e.name)).map((e) => e.name), "No such operation any more: remove from docs/api-coverage.md").toEqual([]);
    const all = entries.map((e) => e.name);
    expect(all.filter((n, i) => all.indexOf(n) !== i)).toEqual([]);
  });

  it("names a ticket for every entry that is planned or waits for keys", () => {
    expect(entries.filter((e) => (e.reason === "planned" || e.reason === "keys-only") && !/#\d+/.test(e.line)).map((e) => e.name)).toEqual([]);
  });
});
