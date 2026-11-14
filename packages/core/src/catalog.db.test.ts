// The Metric Catalog as the migrations leave it (GLOSSARY: Metric Catalog): every entry is a complete, consistent
// Metric Description, so picking one never yields a Metric that combines or reads wrongly.
import { describe, expect, it } from "vitest";
import { metricCatalog } from "./page-data";
import type { CatalogMetric } from "./types";

const INDUSTRIES = ["saas", "ecommerce", "retail", "manufacturing", "logistics", "construction", "hospitality", "professional_services", "agency"];

describe("metricCatalog", () => {
  it("holds about a hundred Metrics in the business categories, each name once", async () => {
    const items = (await metricCatalog()) as CatalogMetric[];
    expect(items.length).toBeGreaterThanOrEqual(100);
    expect(new Set(items.map((c) => c.category))).toEqual(new Set(["Finance", "Sales", "Marketing", "Customers", "Operations", "People", "Product", "E-commerce", "Support", "Personal"]));
    expect(new Set(items.map((c) => c.name.toLowerCase())).size).toBe(items.length);
  });
  it("describes each entry fully and consistently", async () => {
    for (const c of (await metricCatalog()) as CatalogMetric[]) {
      const where = `${c.category} / ${c.name}`;
      expect(c.description, where).toMatch(/^[A-Z].{8,}\.$/);
      expect(c.sources.length, where).toBeGreaterThan(0);
      // A rate cannot be summed over a longer period.
      if (c.format === "percent") expect(c.aggregation, where).toMatch(/^(none|average)$/);
      if (c.target_min !== null && c.target_max !== null) expect(Number(c.target_min), where).toBeLessThanOrEqual(Number(c.target_max));
      for (const i of c.industries ?? []) expect(INDUSTRIES, where).toContain(i);
      for (const s of c.segments ?? []) expect(["b2b", "b2c"], where).toContain(s);
    }
  });
});
