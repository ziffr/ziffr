// Making, changing and opening a Total against the real database (spec 0058, ticket #1225; GLOSSARY: Total): who may do
// what, what a person who sees only some parts is told, the owner-only rule of an open Total, handing one over, and what
// the database refuses however a row is written.
import { afterEach, describe, expect, it } from "vitest";
import { actorForKey, createAccessKey } from "./access-keys";
import { allSeriesFor } from "./access";
import { Forbidden, Refused, type Actor } from "./actor";
import { db } from "./db";
import { createDerivedMetric, setMetricFormula } from "./derived-metrics";
import { handOverMetric } from "./metric-owner";
import { addSubmitters, saveSeriesRows, setMetricSources, updateMetricDetails } from "./metrics";
import { metricQuickLook } from "./quick-look";
import { share } from "./sharing";
import { opened, workspace } from "./test/db-fixtures";
import { addTotalPart, createTotal, OPEN_CONFIRM, OPEN_OWNER_ONLY, removeTotalPart, setTotalPartPeriods, setTotalTargets } from "./total-changes";
import { closeTotal, openTotal, totalOpening } from "./total-opening";
import { totalChoices, totalPage, totalsCounting } from "./total-page";
import { NOT_SHOWN, OWNER_CANNOT_SHARE } from "./total-rules";
import { getMetrics } from "./workspace-data";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const noEffects = { recordCreated: async () => undefined, promptSubmitter: async () => false as const };

/** Sara owns two Commit Metrics and, once made, their Total. Ben sees the Total and Ana's Commit; Ed edits all three. */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ben = await w.person("member"); const ed = await w.person("member");
  const ana = await w.metric(sara, { name: "Commit Ana", aggregation: "last", unit: "EUR", target_min: 100 });
  const eva = await w.metric(sara, { name: "Commit Eva", aggregation: "last", unit: "EUR", target_min: 50 });
  for (const [m, v] of [[ana, 10], [eva, 7]] as const) await w.value(m.id, "2026-01-01", v);
  const make = (over: Partial<Parameters<typeof createTotal>[1]> = {}) => createTotal(w.actor(sara), { name: "Commit", parts: [ana.id, eva.id], ...over }, noEffects);
  const shareWith = async (total: { id: number }) => {
    for (const m of [total, ana]) await share(w.actor(sara), "metric", m.id, ben, "viewer");
    for (const m of [total, ana, eva]) await share(w.actor(sara), "metric", m.id, ed, "editor");
  };
  const stored = async (id: number) => (await db().from("metrics").select("formula, total_targets, total_opened_at, aggregation, sources, target_min").eq("id", id).single()).data!;
  const parts = async (id: number) => (await db().from("total_parts").select("part_id, first_period, last_period").eq("total_id", id).order("part_id")).data!;
  const kinds = async () => (await opened("audit_events", w.id, (await db().from("audit_events").select("*").eq("workspace_id", w.id).like("kind", "metric.total%").order("id")).data ?? []))!.map((e) => [e.kind, e.details]);
  return { w, sara, ben, ed, ana, eva, make, shareWith, stored, parts, kinds };
}

