// The demo shows Tags and calculated Metrics, and each Metric says what it is and why it matters (GLOSSARY: Tag, Derived
// Metric, Metric Description, Demo Mode). The demo is reset first, so this also tests that the nightly reset makes them,
// and read through the same core functions the app and MCP use, as the demo's Owner.
import { beforeAll, describe, expect, it } from "vitest";
import { getMetric, listMetrics, listObservations } from "./api";
import { db } from "./db";
import { metricIdsWithTags, metricTagNames, visibleTags } from "./tag-sight";
import { DEMO_WORKSPACE_ID } from "./team";
import type { Actor } from "./actor";

const sara: Actor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };

beforeAll(async () => {
  const { error } = await db().rpc("demo_reset", { min_gap: "0 seconds" });
  expect(error).toBeNull();
}, 120_000);

describe("the demo's calculated Metrics", () => {
  it.each([
    ["margin", "Revenue minus Cost"],
    ["average-order-value", "Revenue divided by Orders"],
    ["cost-per-order", "Cost divided by Orders"],
    ["tickets-per-100-orders", "times 100"],
    ["revenue-growth", "last month"],
  ])("%s is calculated and its description says from what", async (slug, hint) => {
    const m = await getMetric(sara, slug);
    expect(m.derived).toBe(true);
    expect(m.description).toContain("Calculated from");
    expect(m.description).toContain(hint);
  });

  it("have values for the periods their inputs have, and none where an input is missing", async () => {
    for (const slug of ["cost-per-order", "tickets-per-100-orders", "revenue-growth"]) {
      const page = await listObservations(sara, slug, { limit: 100 });
      expect(page.items.length, slug).toBeGreaterThan(6);
      for (const o of page.items) expect(Number.isFinite(o.value), `${slug} ${o.period}`).toBe(true);
    }
    // A change needs the month before: the first month of Revenue has none, so Revenue growth has one month fewer.
    const revenue = await listObservations(sara, "revenue", { limit: 100 });
    const growth = await listObservations(sara, "revenue-growth", { limit: 100 });
    expect(growth.items.length).toBe(revenue.items.length - 1);
  });
});

describe("the demo's Monthly overview", () => {
  it("draws Cost per order as a line, once, after a reset", async () => {
    const dash = await db().from("dashboards").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("name", "Monthly overview").single().throwOnError();
    const metric = await db().from("metrics").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("slug", "cost-per-order").single().throwOnError();
    const { data } = await db().from("widgets").select("template, metric_ids").eq("dashboard_id", dash.data!.id).contains("metric_ids", [metric.data!.id]).throwOnError();
    expect(data).toEqual([{ template: "line", metric_ids: [metric.data!.id] }]);
  });
});

describe("the demo's descriptions", () => {
  it("say more than what the number is, for every Metric", async () => {
    const page = await listMetrics(sara, { limit: 200 });
    expect(page.items.length).toBeGreaterThanOrEqual(19);
    for (const m of page.items) expect(m.description.length, m.slug).toBeGreaterThan(90);
  });
});

describe("the demo's Tags", () => {
  it("are a handful of plain words, each on at least one Metric", async () => {
    const tags = await visibleTags(sara);
    expect(tags.map((t) => t.name).sort()).toEqual(["board", "customers", "finance", "operations", "sales", "weekly review", "wholesale"]);
    for (const t of tags) expect(t.metrics, t.name).toBeGreaterThan(0);
  });

  it("are on every Metric, and at most ten of them", async () => {
    const page = await listMetrics(sara, { limit: 200 });
    const names = await metricTagNames(sara);
    expect(names.size).toBe(page.items.length);
    for (const [id, own] of names) {
      expect(own.length, `metric ${id}`).toBeGreaterThan(0);
      expect(own.length).toBeLessThanOrEqual(10);
    }
  });

  it("find Metrics, and two together narrow", async () => {
    const finance = await metricIdsWithTags(sara, ["finance"]);
    const both = await metricIdsWithTags(sara, ["finance", "board"]);
    expect(both.length).toBeGreaterThan(0);
    expect(both.length).toBeLessThan(finance.length);
    expect(await metricIdsWithTags(sara, ["Finance"])).toEqual(finance);
  });

  it("are made again by a reset, so none lingers without a Metric", async () => {
    const { error } = await db().rpc("demo_reset", { min_gap: "0 seconds" });
    expect(error).toBeNull();
    const { count } = await db().from("tags").select("id", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID);
    expect(count).toBe(7);
  }, 120_000);
});
