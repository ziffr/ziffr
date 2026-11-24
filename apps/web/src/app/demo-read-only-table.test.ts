// Demo Mode is read-only (spec 0029, #271; GLOSSARY: Demo Mode), the quick half: every exported function of every "use server" file
// has a row in the table of demo-read-only.db.test.ts, and every row names a function that exists. It reads the source and needs
// no database, so a new action nobody described fails in the first minutes of CI instead of after the database tests. The
// database test keeps its own "is in the table" check, which imports the files as they run.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const APP = __dirname;
const isSource = (n: string) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n);

/** The files under `dir` that start with "use server". */
const serverFiles = (function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : isSource(n) && /^\s*["']use server["']/.test(readFileSync(p, "utf8")) ? [p] : [];
  });
})(APP);

/** The names a file exports that are functions at run time: `export function`, `export const x = (…) =>`, and `export { a as b }`. */
function exportedFunctions(file: string): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const fns = new Set<string>();
  const names: string[] = [];
  const exported = (n: ts.Node) => ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const isFn = (e?: ts.Expression) => !!e && (ts.isArrowFunction(e) || ts.isFunctionExpression(e));
  for (const s of src.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) {
      fns.add(s.name.text);
      if (exported(s)) names.push(s.name.text);
    } else if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && isFn(d.initializer)) {
          fns.add(d.name.text);
          if (exported(s)) names.push(d.name.text);
        }
      }
    }
  }
  for (const s of src.statements) {
    if (ts.isExportDeclaration(s) && !s.moduleSpecifier && s.exportClause && ts.isNamedExports(s.exportClause) && !s.isTypeOnly) {
      for (const e of s.exportClause.elements) if (!e.isTypeOnly && fns.has((e.propertyName ?? e.name).text)) names.push(e.name.text);
    }
  }
  return names;
}

const TABLE = readFileSync(join(APP, "demo-read-only.db.test.ts"), "utf8");
const rows = [...TABLE.matchAll(/^ {2}"([^"]+:[^"]+)": \{/gm)].map((m) => m[1]);
const keyOf = (file: string, name: string) => `${relative(APP, file).replace(/\.tsx?$/, "")}:${name}`;

describe("every server action in the demo, by its source", () => {
  it("is in the table, and the table names only actions that exist", () => {
    const all = serverFiles.flatMap((f) => exportedFunctions(f).map((n) => keyOf(f, n))).sort();
    expect(all.length).toBeGreaterThan(50);
    expect(rows.length).toBeGreaterThan(50);
    expect(all.filter((k) => !rows.includes(k))).toEqual([]);
    expect(rows.filter((k) => !all.includes(k))).toEqual([]);
  });
});
