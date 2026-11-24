// The demo runs every analysis (ticket #987; GLOSSARY: Demo Mode, Method, Takeaway, Heads-up, Analysis Recipe, Breakdown, Formula Tree). The demo has three
// years of monthly and weekly history (prototype_seed_history), with the relations that each analysis has something to find: so every entry of the method
// picker gives a Takeaway (an answer, never "not enough"), the four tiles (Forecast, Correlation, Drivers, Correlation matrix) show results, the built-in
// Recipes and the marks have what they draw, and the Heads-ups say a few things, not a flood. What each analysis needs of the data is in
// docs/reviews/2026-11-demo-data-for-analyses.md; the canvas chosen for each entry is in CASES below.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { seriesFor, visibleMetricIds } from "./access";
import { listPicker, runPicker } from "./analysis-picker";
import { BUILT_IN_RECIPES, RECIPES } from "./built-in-recipes";
import { correlate, rankCorrelations } from "./correlation";
import { db, seedingDemo } from "./db";
import { latestOfEach } from "./display-periods";
import { yearStartOf } from "./fiscal-year";
import { breakdownTreeFromData } from "./breakdown-tree";
import { treeFromData } from "./formula-tree";
import { listHeadsUps, resetHeadsUpBudget, scanWorkspace } from "./heads-ups";
import { ENTRIES } from "./method-picker";
import { polarModel, radarInputs, radarModel } from "./polar-marks";
import { runRecipe } from "./recipe-run";
import { forecastTakeaway } from "./takeaways/forecast";
import { DEMO_WORKSPACE_ID } from "./team";
import { getMetrics } from "./workspace-data";
import { numberStyleOf } from "./workspace-settings";
import type { Metric } from "./types";

const sara = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" as const };
const ids: Record<string, number> = {};
let metrics: Metric[] = [];
const id = (slug: string) => ids[slug];

beforeAll(async () => {
  // The demo as the nightly reset makes it: the seed, then the three years of history.
  expect((await db().rpc("demo_reset", { min_gap: "0 seconds" })).error).toBeNull();
  expect((await db().rpc("prototype_seed_history")).error).toBeNull();
  metrics = await getMetrics(DEMO_WORKSPACE_ID);
  for (const m of metrics) ids[m.slug] = m.id;
}, 120_000);
afterEach(() => { vi.useRealTimers(); });
// Other files read the demo as supabase/seed.sql leaves it (the pinned dashboards, the finished period of the close): this file seeds it again, so it leaves it so.
afterAll(async () => {
  for (const fn of ["demo_reset", "prototype_seed_history", "prototype_seed_pins", "prototype_seed_close", "prototype_seed_fill_in"]) {
    expect((await db().rpc(fn, fn === "demo_reset" ? { min_gap: "0 seconds" } : {})).error, fn).toBeNull();
  }
}, 120_000);

