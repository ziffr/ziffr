// GLOSSARY: Business Function, Setup Guide. The Workspace Export, the API, the MCP Server and the SDK never name the
// Setup Guide's tables or a person's Business Function (threat model, "Learning about a person or business through the
// Setup Guide"): a source check, so adding one of them there fails here first.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const FORBIDDEN = /business_function|businessFunction|setup_guide|test_message_sends/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("Setup Guide privacy", () => {
  it("the Workspace Export files name no guide table and no function", () => {
    for (const f of ["workspace-export.ts", "workspace-export-file.ts", "workspace-import.ts"]) {
      expect(readFileSync(`${root}packages/core/src/${f}`, "utf8"), f).not.toMatch(FORBIDDEN);
    }
  });
  it("no API route, MCP tool or SDK file names them", () => {
    const dirs = ["apps/web/src/app/api", "packages/mcp/src", "packages/sdk/src"].map((d) => `${root}${d}`);
    for (const f of dirs.flatMap((d) => { try { return sources(d); } catch { return []; } })) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(FORBIDDEN);
    }
  });
});
