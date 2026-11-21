// Making a Derived Metric against the real database (GLOSSARY: Derived Metric; ticket #619): only from Metrics the
// person sees, read whole, one period, no Derived Metric among its inputs, no values of its own, and nothing left
// behind when it is refused.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, Refused } from "./actor";
import { createDerivedMetric, formulaChoices } from "./derived-metrics";
import { db } from "./db";
import { buildSeries } from "./series";
import { opened, workspace } from "./test/db-fixtures";
import { getMetrics, getObservations } from "./workspace-data";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("member");
  return { w, sara, as: w.actor(sara, "member") };
}
const count = async (ws: string) => (await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0;
const row = async (ws: string, id: number) => (await opened("metrics", ws, (await db().from("metrics").select("*").eq("id", id)).data))[0];

describe("createDerivedMetric", () => {
  it("makes a Metric owned by the person, computed from the Metrics they see, with the defaults it names", async () => {
    const { w, sara, as } = await setup();
    const revenue = await w.metric(sara, { name: "Revenue", slug: "revenue", unit: "EUR", unit_position: "after", decimals: 2 });
    const cost = await w.metric(sara, { name: "Cost", slug: "cost", unit: "EUR", unit_position: "after", decimals: 2 });
    const made = await createDerivedMetric(as, { name: "Profit", formula: " {revenue} - {cost} " });
    expect(made).toMatchObject({ slug: "profit", name: "Profit", period: "month" });
    expect(made.defaults).toEqual(["Counted by month, like the Metrics it is calculated from.", "Shown with 2 decimals.", "The unit is EUR, as its inputs have.", "Higher is better."]);
    const m = await row(w.id, made.id);
    // Written as people wrote it (trimmed), no Source, no Submitter, no Workflow, owned by the person.
    expect(m).toMatchObject({ formula: "{revenue} - {cost}", sources: [], owner_id: sara, unit: "EUR", decimals: 2, polarity: "higher", workflow_id: null });
    expect((await db().from("tokens").select("id").eq("metric_id", made.id)).data).toEqual([]);
    // Audited as any new Metric, and its history says what it is.
    expect((await db().from("audit_events").select("kind").eq("workspace_id", w.id)).data!.filter((e) => e.kind === "metric.created")).toHaveLength(1);
    const { data: versions } = await db().from("versions").select("message").eq("object_type", "metric").eq("object_id", made.id);
    expect(versions!.map((v) => v.message)).toContain("Calculated from other Metrics");
    // Its values are computed.
    await w.value(revenue.id, "2026-01-01", 100); await w.value(cost.id, "2026-01-01", 60);
    const series = buildSeries(await getMetrics(w.id), await getObservations(w.id));
    expect(series.profit).toEqual([{ period: "2026-01-01", value: 40 }]);
  });

  it("makes kilometres per day from an odometer with change(), counted by the odometer's own period", async () => {
    const { w, sara, as } = await setup();
    const odo = await w.metric(sara, { name: "Odometer", slug: "odometer", unit: "km", period: "week", aggregation: "last" });
    const made = await createDerivedMetric(as, { name: "Kilometres per day", formula: "change({odometer}) / 7", period: undefined, decimals: 1 });
    expect(made.period).toBe("week");
    const m = await row(w.id, made.id);
    // A ratio has no unit of its inputs: it is "per day", which the person names if they want one.
    expect(m).toMatchObject({ formula: "change({odometer}) / 7", period: "week", unit: "", decimals: 1 });
    await w.value(odo.id, "2026-11-02", 13573); await w.value(odo.id, "2026-11-09", 13650);
    const series = buildSeries(await getMetrics(w.id), await getObservations(w.id));
    expect(series["kilometres-per-day"]).toEqual([{ period: "2026-11-09", value: 11 }]);
  });

  it("takes what the person gives for unit, format, decimals, period, polarity and target", async () => {
    const { w, sara, as } = await setup();
    await w.metric(sara, { name: "Visits", slug: "visits", period: "week" });
    const made = await createDerivedMetric(as, { name: "Half", formula: "{visits} / 2", description: "Half the visits", unit: "per site", unitPosition: "before", decimals: 3, period: "week", polarity: "lower", targetMax: 10, format: "number" });
    expect(made.defaults).toEqual([]);
    expect(await row(w.id, made.id)).toMatchObject({ description: "Half the visits", unit: "per site", unit_position: "before", decimals: 3, polarity: "lower", target_max: 10 });
  });

  it("refuses a Metric the person does not see exactly as one that does not exist, and allows it once shared", async () => {
    const { w, sara, as } = await setup();
    const lena = await w.person("member");
    const secret = await w.metric(lena, { name: "Salaries", slug: "salaries" });
    await w.metric(sara, { name: "Visits", slug: "visits" });
    const before = await count(w.id);
    const hidden = await createDerivedMetric(as, { name: "Pay per visit", formula: "{salaries} / {visits}" }).catch((e) => e);
    const absent = await createDerivedMetric(as, { name: "Pay per visit", formula: "{nonesuch} / {visits}" }).catch((e) => e);
    expect(hidden).toBeInstanceOf(Refused);
    expect(hidden.message).toBe("{salaries} is not a Metric of this Workspace.");
    expect(absent.message).toBe("{nonesuch} is not a Metric of this Workspace.");
    // Nothing was made, not even half of it.
    expect(await count(w.id)).toBe(before);
    await w.share(secret.id, sara);
    expect(await createDerivedMetric(as, { name: "Pay per visit", formula: "{salaries} / {visits}" })).toMatchObject({ slug: "pay-per-visit" });
  });

  it("refuses a formula that cannot be read, names no Metric, reads a Derived Metric, or mixes periods, and makes nothing", async () => {
    const { w, sara, as } = await setup();
    await w.metric(sara, { name: "A", slug: "a" });
    await w.metric(sara, { name: "W", slug: "w", period: "week" });
    await createDerivedMetric(as, { name: "Twice", formula: "{a} * 2" });
    const before = await count(w.id);
    const refused = async (input: Parameters<typeof createDerivedMetric>[1]) => {
      const e = await createDerivedMetric(as, input).catch((x) => x);
      expect(e, JSON.stringify(input)).toBeInstanceOf(Refused);
      return (e as Error).message;
    };
    expect(await refused({ name: "X", formula: "" })).toMatch(/Write the formula/);
    expect(await refused({ name: "X", formula: "{a} ^ 2" })).toMatch(/cannot be read/);
    expect(await refused({ name: "X", formula: "2 * 3" })).toMatch(/names no Metric/);
    expect(await refused({ name: "X", formula: "{twice} + 1" })).toMatch(/Twice is a Derived Metric itself/);
    expect(await refused({ name: "X", formula: "{a} + {w}" })).toMatch(/counted by different periods/);
    expect(await refused({ name: "X", formula: "{a} + 1", period: "week" })).toMatch(/counted by month, it by week/);
    expect(await refused({ name: "X", formula: "{a} + 1", period: "fortnight" })).toMatch(/period must be one of/);
    expect(await refused({ name: "X", formula: `{a}${" + 1".repeat(200)}` })).toMatch(/longer than 500/);
    expect(await refused({ name: "X", formula: "change(1)" })).toMatch(/change takes one Metric/);
    expect(await count(w.id)).toBe(before);
  });

  it("refuses an input set to Aggregation none unless the formula only looks back, and needs a name", async () => {
    const { w, sara, as } = await setup();
    await w.metric(sara, { name: "Level", slug: "level", aggregation: "none" });
    await expect(createDerivedMetric(as, { name: "Twice", formula: "{level} * 2" })).rejects.toThrow(/Aggregation none/);
    await expect(createDerivedMetric(as, { name: "   ", formula: "change({level})" })).rejects.toThrow(/Give the Metric a name/);
    expect(await createDerivedMetric(as, { name: "Step", formula: "change({level})" })).toMatchObject({ slug: "step" });
  });

  it("is for people who may create: a Guest makes nothing, and a Metric in another Workspace is not found", async () => {
    const { w, sara } = await setup();
    const guest = await w.person("guest");
    await w.metric(sara, { name: "A", slug: "a" });
    await expect(createDerivedMetric(w.actor(guest, "guest"), { name: "X", formula: "{a} * 2" })).rejects.toBeInstanceOf(Forbidden);
    const other = await workspace("Other"); cleanups.push(other.cleanup);
    const owner = await other.person("member");
    await other.metric(owner, { name: "Theirs", slug: "theirs" });
    await expect(createDerivedMetric(w.actor(sara, "member"), { name: "X", formula: "{theirs} * 2" })).rejects.toThrow(/not a Metric of this Workspace/);
  });

  it("lists as choices only Metrics the person sees that can be an input, with nothing but how to pick them", async () => {
    const { w, sara, as } = await setup();
    const lena = await w.person("member");
    await w.metric(sara, { name: "Visits", slug: "visits", unit: "visits", period: "week" });
    await w.metric(sara, { name: "Old", slug: "old", archived_at: new Date().toISOString() });
    await w.metric(lena, { name: "Salaries", slug: "salaries" });
    await createDerivedMetric(as, { name: "Twice", formula: "{visits} * 2" });
    expect(await formulaChoices(as)).toEqual([{ slug: "visits", name: "Visits", period: "week", unit: "visits" }]);
    await expect(formulaChoices(w.actor(await w.person("guest"), "guest"))).rejects.toBeInstanceOf(Forbidden);
  });
});
