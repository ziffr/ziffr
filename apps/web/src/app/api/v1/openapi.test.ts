// The API description stays true (spec 0002, ticket #50): the document is valid OpenAPI 3.1, names every endpoint the
// server has, and the committed reference page is what it renders to. UPDATE_REFERENCE=1 rewrites the page.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Validator } from "@seriousme/openapi-schema-validator";
import { describe, expect, it } from "vitest";
import { openApiDocument } from "./openapi";
import { renderReference } from "./reference";

const here = fileURLToPath(new URL(".", import.meta.url));
const referencePath = join(here, "../../../../../../docs/reference/api.md");

/** The route files under /api/v1, as OpenAPI paths with their methods. */
function routes(dir = here, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name.startsWith("[...") || name === "openapi.json") continue;
      out.push(...routes(full, `${prefix}/${name.replace(/^\[(\w+)\]$/, "{$1}")}`));
    } else if (name === "route.ts") {
      for (const m of readFileSync(full, "utf8").matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)) out.push(`${m[1].toLowerCase()} ${prefix}`);
    }
  }
  return out;
}

describe("the OpenAPI document", () => {
  const doc = openApiDocument();
  it("is valid OpenAPI 3.1", async () => {
    const result = await new Validator().validate(structuredClone(doc));
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
    expect(doc.openapi).toBe("3.1.0");
  });
  it("describes exactly the endpoints the server has", () => {
    const described = Object.entries(doc.paths).flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m} ${path}`));
    expect(described.sort()).toEqual(routes().sort());
  });
  it("matches the committed reference page", () => {
    const page = renderReference(doc);
    if (process.env.UPDATE_REFERENCE === "1") writeFileSync(referencePath, page);
    expect(readFileSync(referencePath, "utf8"), "docs/reference/api.md is out of date: run pnpm --filter @ziffr/web api:reference").toBe(page);
  });
});