// Each picker entry with the canvas chosen to suit it: the Metrics on the canvas, in the Slots, the settings, and what it shows (`says`, a part of the sentence).
const CASES: { entry: string; canvas: string[]; slots: Record<string, string[]>; settings?: Record<string, number | string>; says?: RegExp; why: string }[] = [
  { entry: "forecast", canvas: ["revenue"], slots: { metric: ["revenue"] }, says: /expected to be/, why: "42 months with a December peak: three seasons for Holt-Winters" },
  { entry: "reach-target", canvas: ["revenue"], slots: { metric: ["revenue"] }, says: /120,000/, why: "Revenue has a Target Range (120,000 or more) and a budget" },
  { entry: "matrix", canvas: ["new-leads-weekly", "trial-signups-weekly", "orders-shipped-weekly"], slots: { metrics: ["new-leads-weekly", "trial-signups-weekly", "orders-shipped-weekly"] }, says: /move together/, why: "three weekly Metrics: every pair, the strongest one in the sentence" },
  { entry: "correlation", canvas: ["support-tickets-weekly", "refunds-weekly"], slots: { first: ["support-tickets-weekly"], second: ["refunds-weekly"] }, why: "two weekly Metrics, 156 weeks, one planted to follow the other" },
  { entry: "rank", canvas: ["new-leads-weekly", "trial-signups-weekly"], slots: { first: ["new-leads-weekly"], second: ["trial-signups-weekly"] }, says: /move together/, why: "leads and sign-ups rise and fall together, both stepped up by the campaign" },
  { entry: "partial", canvas: ["new-leads-weekly", "trial-signups-weekly", "orders-shipped-weekly"], slots: { first: ["new-leads-weekly"], second: ["trial-signups-weekly"], held: ["orders-shipped-weekly"] }, says: /held the same/, why: "the same pair with the shop's busy weeks held the same" },
  { entry: "lag", canvas: ["support-tickets-weekly", "refunds-weekly"], slots: { first: ["support-tickets-weekly"], second: ["refunds-weekly"] }, says: /1 week before Refunds/, why: "Refunds follow Support tickets by one week" },
  { entry: "moves", canvas: ["trial-signups-weekly", "new-leads-weekly", "support-tickets-weekly"], slots: { metric: ["trial-signups-weekly"], drivers: ["new-leads-weekly", "support-tickets-weekly"] }, says: /New leads moved with Trial sign-ups the most/, why: "Sign-ups explained by leads and by tickets (which have nothing to do with them)" },
  { entry: "needs", canvas: ["trial-signups-weekly", "new-leads-weekly"], slots: { metric: ["trial-signups-weekly"], drivers: ["new-leads-weekly"] }, settings: { goal: 160 }, says: /New leads would need/, why: "what leads must be for 160 sign-ups a week" },
  { entry: "what-if", canvas: ["new-leads-weekly", "trial-signups-weekly"], slots: { metric: ["new-leads-weekly"], others: ["trial-signups-weekly"] }, settings: { percent: 10 }, says: /Trial sign-ups is estimated/, why: "10 % more leads, and what follows for sign-ups" },
  { entry: "after-date", canvas: ["new-leads-weekly", "cancellations-weekly"], slots: { metric: ["new-leads-weekly"], beside: ["cancellations-weekly"] }, settings: { date: "2025-09-01" }, says: /After 1 Sep 2025, New leads ran about .* above/, why: "the autumn campaign began on 1 September 2025, Cancellations are set beside as the Metric it should not touch" },
  { entry: "change-point", canvas: ["new-leads-weekly"], slots: { metric: ["new-leads-weekly"] }, says: /Sep 2025/, why: "leads step up at the campaign" },
  { entry: "bridge", canvas: ["revenue"], slots: { metric: ["revenue"] }, says: /Germany/, why: "Revenue's Breakdown by country for the latest period and the one before" },
  { entry: "usual", canvas: ["orders"], slots: { metric: ["orders"] }, settings: { value: 1500 }, says: /usually between/, why: "42 months of Orders and a value to check" },
  { entry: "top-share", canvas: ["revenue"], slots: { metric: ["revenue"] }, says: /3 largest of 5 rows/, why: "Revenue's latest Breakdown" },
  { entry: "pareto", canvas: ["revenue"], slots: { metric: ["revenue"] }, says: /rows make up/, why: "Revenue's latest Breakdown" },
];

describe("every entry of the method picker gives a Takeaway on the demo", () => {
  it("has a canvas chosen for every entry", () => {
    expect([...new Set(CASES.map((c) => c.entry))].sort()).toEqual(ENTRIES.map((e) => e.id).sort());
  });

  for (const c of CASES) {
    it(`${c.entry}: ${c.why}`, async () => {
      const list = await listPicker(sara, c.canvas.map(id));
      const fit = list.groups.flatMap((g) => g.entries).find((e) => e.id === c.entry)!.fit;
      // Not greyed: the entry fits the canvas.
      expect(fit.ok, fit.ok ? "" : fit.reason).toBe(true);
      const run = await runPicker(sara, { entry: c.entry, slots: Object.fromEntries(Object.entries(c.slots).map(([k, v]) => [k, v.map(id)])), settings: c.settings ?? {} });
      expect(run.ok, run.ok ? "" : run.message).toBe(true);
      if (!run.ok) return;
      // A Takeaway: an answer with a sentence, not a refusal.
      expect(run.takeaway.refusal).toBeNull();
      expect(run.takeaway.kind).toBe("answer");
      if (c.says) expect(run.takeaway.sentence).toMatch(c.says);
    }, 60_000);
  }
});