describe("making a Total", () => {
  it("adds up the picked Metrics from the first period one has a value, closed, as the person who made it", async () => {
    const { w, sara, ana, eva, make, stored, parts, kinds } = await setup();
    const total = await make({ targets: "parts" });
    expect(await stored(total.id)).toEqual({ formula: "{-}", total_targets: "parts", total_opened_at: null, aggregation: "last", sources: [], target_min: null });
    expect(await parts(total.id)).toEqual([ana, eva].map((m) => ({ part_id: m.id, first_period: "2026-01-01", last_period: null })));
    const read = await allSeriesFor(w.actor(sara));
    expect(read.series[total.slug]).toEqual([{ period: "2026-01-01", value: 17 }]);
    expect(read.targets[total.id]).toContainEqual({ period: "2026-01-01", value: 150 });
    expect((await metricQuickLook(w.actor(sara), total.slug)).metric).toMatchObject({ total: { targets: "parts" }, derived: false, formula: null });
    expect(await kinds()).toEqual([["metric.total_changed", { change: "made" }]]);
  });

  it("refuses what cannot be added up, and leaves nothing behind", async () => {
    const { w, sara, ben, ana, eva, make } = await setup();
    const km = await w.metric(sara, { name: "Distance", aggregation: "last", unit: "km" });
    await expect(make({ parts: [ana.id, km.id] })).rejects.toThrow(/differ in unit/);
    await expect(make({ parts: [] })).rejects.toThrow(/at least one/);
    // Ben only views Ana's: not his to share. Eva's he does not see: as if it were not there.
    await share(w.actor(sara), "metric", ana.id, ben, "viewer");
    await expect(createTotal(w.actor(ben), { name: "Mine", parts: [ana.id] }, noEffects)).rejects.toThrow(/not yours to share/);
    await expect(createTotal(w.actor(ben), { name: "Mine", parts: [eva.id] }, noEffects)).rejects.toThrow(/not a Metric of this Workspace/);
    expect(await totalChoices(w.actor(ben))).toEqual([]);
    expect((await getMetrics(w.id)).filter((m) => m.total)).toEqual([]);
    const key = (await actorForKey((await createAccessKey(w.actor(sara), { name: "Script", scopes: ["metrics:read"], expiresOn: new Date(Date.now() + 86400000 * 9).toISOString().slice(0, 10) })).secret))!;
    await expect(createTotal(key as unknown as Actor, { name: "By program", parts: [ana.id] }, noEffects)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("a Total's list", () => {
  it("names only the Metrics a person sees, and says nothing of how many there are", async () => {
    const { w, ben, eva, make, shareWith } = await setup();
    const total = await make();
    await shareWith(total);
    const page = (await totalPage(w.actor(ben), total.id))!;
    expect(page).toMatchObject({ mayChange: false, mayOpen: false, choices: [], unapproved: [] });
    expect(page.parts.map((p) => p.name)).toEqual(["Commit Ana"]);
    expect(page.periods.every((p) => p.state === "withheld" && p.of === undefined)).toBe(true);
    expect(JSON.stringify(page)).not.toContain(eva.slug);
    const read = await allSeriesFor(w.actor(ben));
    expect(read.series[total.slug]).toEqual([]);
    expect(read.metrics.find((m) => m.id === total.id)!.total!.note).toBe(NOT_SHOWN);
  });

  it("is changed by its owner and Editors: ending, counting again, removing and adding", async () => {
    const { w, ben, ed, ana, eva, make, shareWith, parts } = await setup();
    const total = await make();
    await shareWith(total);
    const editor = w.actor(ed);
    expect((await totalsCounting(editor, ana.id)).map((t) => [t.id, t.last])).toEqual([[total.id, "2026-01-01"]]);
    await setTotalPartPeriods(editor, total.id, ana.id, { last: "2026-02-14" });
    expect((await parts(total.id))[0]).toMatchObject({ last_period: "2026-02-01" });
    expect(await totalsCounting(editor, ana.id)).toEqual([]);
    await setTotalPartPeriods(editor, total.id, ana.id, { last: null });
    await expect(setTotalPartPeriods(editor, total.id, ana.id, { last: "2025-01-01" })).rejects.toThrow(/before the first/);
    await removeTotalPart(editor, total.id, eva.id);
    expect((await parts(total.id)).map((p) => p.part_id)).toEqual([ana.id]);
    await addTotalPart(editor, total.id, eva.id, "2026-03-01");
    await expect(addTotalPart(editor, total.id, eva.id, "2026-03-01")).rejects.toThrow(/already/);
    // A Viewer changes nothing.
    await expect(removeTotalPart(w.actor(ben), total.id, ana.id)).rejects.toBeInstanceOf(Forbidden);
    expect(await totalsCounting(w.actor(ben), ana.id)).toEqual([]);
  });

  it("shows nobody a number once its owner may no longer share a part", async () => {
    const { w, sara, ed, make, shareWith } = await setup();
    const total = await make();
    await shareWith(total);
    // Ed's own Metric, which Sara only views, is not added: she could not share it.
    const his = await w.metric(ed, { name: "Commit Ed", aggregation: "last", unit: "EUR" });
    await share(w.actor(ed), "metric", his.id, sara, "viewer");
    await expect(addTotalPart(w.actor(ed), total.id, his.id, "2026-01-01")).rejects.toThrow(/owner does not own or edit/);
    await share(w.actor(ed), "metric", his.id, sara, "editor");
    await addTotalPart(w.actor(ed), total.id, his.id, "2026-01-01");
    await share(w.actor(ed), "metric", his.id, sara, null);
    const read = await allSeriesFor(w.actor(ed));
    expect(read.series[total.slug]).toEqual([]);
    expect(read.metrics.find((m) => m.id === total.id)!.total!.note).toBe(OWNER_CANNOT_SHARE);
  });
});

describe("opening a Total", () => {
  it("is its owner's, after the lists as they stand, and shows others its sums until closed", async () => {
    const { w, sara, ben, ed, ana, eva, make, shareWith, stored, kinds } = await setup();
    const total = await make();
    await shareWith(total);
    await expect(totalOpening(w.actor(ed), total.id)).rejects.toBeInstanceOf(Forbidden);
    const owner = w.actor(sara);
    const seen = await totalOpening(owner, total.id);
    // Ben sees every Metric but one: the list says what he can work out.
    expect(seen.people).toEqual([{ name: expect.any(String), learns: "Commit Eva" }]);
    expect(seen.parts.map((p) => p.name)).toEqual(["Commit Ana", "Commit Eva"]);
    const formula = await createDerivedMetric(owner, { name: "Without Ana", formula: `{${total.slug}} - {${ana.slug}}` }, noEffects);
    await expect(openTotal(owner, total.id, seen.fingerprint)).rejects.toThrow(/has changed since you looked/);
    const again = await totalOpening(owner, total.id);
    expect(again.formulas).toEqual({ count: 1, names: ["Without Ana"] });
    await openTotal(owner, total.id, again.fingerprint);
    expect((await stored(total.id)).total_opened_at).not.toBeNull();
    const read = await allSeriesFor(w.actor(ben));
    expect(read.series[total.slug]).toEqual([{ period: "2026-01-01", value: 17 }]);
    expect(JSON.stringify(read.metrics.filter((m) => m.id === total.id))).not.toContain(eva.slug);
    expect(formula.slug).toBeTruthy();

    // Only the owner changes it now, and says so.
    await expect(removeTotalPart(w.actor(ed), total.id, eva.id)).rejects.toThrow(OPEN_OWNER_ONLY);
    await expect(setTotalTargets(w.actor(ed), total.id, "parts")).rejects.toThrow(OPEN_OWNER_ONLY);
    await expect(removeTotalPart(owner, total.id, eva.id)).rejects.toThrow(OPEN_CONFIRM);
    expect((await totalPage(w.actor(ed), total.id))!.mayChange).toBe(false);
    // Also past the core's check.
    expect((await db().rpc("change_total_part", { ws: w.id, total: total.id, part: eva.id, change: "remove", from_period: null, to_period: null, actor: ed, confirmed_open: true })).error?.code).toBe("ZF461");
    await removeTotalPart(owner, total.id, eva.id, true);

    await closeTotal(owner, total.id);
    await closeTotal(owner, total.id);
    expect((await stored(total.id)).total_opened_at).toBeNull();
    expect((await kinds()).map(([k]) => k)).toEqual(["metric.total_changed", "metric.total_opened", "metric.total_changed", "metric.total_closed"]);
    expect(JSON.stringify(await kinds())).not.toContain("Commit Eva");
  });

  it("ends with a hand-over, whoever writes the new owner", async () => {
    const { w, sara, ed, make, shareWith, stored, kinds } = await setup();
    const total = await make();
    await shareWith(total);
    await openTotal(w.actor(sara), total.id, (await totalOpening(w.actor(sara), total.id)).fingerprint);
    await handOverMetric(w.actor(sara), total.id, ed);
    expect((await stored(total.id)).total_opened_at).toBeNull();
    expect((await kinds()).at(-1)).toEqual(["metric.total_closed", { reason: "handed over" }]);
    await db().from("metrics").update({ total_opened_at: new Date().toISOString() }).eq("id", total.id);
    await db().from("metrics").update({ owner_id: sara }).eq("id", total.id);
    expect((await stored(total.id)).total_opened_at).toBeNull();
  });
});

describe("what a Total keeps", () => {
  it("takes no values, no Sources, no Submitters and no formula", async () => {
    const { w, sara, make } = await setup();
    const total = await make({ targets: "parts" });
    const owner = w.actor(sara);
    await expect(setMetricSources(owner, total.id, ["web_form"])).rejects.toThrow();
    await expect(addSubmitters(owner, total.id, [sara], noEffects)).rejects.toThrow();
    await expect(setMetricFormula(owner, total.id, "1")).rejects.toBeInstanceOf(Refused);
    await expect(saveSeriesRows(owner, total.id, "target", [{ period: "2026-01-01", value: 1 }], "x")).rejects.toThrow(/targets of the Metrics/);
    await expect(updateMetricDetails(owner, total.id, { targetMin: 1 })).rejects.toThrow(/targets of the Metrics/);
    await expect(w.value(total.id, "2026-01-01", 1)).rejects.toThrow();
    expect((await db().from("metrics").update({ sources: ["api"] }).eq("id", total.id)).error?.code).toBe("23514");
  });

  it("keeps its period, unit, format and Aggregation, and those of the Metrics it adds up", async () => {
    const { w, sara, ana, make } = await setup();
    const total = await make();
    const owner = w.actor(sara);
    for (const id of [total.id, ana.id]) {
      await expect(updateMetricDetails(owner, id, { unit: "km" })).rejects.toBeInstanceOf(Refused);
      expect((await db().from("metrics").update({ unit: "km" }).eq("id", id)).error?.code).toBe(id === total.id ? "ZF458" : "ZF459");
    }
    // A name and a description are free to change, with the unit sent back as it is.
    await updateMetricDetails(owner, ana.id, { name: "Commit, Ana", unit: "EUR" });
    await updateMetricDetails(owner, total.id, { name: "Commit, team", unit: "EUR", targetMin: 20 });
  });
});
