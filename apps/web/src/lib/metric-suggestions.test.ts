// The suggestions for a first Metric (GLOSSARY: Metric Catalog, First Steps, Setup Guide): what each kind of answer is
// offered, and that every name that may be suggested is an entry of the shared Metric Catalog and has its plain
// sentence.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOPICS } from "@ziffr/core/first-steps-screens";
import type { CatalogMetric, Period } from "@ziffr/core/types";
import { INDUSTRIES, SEGMENTS } from "@ziffr/core/workspace-profile";
import { BUSINESS_FUNCTIONS } from "@ziffr/pack/business-functions";
import { BY_FUNCTION, BY_INDUSTRY, BY_TOPIC, PLAIN, SUGGESTION_COUNT, suggestForTopic, suggestMetrics } from "./metric-suggestions";

const migrations = join(__dirname, "../../../../supabase/migrations");
/** The shared catalog as the migrations seed it: name, period, industries and segments. */
const catalog = ["20261124130500_bigger_metric_catalog.sql", "20261206110000_quarterly_and_yearly_catalog_metrics.sql", "20270212090000_first_steps.sql"]
  .flatMap((f) => readFileSync(join(migrations, f), "utf8").split("\n"))
  .flatMap((line, id) => {
    const head = /^\s*\('(?:[^']|'')+','((?:[^']|'')+)',/.exec(line);
    if (!head) return [];
    const keys = (v: string) => (v === "null" ? null : v.slice(2, -2).split(","));
    const tail = /,(null|'\{[a-z0-9_,]+\}'),(null|'\{[a-z0-9_,]+\}')\)/.exec(line);
    return [{ id, name: head[1], period: /,'(day|week|month|quarter|year)',/.exec(line)?.[1] as Period, industries: tail ? keys(tail[1]) : null, segments: tail ? keys(tail[2]) : null } as CatalogMetric];
  });
const names = (...a: Parameters<typeof suggestMetrics>) => suggestMetrics(...a).map((s) => s.entry.name);
const nothing = { function: null, industry: null, segment: null };

describe("suggestions for a first Metric", () => {
  it("only names entries of the Metric Catalog, each with a sentence", () => {
    const listed = [...Object.values(BY_FUNCTION), ...Object.values(BY_INDUSTRY), ...Object.values(BY_TOPIC)].flat();
    const known = new Set(catalog.map((c) => c.name));
    for (const n of new Set([...listed, ...Object.keys(PLAIN)])) {
      expect(known, n).toContain(n);
      expect(PLAIN[n], n).toBeTruthy();
    }
  });

  it("offers a private and business mix to someone who said nothing", () => {
    expect(names(catalog, nothing)).toEqual(["Body weight", "Revenue", "Running distance", "New customers", "Cash balance", "Customer satisfaction"]);
  });

  it("takes the person's part of the business and the industry in turn, without repeats", () => {
    expect(names(catalog, { function: "sales", industry: "saas", segment: "b2b" })).toEqual(["Deals won", "Monthly recurring revenue", "Revenue", "Sign-ups", "Qualified leads", "Churn rate"]);
  });

  it("never offers what is written for another industry or other customers", () => {
    const private_ = names(catalog, { function: "sales", industry: null, segment: "b2c" });
    expect(private_).not.toContain("Deals won");
    expect(private_).toContain("Revenue");
    expect(names(catalog, { function: "product_engineering", industry: "manufacturing", segment: null })).not.toContain("Daily active users");
    expect(names(catalog, { function: "sales", industry: null, segment: "b2b2c" })).toContain("Deals won");
  });

  it("always fills the list, for every answer", () => {
    for (const f of [null, ...Object.keys(BY_FUNCTION)])
      for (const industry of [null, "other", ...Object.keys(BY_INDUSTRY)])
        for (const segment of [null, "b2b", "b2c"]) expect(names(catalog, { function: f, industry, segment } as Parameters<typeof suggestMetrics>[1]), `${f} ${industry} ${segment}`).toHaveLength(SUGGESTION_COUNT);
  });

  it("offers First Steps up to five business entries that exist, for every role, industry and segment of a team", () => {
    const known = new Set(catalog.map((c) => c.name));
    const private_ = new Set(Object.values(BY_TOPIC).flat());
    for (const f of [null, ...BUSINESS_FUNCTIONS])
      for (const industry of [null, ...INDUSTRIES])
        for (const segment of [null, ...SEGMENTS]) {
          const offered = names(catalog, { function: f, industry, segment, team: true }, 5);
          const who = `${f} ${industry} ${segment}`;
          expect(offered.length, who).toBeGreaterThan(0);
          expect(offered.length, who).toBeLessThanOrEqual(5);
          expect(offered.filter((n) => !known.has(n) || private_.has(n)), who).toEqual([]);
        }
  });

  it("offers a team that skipped every question business entries only", () => {
    expect(names(catalog, { ...nothing, team: true }, 5)).toEqual(["Revenue", "New customers", "Cash balance", "Customer satisfaction", "Website visitors"]);
  });

  it("offers each topic its own entries, all of which exist", () => {
    for (const topic of TOPICS) expect(suggestForTopic(catalog, topic).map((s) => s.entry.name), topic).toEqual(BY_TOPIC[topic]);
    expect(suggestForTopic([], "health")).toEqual([]);
  });

  it("prefers the shared entry over a Pack's entry of the same name, and passes over missing ones", () => {
    const own = { ...catalog.find((c) => c.name === "Revenue")!, id: -1 };
    expect(suggestMetrics([...catalog, own], nothing).find((s) => s.entry.name === "Revenue")!.entry.id).not.toBe(-1);
    expect(names([own], nothing)).toEqual(["Revenue"]);
    expect(names([], nothing)).toEqual([]);
  });
});