async function world() {
  const ws = DEMO_WORKSPACE_ID;
  const seen = await visibleMetricIds(ws, "sara", metrics);
  const data = await seriesFor(ws, metrics, seen, metrics.map((m) => m.id));
  const resolve = (slug: string) => { const metric = metrics.find((m) => m.slug === slug); return metric && { metric, points: data.series[slug] ?? [] }; };
  return { data, resolve, yearStart: await yearStartOf(ws), style: await numberStyleOf(ws), by: (slug: string) => metrics.find((m) => m.slug === slug)! };
}

describe("the tiles show results on the demo", () => {
  it("Forecast, with one Metric", async () => {
    const { data, style, by } = await world();
    const t = forecastTakeaway(by("revenue"), latestOfEach(data.series.revenue), { style });
    expect(t.kind).toBe("answer");
  });

  it("Correlation, with two Metrics (a weekly one and a monthly one too)", async () => {
    const { resolve, yearStart, by } = await world();
    for (const [a, b] of [["support-tickets-weekly", "refunds-weekly"], ["margin", "support-tickets-weekly"], ["revenue", "orders"]]) {
      const c = correlate(by(a), by(b), resolve, { yearStart });
      expect(c.ok, c.ok ? "" : c.reason).toBe(true);
    }
    // Months in common between a monthly and a weekly Metric: the demo used to have 2.
    const c = correlate(by("margin"), by("refunds-weekly"), resolve, { yearStart });
    expect(c.ok && c.n).toBeGreaterThanOrEqual(30);
  });

  it("Drivers, with three Metrics, and of Margin with every other Metric of the demo", async () => {
    const { resolve, yearStart, by } = await world();
    const three = rankCorrelations(by("margin"), [by("orders"), by("support-tickets"), by("refunds-weekly")], resolve, { yearStart });
    expect(three.leftOut).toEqual([]);
    expect(three.ranked).toHaveLength(3);
    // The owner's report: Drivers of Margin said "No other metric with enough periods in common".
    const all = rankCorrelations(by("margin"), metrics.filter((m) => m.slug !== "margin"), resolve, { yearStart });
    expect(all.leftOut.map((l) => `${l.metric.slug}: ${l.reason}`)).toEqual([]);
    expect(all.ranked.length).toBeGreaterThanOrEqual(10);
  });

  it("Correlation matrix, with four Metrics", async () => {
    const { resolve, yearStart, by } = await world();
    for (const four of [["revenue", "orders", "cost", "support-tickets"], ["support-tickets-weekly", "refunds-weekly", "new-leads-weekly", "trial-signups-weekly"], ["margin", "orders", "return-rate", "support-tickets-weekly"]]) {
      const cells = four.flatMap((a) => four.filter((b) => b !== a).map((b) => correlate(by(a), by(b), resolve, { yearStart })));
      expect(cells.filter((c) => !c.ok).map((c) => (c.ok ? "" : c.reason))).toEqual([]);
    }
  });
});

