// The first screen of "Explore on my own" (GLOSSARY: Setup Guide, Metric Catalog): the confirmed choice, the plain
// suggestion cards, the ways on, and that nothing calculated and nothing about Packs is offered.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CatalogMetric } from "@ziffr/core/types";
import { GuidedPick } from "./guided-pick";

const entry = { id: 7, category: "Finance", name: "Revenue", description: "Net revenue invoiced in the month.", unit: "€", unit_position: "before", format: "currency", decimals: 0, period: "month", submission_rule: "overwrite", polarity: "higher", aggregation: "sum", target_min: null, target_max: null, sources: [], industries: null, segments: null, tags: ["money"] } as unknown as CatalogMetric;
const html = () => renderToStaticMarkup(<GuidedPick suggestions={[{ entry, line: "What you billed your customers." }]} items={[entry]} fit={null} money={{ unit: "€", unit_position: "before" }} numberStyle={"de" as never} />);

describe("the guided new Metric screen", () => {
  it("confirms the choice and offers a suggestion, one's own and the whole catalog, in plain words", () => {
    const h = html();
    expect(h).toContain("OK, from scratch. Let’s do your first metric together");
    expect(h).toContain("A metric is one number you keep track of over time.");
    expect(h.indexOf("Pick a suggestion")).toBeLessThan(h.indexOf("Define it yourself"));
    expect(h).toContain("What you billed your customers.");
    expect(h).toContain("Every month");
    expect(h).toContain('href="/metrics/new?catalog=7&amp;setup=1"');
    expect(h).toContain('href="/metrics/new?scratch=1&amp;setup=1"');
    expect(h).toContain('href="/setup?step=start"');
    expect(h).toContain("Show all suggestions");
    expect(h).toContain('aria-label="Search the Metric Catalog"');
    // No targets, no Tags, no talk of Packs or Workflows, no calculation.
    expect(h).not.toMatch(/Target|>money<|Pack|Workflow|Calculat|derived=1/);
  });
});
