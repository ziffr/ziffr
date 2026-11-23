// Where a Business Function must never appear (GLOSSARY: Business Function; spec 0052): no API route and no MCP tool
// reads or returns one, and nothing in the files a program or a shared page is made from mentions it. A source scan, so a
// later change that adds one fails here and asks for a decision.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? (n === "node_modules" ? [] : files(p)) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
});
const MENTION = /business[_-]?function/i;

describe("a Business Function reaches no program and no shared page", () => {
  it.each([
    ["the API routes", "apps/web/src/app/api"],
    ["the MCP Server", "packages/mcp/src"],
    ["the SDK", "packages/sdk/src"],
    ["the View Link pages", "apps/web/src/app/view"],
    ["the Snapshot pages", "apps/web/src/app/snapshots"],
    ["the Workspace Export", "packages/pack/src/workspace-export.ts"],
  ])("%s never mention one", (_name, rel) => {
    const path = join(ROOT, rel);
    let list: string[] = [];
    try { list = statSync(path).isDirectory() ? files(path) : [path]; } catch { /* a folder this checkout does not have */ }
    for (const f of list) expect(MENTION.test(readFileSync(f, "utf8")), f).toBe(false);
  });

  it("the only core files that read the table are the guide's own and the module that guards it", () => {
    const readers = files(join(ROOT, "packages/core/src")).filter((f) => /business_functions/.test(readFileSync(f, "utf8"))).map((f) => f.slice(ROOT.length + 1)).sort();
    expect(readers).toEqual(["packages/core/src/business-function.ts", "packages/core/src/setup-guide.ts"]);
  });
});
