// Tags are kept in order on the Tags page only (spec 0038, ticket #659): no API route and no MCP tool renames, merges or
// deletes a Tag, since that changes many Metrics at once and is what a prompt-injected assistant would be asked to do.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openApiDocument } from "../openapi";

const here = fileURLToPath(new URL(".", import.meta.url));

/** Every route.ts under /api/v1 that is about Tags, as the files' own text. */
function tagRoutes(dir = join(here, ".."), found: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) tagRoutes(p, found);
    else if (n === "route.ts" && /\/tags(\/|$)/.test(p)) found.push(readFileSync(p, "utf8"));
  }
  return found;
}

describe("Tags in the API and the MCP Server", () => {
  it("has one read-only Tag route and no way to rename, merge or delete a Tag", () => {
    const doc = openApiDocument() as { paths: Record<string, Record<string, unknown>> };
    const tagPaths = Object.entries(doc.paths).filter(([p]) => /tag/i.test(p));
    expect(tagPaths.map(([p, ops]) => [p, Object.keys(ops)])).toEqual([["/tags", ["get"]]]);
    const files = tagRoutes();
    expect(files).toHaveLength(1);
    expect(files[0]).not.toMatch(/export const (POST|PATCH|PUT|DELETE)/);
    expect(files[0]).not.toMatch(/renameTag|mergeTags|deleteTag/);
  });
  it("has one MCP tool about Tags, which only reads", () => {
    const src = readFileSync(join(here, "../../../../../../../packages/mcp/src/server.ts"), "utf8");
    const tools = [...src.matchAll(/server\.registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(tools.filter((t) => /tag/.test(t))).toEqual(["list_tags"]);
    expect(src).not.toMatch(/renameTag|mergeTags|deleteTag|rename_tag|merge_tags|delete_tag/);
  });
  it("never lets the core's keeper functions be called from the API", () => {
    for (const dir of ["../metrics", "../tags"]) {
      const text = readdirSync(join(here, dir), { recursive: true }).filter((f) => /\.ts$/.test(String(f)) && !/test\.ts$/.test(String(f))).map((f) => readFileSync(join(here, dir, String(f)), "utf8")).join("\n");
      expect(text).not.toMatch(/renameTag|mergeTags|deleteTag/);
    }
  });
});
