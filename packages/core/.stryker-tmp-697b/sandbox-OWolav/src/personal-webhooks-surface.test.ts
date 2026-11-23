// @ts-nocheck
// No other way in (spec 0037, ticket #641; GLOSSARY: Personal Webhook): no API route, MCP tool or SDK call creates,
// changes or points a Personal Webhook, because changing where data leaves is what a prompt-injected assistant would be
// asked to do. A static check of every file those surfaces are made of; a later ticket that adds a page adds server
// actions, never anything under these folders.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? (n === "node_modules" || n === "dist" ? [] : files(p)) : /\.(ts|tsx|json|md)$/.test(n) ? [p] : [];
});
const surfaces = [join(root, "apps/web/src/app/api"), join(root, "apps/web/src/app/mcp"), join(root, "packages/mcp/src"), join(root, "packages/sdk/src")];
const apiCore = readdirSync(__dirname).filter((n) => /^(api|mcp)-.*\.ts$/.test(n)).map((n) => join(__dirname, n));

describe("no API route, MCP tool or SDK call reaches a Personal Webhook", () => {
  it("names none in the API, the MCP server or the SDK", () => {
    const all = [...surfaces.flatMap(files), ...apiCore].filter((f) => !/\.test\.tsx?$/.test(f));
    expect(all.length).toBeGreaterThan(20);
    const hits = all.filter((f) => /personal[-_ ]?webhook|personalWebhook/i.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("has no Webhook route but the inbound one, and no route file that makes or changes one", () => {
    const routes = files(join(root, "apps/web/src/app/api/webhooks")).filter((f) => /route\.ts$/.test(f)).map((f) => f.slice(root.length + 1));
    expect(routes).toEqual(["apps/web/src/app/api/webhooks/[id]/in/route.ts"]);
    const text = readFileSync(join(root, routes[0]), "utf8");
    expect(text).not.toMatch(/createWebhook|updateWebhook|deleteWebhook|replaceWebhookSecret|setWebhookEnabled/);
  });
});
