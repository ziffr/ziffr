// The same number everywhere (spec 0022, Testing Decisions; GLOSSARY: Metric, Display Period, Snapshot, View Link,
// Comparison): one fixed Workspace in the database, one Metric, and every path a value takes to a person or a
// program: a widget's data, a Snapshot, a live and a frozen View Link, a Comparison, the deck export's values, the
// trial's CSV download and the API's values. Each must show the reference's number, worked out from the values as
// they were sent; a path that computes on its own fails here. The same values over HTTP and through the MCP Server's
// tools are checked in apps/web/src/same-number.db.test.ts, with the fixture this file exports.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCanvasData } from "./access";
import { listObservations } from "./api";
import { actorForKey, createAccessKey } from "./access-keys";
import type { KeyActor } from "./actor";
import { submitObservation } from "./api-submissions";
import { compare, resolverFrom } from "./compare";
import { createDashboard, placeWidget } from "./dashboards";
import { shownSeries } from "./display-periods";
import { chartValue, exportedChange } from "./export-values";
import { formatValue } from "./format";
import { openSnapshot, takeSnapshot } from "./snapshots";
import { trialValuesCsv } from "./trial-end";
import type { CanvasData, Metric } from "./types";
import { createViewLink, openViewLink } from "./view-links";
import { workspace } from "./test/db-fixtures";
import { referenceChangeOf } from "./test/reference/change";
import { valueMismatch } from "./test/reference/check";
import { referenceSeries, type ReferenceSpan } from "./test/reference/combine";
import { exactOf, isNearestDouble, roundedText } from "./test/reference/exact";
import { refMovingAverage } from "./test/reference/recipes";
import { BUILT_IN_RECIPES } from "./built-in-recipes";
import { designRecipe, formatOutput } from "./design-analysis";
import { designWithRecipe } from "./design-files";
import { referenceChange, referenceValue } from "./test/reference/write";

// A year of monthly values chosen to break floating point: sums of 0.1 and 0.2, values ending in 5 at the rounding
// digit, a million beside a cent, thirds that add up to 100. March is sent twice; the later value counts.
const SENT: [period: string, value: string][] = [
  ["2025-01-01", "0.1"], ["2025-02-01", "0.2"], ["2025-03-01", "7"], ["2025-03-01", "0.3"],
  ["2025-04-01", "1.005"], ["2025-05-01", "2.675"], ["2025-06-01", "0.015"],
  ["2025-07-01", "1000000.01"], ["2025-08-01", "0.01"], ["2025-09-01", "-0.02"],
  ["2025-10-01", "33.333333"], ["2025-11-01", "33.333333"], ["2025-12-01", "33.333334"],
];
const LATEST = new Map(SENT);
const TODAY = "2026-11-18";

let w: Awaited<ReturnType<typeof workspace>>;
let sara: string;
let metric: Metric;
let dashboardId: number;
let quarters: ReferenceSpan[];

beforeAll(async () => {
  w = await workspace();
  sara = await w.person("owner");
  const m = await w.metric(sara, { name: "Revenue", unit: "€", unit_position: "after", decimals: 2, aggregation: "sum", submission_rule: "overwrite" });
  const actor = w.actor(sara);
  // Sent as a program sends them, through the Submission Rule: the second March value overwrites the first.
  await w.token(m.id, sara);
  const { secret } = await createAccessKey(actor, { name: "Shop", scopes: ["values:submit"], expiresOn: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10) });
  const key = (await actorForKey(secret)) as KeyActor;
  const quiet = { notifyCorrection: async () => {}, afterValue: async () => [] };
  for (const [period, value] of SENT) expect((await submitObservation(key, m.slug, { value: Number(value), period }, quiet)).ok).toBe(true);
  dashboardId = await createDashboard(actor, "Numbers");
  await placeWidget(actor, dashboardId, { type: "spec", template: "line", metricIds: [m.id], settings: { display: "quarter", compare: ["qoq"], fullPeriods: true } });
  const data = await getCanvasData(w.id, sara);
  metric = data.metrics.find((x) => x.id === m.id)!;
  const ref = referenceSeries([...LATEST].map(([period, value]) => ({ period, value: Number(value) })), "month", "quarter", "sum", { yearStart: 1, today: TODAY });
  if (!ref.ok) throw new Error("The reference refuses the series");
  quarters = ref.spans;
});
afterAll(async () => { await w?.cleanup(); });

/** The quarters a canvas's data shows for the Metric equal the reference's, value by value, as numbers and as text. */
function sameQuarters(data: CanvasData, where: string) {
  const m = data.metrics.find((x) => x.id === metric.id)!;
  const shown = shownSeries(m, data, "quarter", { today: TODAY });
  expect(shown.by, where).toBe("quarter");
  expect(shown.points.map((p) => p.period), where).toEqual(quarters.map((q) => q.period));
  shown.points.forEach((p, i) => {
    expect(valueMismatch(p.value, quarters[i].value, m.decimals), `${where}, ${p.period}`).toBeNull();
    expect(formatValue(m, p.value, data.numberStyle), `${where}, ${p.period}`).toBe(referenceValue(m, roundedText(quarters[i].value, 12), data.numberStyle));
  });
  return shown;
}

