// Automation Templates named by a Pack (spec 0043, ticket 6; GLOSSARY: Pack, Automation Template): a Pack's optional
// `feeds` says which of Ziffr's n8n templates fill which of its Metric Catalog entries. Only ids Ziffr ships, only entries
// of the same Pack that take values, each template and each entry once; installing makes nothing of it, and a Pack
// without it is what it was.
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { checkPack, FEED_TEMPLATE_IDS, PACK_LIMITS, PACK_SCHEMA } from "./pack";
import { manifestOf } from "./packs";
import { PACK } from "./pack.test";
import { repoFile } from "./test/repo-file";

const withFeeds = (feeds: unknown) => ({ ...PACK, feeds });
const problems = (feeds: unknown) => {
  const r = checkPack(JSON.stringify(withFeeds(feeds)));
  return r.ok ? [] : r.problems.map((p) => `${p.path}: ${p.message}`);
};

describe("feeds in a Pack's manifest", () => {
  it("passes a template that fills entries of the Pack, and a Pack without it is unchanged", () => {
    expect(checkPack(JSON.stringify(PACK)).ok).toBe(true);
    const r = checkPack(JSON.stringify(withFeeds([{ template: "google-sheets", fills: ["mrr", "customers"] }])));
    expect(r.ok && r.pack.feeds).toEqual([{ template: "google-sheets", fills: ["mrr", "customers"] }]);
    // It belongs to the manifest, so the install record carries it; it is not an item and is not counted as one.
    expect(r.ok && r.items).toBe(checkPack(JSON.stringify(PACK)).ok && (checkPack(JSON.stringify(PACK)) as { items: number }).items);
    expect(r.ok && manifestOf(r.pack).feeds).toEqual([{ template: "google-sheets", fills: ["mrr", "customers"] }]);
  });

  it("refuses what Ziffr does not ship, an entry that is not the Pack's, a Derived Metric and any repeat", () => {
    expect(problems([{ template: "my-own-flow", fills: ["mrr"] }]).join("\n")).toMatch(/^feeds\[0\]\.template/);
    for (const template of ["https://evil.example/flow.json", "../x", "google-sheets-feed.json", "", 7, null]) {
      expect(problems([{ template, fills: ["mrr"] }]).length, String(template)).toBeGreaterThan(0);
    }
    expect(problems([{ template: "google-sheets", fills: ["nope"] }])).toEqual(["feeds[0].fills[0]: names “nope”, which is not a Metric Catalog entry of this Pack."]);
    // `arpa` of the example Pack is computed from other entries: it takes no values.
    expect(problems([{ template: "google-sheets", fills: ["arpa"] }])[0]).toMatch(/Derived Metric/);
    expect(problems([{ template: "google-sheets", fills: ["mrr", "mrr"] }])).toEqual(["feeds[0].fills[1]: names “mrr” twice."]);
    expect(problems([{ template: "google-sheets", fills: ["mrr"] }, { template: "google-sheets", fills: ["customers"] }])[0]).toMatch(/named already/);
  });

  it("refuses the wrong shape, extra fields, too many and nothing to fill", () => {
    for (const feeds of ["google-sheets", {}, [null], [[]], [{ template: "google-sheets" }], [{ fills: ["mrr"] }], [{ template: "google-sheets", fills: [] }], [{ template: "google-sheets", fills: "mrr" }],
      [{ template: "google-sheets", fills: ["mrr"], url: "https://evil.example" }], [{ template: "google-sheets", fills: ["MRR"] }], [{ template: "google-sheets", fills: [3] }]]) {
      expect(problems(feeds).length, JSON.stringify(feeds)).toBeGreaterThan(0);
    }
    expect(problems(Array.from({ length: PACK_LIMITS.feeds + 1 }, () => ({ template: "google-sheets", fills: ["mrr"] }))).join("\n")).toMatch(/feeds/);
    // __proto__ is read as data, not as a prototype.
    const text = JSON.stringify(withFeeds([{ template: "google-sheets", fills: ["mrr"] }])).replace('"fills":["mrr"]', '"fills":["mrr"],"__proto__":{"x":1}');
    expect(text).toContain("__proto__");
    expect(checkPack(text).ok).toBe(false);
  });

  it("is a JSON Schema another validator agrees with", () => {
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(PACK_SCHEMA);
    expect(validate(withFeeds([{ template: "google-sheets", fills: ["mrr"] }]))).toBe(true);
    expect(validate(withFeeds([{ template: "nope", fills: ["mrr"] }]))).toBe(false);
    expect(validate(withFeeds([{ template: "google-sheets", fills: [] }]))).toBe(false);
  });

  it("names exactly the templates this repository ships, so a Pack can name each and none that is not there", () => {
    const shipped = (JSON.parse(readFileSync(repoFile("docs/automations/feed-templates.json"), "utf8")) as { templates: { id: string }[] }).templates.map((t) => t.id);
    expect([...FEED_TEMPLATE_IDS].sort()).toEqual(shipped.sort());
  });
});
