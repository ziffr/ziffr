// Making a Derived Metric against the real database (GLOSSARY: Derived Metric; ticket #619): only from Metrics the
// person sees, read whole, one period, no Derived Metric among its inputs, no values of its own, and nothing left
// behind when it is refused.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, Refused } from "./actor";
import { createDerivedMetric, formulaChoices, setMetricFormula } from "./derived-metrics";
import { db } from "./db";
import { inputsProblem } from "./formula";
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
const editShare = async (w: Awaited<ReturnType<typeof workspace>>, metricId: number, userId: string) => { await db().from("shares").delete().eq("workspace_id", w.id).eq("object_id", metricId).eq("user_id", userId); await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: metricId, user_id: userId, role: "editor" }); };
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

  it("refuses a Metric the person does not see exactly as one that does not exist", async () => {
    const { w, sara, as } = await setup();
    const lena = await w.person("member");
    await w.metric(lena, { name: "Salaries", slug: "salaries" });
    await w.metric(sara, { name: "Visits", slug: "visits" });
    const before = await count(w.id);
    const hidden = await createDerivedMetric(as, { name: "Pay per visit", formula: "{salaries} / {visits}" }).catch((e) => e);
    const absent = await createDerivedMetric(as, { name: "Pay per visit", formula: "{nonesuch} / {visits}" }).catch((e) => e);
    expect(hidden).toBeInstanceOf(Refused);
    expect(hidden.message).toBe("{salaries} is not a Metric of this Workspace.");
    expect(absent.message).toBe("{nonesuch} is not a Metric of this Workspace.");
    // Nothing was made, not even half of it.
    expect(await count(w.id)).toBe(before);
  });

  it("takes only Metrics the person may share, their own and those they edit: never one they only see", async () => {
    const { w, sara, as } = await setup();
    const lena = await w.person("member");
    const shown = await w.metric(lena, { name: "Salaries", slug: "salaries" });
    const edited = await w.metric(lena, { name: "Bonuses", slug: "bonuses" });
    const viaToken = await w.metric(lena, { name: "Hours", slug: "hours" });
    await w.metric(sara, { name: "Visits", slug: "visits" });
    const before = await count(w.id);
    // A view Share, a Token (the way a Stand-in sees a Metric) and a Metric on a shared dashboard are all sight only.
    await w.share(shown.id, sara);
    await w.token(viaToken.id, sara);
    for (const slug of ["salaries", "hours"]) {
      const e = await createDerivedMetric(as, { name: "Copy", formula: `{${slug}}` }).catch((x) => x);
      expect(e, slug).toBeInstanceOf(Refused);
      expect(e.message).toMatch(new RegExp(`^\\{${slug}\\} is not yours to share`));
    }
    expect((await createDerivedMetric(as, { name: "Copy", formula: "prev({salaries}) * 1" }).catch((x) => x)).message).toMatch(/not yours to share/);
    expect(await count(w.id)).toBe(before);
    // An Editor Share makes it theirs to share.
    await editShare(w, edited.id, sara);
    expect(await createDerivedMetric(as, { name: "Pay per visit", formula: "{bonuses} / {visits}" })).toMatchObject({ slug: "pay-per-visit" });
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

  it("lists as choices only Metrics the person may share that can be an input, with nothing but how to pick them", async () => {
    const { w, sara, as } = await setup();
    const lena = await w.person("member");
    await w.metric(sara, { name: "Visits", slug: "visits", unit: "visits", period: "week" });
    await w.metric(sara, { name: "Old", slug: "old", archived_at: new Date().toISOString() });
    const theirs = await w.metric(lena, { name: "Salaries", slug: "salaries" });
    const edited = await w.metric(lena, { name: "Bonuses", slug: "bonuses", unit: "EUR" });
    await w.share(theirs.id, sara);
    await editShare(w, edited.id, sara);
    await createDerivedMetric(as, { name: "Twice", formula: "{visits} * 2" });
    expect(await formulaChoices(as)).toEqual([{ slug: "visits", name: "Visits", period: "week", unit: "visits" }, { slug: "bonuses", name: "Bonuses", period: "month", unit: "EUR" }]);
    await expect(formulaChoices(w.actor(await w.person("guest"), "guest"))).rejects.toBeInstanceOf(Forbidden);
  });

  it("changes a Derived Metric's formula with the checks of making one, for its owner and Editors only", async () => {
    const { w, sara, as } = await setup();
    const lena = await w.person("member");
    await w.metric(sara, { name: "A", slug: "a" });
    await w.metric(sara, { name: "W", slug: "w", period: "week" });
    const secret = await w.metric(lena, { name: "Salaries", slug: "salaries" });
    const plain = await w.metric(sara, { name: "Plain", slug: "plain" });
    const d = await createDerivedMetric(as, { name: "Twice", formula: "{a} * 2" });
    await setMetricFormula(as, d.id, "change({a}) + 1");
    expect((await row(w.id, d.id)).formula).toBe("change({a}) + 1");
    const refused = async (id: number, f: string) => (await setMetricFormula(as, id, f).catch((e) => e)) as Error;
    expect((await refused(d.id, "{salaries} * 2")).message).toBe("{salaries} is not a Metric of this Workspace.");
    expect((await refused(d.id, "{w} * 2")).message).toMatch(/counted by week, it by month/);
    expect((await refused(d.id, "{twice} * 2")).message).toMatch(/itself/);
    expect((await refused(d.id, "  ")).message).toMatch(/Write the formula/);
    expect((await refused(plain.id, "{a} * 2")).message).toBe("Only a Derived Metric has a formula.");
    expect((await row(w.id, d.id)).formula).toBe("change({a}) + 1");
    // Not its owner or an Editor: refused. Once the owner may edit a Metric, it can be an input.
    await expect(setMetricFormula(w.actor(lena, "member"), d.id, "{a} * 3")).rejects.toBeInstanceOf(Forbidden);
    await w.share(secret.id, sara);
    expect((await refused(d.id, "{salaries} * 3")).message).toMatch(/not yours to share/);
    await editShare(w, secret.id, sara);
    await setMetricFormula(as, d.id, "{salaries} * 3");
    expect((await row(w.id, d.id)).formula).toBe("{salaries} * 3");
    const { data: versions } = await db().from("versions").select("message").eq("object_type", "metric").eq("object_id", d.id);
    expect(versions!.map((v) => v.message)).toContain("Changed its formula");
  });

  it("an Editor changing the formula may use only inputs the owner may share too, and no Derived Metric", async () => {
    const { w, sara, as } = await setup();
    const eve = await w.person("member");
    const own = await w.metric(sara, { name: "Mine", slug: "mine" });
    await w.metric(eve, { name: "Evas", slug: "evas" });
    const both = await w.metric(sara, { name: "Both", slug: "both" });
    const d = await createDerivedMetric(as, { name: "Twice", formula: "{mine} * 2" });
    await editShare(w, (await db().from("metrics").select("id").eq("workspace_id", w.id).eq("slug", d.slug).single()).data!.id, eve);
    await editShare(w, both.id, eve);
    const asEve = w.actor(eve, "member");
    // Eve's own Metric is hers to share, not Sara's: refused as if it were not there. One Sara owns and Eve only sees is not Eve's to share.
    expect((await setMetricFormula(asEve, d.id, "{evas}").catch((e) => e)).message).toBe("{evas} is not a Metric of this Workspace.");
    await w.share(own.id, eve);
    expect((await setMetricFormula(asEve, d.id, "{mine} * 3").catch((e) => e)).message).toMatch(/not yours to share/);
    await setMetricFormula(asEve, d.id, "{both} * 3");
    expect((await row(w.id, d.id)).formula).toBe("{both} * 3");
    // No Derived Metric as an input, so no formula can come round to itself.
    expect((await setMetricFormula(as, d.id, "{twice}").catch((e) => e)).message).toMatch(/itself/);
    const other = await createDerivedMetric(as, { name: "Other", formula: "{mine}" });
    expect((await setMetricFormula(as, d.id, "{other} + 1").catch((e) => e)).message).toMatch(/Derived Metric itself/);
    expect(other.slug).toBe("other");
  });

  it("shows no values while its owner may no longer share an input, and again when they may", async () => {
    const { w, sara, as } = await setup();
    const lena = await w.person("member");
    const x = await w.metric(lena, { name: "Hours", slug: "hours" });
    await editShare(w, x.id, sara);
    await w.value(x.id, "2026-01-01", 40);
    const d = await createDerivedMetric(as, { name: "Half", formula: "{hours} / 2" });
    const values = async () => {
      const metrics = await getMetrics(w.id);
      return { withheld: metrics.find((m) => m.slug === "half")!.inputs_withheld ?? false, series: buildSeries(metrics, await getObservations(w.id)).half };
    };
    expect(await values()).toEqual({ withheld: false, series: [{ period: "2026-01-01", value: 20 }] });
    // Sara's edit right goes (she may still see it): no values, and the reason says so.
    await db().from("shares").update({ role: "viewer" }).eq("workspace_id", w.id).eq("object_id", x.id).eq("user_id", sara);
    expect(await values()).toEqual({ withheld: true, series: [] });
    const metrics = await getMetrics(w.id);
    expect(inputsProblem(metrics.find((m) => m.slug === "half")!, metrics)).toMatch(/no longer share one of the Metrics/);
    // Not at all, too.
    await db().from("shares").delete().eq("workspace_id", w.id).eq("object_id", x.id).eq("user_id", sara);
    expect((await values()).series).toEqual([]);
    await editShare(w, x.id, sara);
    expect((await values()).series).toEqual([{ period: "2026-01-01", value: 20 }]);
    // A Derived Metric of Sara's own Metrics is never withheld, and one shared on: the ratio is shown without its inputs.
    expect(d.slug).toBe("half");
  });

  it("leaves Derived Metrics made before this rule (a Pack's, the demo's) as they were", async () => {
    const { w, sara } = await setup();
    const lena = await w.person("member");
    const x = await w.metric(lena, { name: "Hours", slug: "hours" });
    await w.metric(sara, { name: "Old", slug: "old", formula: "{hours} * 2", sources: [] });
    await w.value(x.id, "2026-01-01", 5);
    const metrics = await getMetrics(w.id);
    expect(metrics.find((m) => m.slug === "old")!.inputs_withheld).toBeUndefined();
    expect(buildSeries(metrics, await getObservations(w.id)).old).toEqual([{ period: "2026-01-01", value: 10 }]);
  });
});