describe("the built-in Recipes and the marks have what they need", () => {
  it("runs each built-in Recipe on a demo Metric and gets values", async () => {
    const { data } = await world();
    const s = (slug: string) => latestOfEach(data.series[slug] ?? []).map((p) => ({ period: p.period, value: p.value }));
    const inputs: Record<string, string[]> = {
      "moving-average": ["revenue"], growth: ["revenue"], trend: ["orders"], seasonality: ["revenue"], "z-score": ["cost"],
      correlation: ["support-tickets-weekly", "refunds-weekly"], share: ["return-rate", "support-tickets"],
    };
    expect(Object.keys(inputs).sort()).toEqual([...RECIPES].sort());
    for (const r of RECIPES) {
      const out = runRecipe(BUILT_IN_RECIPES[r], inputs[r].map(s));
      for (const [step, res] of Object.entries(out)) {
        expect(res.kind === "series" ? res.points.length : res.value, `${r} / ${step}`).toBeTruthy();
      }
    }
  });

  it("draws the Formula Tree of Margin and the tree of Revenue's Breakdown, with parts", async () => {
    const { data, style, yearStart } = await world();
    const common = { metrics, series: data.series, targets: data.targets, condensed: data.condensed, yearStart, numberStyle: style, breakdowns: data.breakdowns };
    const margin = treeFromData(metrics.find((m) => m.slug === "margin"), common);
    expect(margin.ok, margin.ok ? "" : margin.refusal).toBe(true);
    const revenue = metrics.find((m) => m.slug === "revenue")!;
    const tree = breakdownTreeFromData(revenue, common);
    expect(tree.ok, tree.ok ? "" : tree.refusal).toBe(true);
    // Parts under Germany and Austria in the latest period.
    const latest = Object.keys(data.breakdowns[revenue.id]).sort().at(-1)!;
    expect(data.breakdowns[revenue.id][latest].filter((r) => (r.parts?.length ?? 0) > 0).map((r) => r.label)).toEqual(["Germany", "Austria"]);
  });

  it("draws a polar plot of a year of Revenue and a radar of four Metrics", async () => {
    const { data, style, yearStart } = await world();
    const revenue = latestOfEach(data.series.revenue);
    const polar = polarModel({ name: "Revenue", points: revenue, by: "month", from: revenue.at(-12)!.period, to: revenue.at(-1)!.period, label: (p) => p, write: (v) => String(v) });
    expect(polar.ok, polar.ok ? "" : polar.reason).toBe(true);
    const four = ["revenue", "orders", "support-tickets", "return-rate"].map((s) => metrics.find((m) => m.slug === s)!);
    const radar = radarModel(radarInputs(four, { metrics, series: data.series, targets: data.targets, yearStart, numberStyle: style }, {}, false), { window: 1, style });
    expect(radar.ok, radar.ok ? "" : radar.reason).toBe(true);
  });
});

describe("the Heads-ups say a few things on the demo, not a flood", () => {
  // The job never scans the demo; the demo's reset does, as the job would. The weekly Metrics have dates of their own (the landing examples),
  // and the monthly ones follow the calendar, so each is looked at on a day when it is current.
  async function headsOn(day: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${day}T12:00:00Z`));
    resetHeadsUpBudget();
    await seedingDemo(() => scanWorkspace(DEMO_WORKSPACE_ID, new Date().toISOString(), day));
    const heads = await listHeadsUps(sara);
    vi.useRealTimers();
    return heads;
  }

  it("moving together, from the weekly Metrics: Support tickets go before Refunds by a week", async () => {
    const heads = await headsOn("2026-11-23");
    expect(heads.length).toBeLessThanOrEqual(8);
    const together = heads.filter((h) => h.kind === "moving-together");
    expect(together.map((h) => h.takeaway.sentence).join(" ")).toContain("Support tickets and Refunds have started moving together");
  });

  it("a link that stopped and a Target out of reach, from the monthly Metrics", async () => {
    const { data } = await db().from("observations").select("period_start").eq("metric_id", id("new-customers")).order("period_start", { ascending: false }).limit(1);
    const last = new Date(`${data![0].period_start}T00:00:00Z`);
    // The month after the last value, in its first days.
    const day = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 6)).toISOString().slice(0, 10);
    const heads = await headsOn(day);
    expect(heads.length).toBeLessThanOrEqual(8);
    const said = heads.map((h) => `${h.kind}: ${h.takeaway.sentence}`).join("\n");
    expect(said).toContain("stopped-moving-together: Marketing spend and New customers used to move together");
    expect(said).toMatch(/target-out-of-reach: New customers is unlikely to reach 450/);
  });
});

describe("who sees what has not changed", () => {
  it("shows the two new Metrics to nobody but the Owner and the Admin, and the Guest the same as before", async () => {
    for (const person of ["anna", "mia", "lena", "tom", "jonas", "greta"]) {
      const seen = await visibleMetricIds(DEMO_WORKSPACE_ID, person, metrics);
      expect(seen.has(id("marketing-spend")), person).toBe(false);
      expect(seen.has(id("new-customers")), person).toBe(false);
    }
    const guest = [...(await visibleMetricIds(DEMO_WORKSPACE_ID, "greta", metrics))].map((i) => metrics.find((m) => m.id === i)!.slug).sort();
    // What the Monthly overview dashboard shares with the Guest, as before.
    expect(guest).toEqual(["cost", "margin", "orders", "revenue", "support-tickets"]);
  });
});