describe("the same number everywhere", () => {
  it("in a widget's data", async () => {
    sameQuarters(await getCanvasData(w.id, sara), "widget");
    // The worked examples: Q2 is 3.695, shown 3.70 €; Q3 exactly a million and Q4 exactly 100.
    expect(quarters.map((q) => roundedText(q.value, 6))).toEqual(["0.600000", "3.695000", "1000000.000000", "100.000000"]);
  });

  it("in a Snapshot", async () => {
    const id = await takeSnapshot(w.actor(sara), dashboardId, { kind: "year", start: "2025-01-01" }, { today: TODAY });
    sameQuarters((await openSnapshot(w.actor(sara), id)).data, "Snapshot");
  });

  it("in a live and a frozen View Link", async () => {
    for (const frozen of [false, true]) {
      const token = await createViewLink(w.actor(sara), "dashboard", dashboardId, { label: "Board", expires: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), frozen });
      const payload = (await openViewLink(token))!;
      sameQuarters(payload.data, frozen ? "frozen View Link" : "live View Link");
    }
  });

  it("in a Comparison and the deck export's values", async () => {
    const data = await getCanvasData(w.id, sara);
    const m = data.metrics.find((x) => x.id === metric.id)!;
    const [qoq] = compare(m, resolverFrom(data.metrics, data.series), { keys: ["qoq"], full: true, yearStart: data.yearStart });
    const [q3, q4] = quarters.slice(-2);
    const change = referenceChangeOf(q4.value, q3.value, m.polarity);
    expect(valueMismatch(qoq.current!, q4.value, 6)).toBeNull();
    expect(valueMismatch(qoq.previous!, q3.value, 6)).toBeNull();
    expect(valueMismatch(qoq.abs!, change.abs, 6)).toBeNull();
    // The slide: the widget's first comparison, written the one way changes are, and the chart's values.
    expect(exportedChange(m, data, { compare: ["qoq"], fullPeriods: true })).toBe(`QoQ ${referenceChange(change.pct!, data.numberStyle)}`);
    const shown = shownSeries(m, data, "quarter", { today: TODAY });
    expect(shown.points.map((p) => chartValue(m, p.value))).toEqual(quarters.map((q) => Number(roundedText(q.value, m.decimals))));
  });

  it("in a View Design's Analysis Recipe, in a widget, a Snapshot and a View Link (spec 0024)", async () => {
    // A moving average of the quarters, as a design with a recipe draws it: the reference's quarters, averaged exactly.
    const design = designWithRecipe(BUILT_IN_RECIPES["moving-average"]);
    const expected = refMovingAverage(quarters.map((q) => ({ period: q.period, value: q.value })), 3);
    const id = await takeSnapshot(w.actor(sara), dashboardId, { kind: "half", start: "2025-07-01" }, { today: TODAY });
    const token = await createViewLink(w.actor(sara), "dashboard", dashboardId, { label: "Recipe", expires: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), frozen: true });
    for (const [where, data] of [["widget", await getCanvasData(w.id, sara)], ["Snapshot", (await openSnapshot(w.actor(sara), id)).data], ["View Link", (await openViewLink(token))!.data]] as const) {
      const m = data.metrics.find((x) => x.id === metric.id)!;
      const res = designRecipe(design, [m], { ...data, today: TODAY }, { display: "quarter" })!.avg;
      const got = res.kind === "series" ? res.points : [];
      expect(got.map((p) => p.period), where).toEqual(expected.map((p) => p.period));
      got.forEach((p, i) => {
        expect(isNearestDouble(p.value, expected[i].value), `${where}, ${p.period}`).toBe(true);
        expect(formatOutput("metric", m, p.value, data.numberStyle), `${where}, ${p.period}`).toBe(referenceValue(m, roundedText(expected[i].value, 12), data.numberStyle));
      });
    }
  });

  it("in the API's values", async () => {
    // What GET /api/v1/metrics/{slug}/observations lists: each period once, exactly the value that counts.
    const page = await listObservations(w.actor(sara), metric.slug, { limit: 100 });
    expect(page.items.map((o) => [o.period, String(o.value)])).toEqual([...LATEST]);
  });

  it("in the trial's CSV download", async () => {
    // Last, as a trial takes no View Links or Snapshots.
    await w.trial("2099-01-01");
    const csv = await trialValuesCsv(w.actor(sara));
    const rows = csv.trim().split("\r\n").slice(1).map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "")));
    const mine = rows.filter((r) => r[0] === metric.slug).map((r) => [r[3], r[4]]);
    expect(Object.fromEntries(mine)).toEqual(Object.fromEntries([...LATEST].map(([p, v]) => [p, roundedText(exactOf(v), Math.min(6, (v.split(".")[1] ?? "").length))])));
  });
});
