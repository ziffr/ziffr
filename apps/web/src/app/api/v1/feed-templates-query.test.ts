// Automation Templates for Feeds against the API that takes their calls (GLOSSARY: Automation Template, Feed): what
// each shipped workflow puts in the address of GET /api/v1/feed must be what that endpoint accepts, or every run of
// it fails at its first call. Here the templates meet the app's own schema; no server, n8n or account is needed.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pageQuery } from "./schemas";

type Node = { name: string; parameters: { queryParameters?: { parameters: { name: string; value: string }[] } } };

const dir = new URL("../../../../../../docs/automations/", import.meta.url);
const templates = readdirSync(dir).filter((f) => f.endsWith("-feed.json"));

describe("what a Feed template asks GET /api/v1/feed", () => {
  it("is asked by at least the templates Ziffr ships", () => {
    expect(templates.length).toBeGreaterThanOrEqual(6);
  });
  for (const file of templates) {
    it(`${file}: its query is one the endpoint takes`, () => {
      const nodes = (JSON.parse(readFileSync(new URL(file, dir), "utf8")) as { nodes: Node[] }).nodes;
      const ask = nodes.find((n) => n.name === "What is filled")!;
      const query = Object.fromEntries((ask.parameters.queryParameters?.parameters ?? []).map((p) => [p.name, p.value]));
      expect(pageQuery.safeParse(query).error?.issues ?? []).toEqual([]);
    });
  }
});
