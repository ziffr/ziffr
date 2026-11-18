// A Metric's unit and its side, and values written in the Number Style, against the real database (spec 0022,
// ticket #110): the side is stored with a check, a unit left out follows the Workspace Profile's currency, the owner
// changes the side, a reply writes the value the workspace's way, and a Snapshot made before units had a side reads
// as it did, in the Number Style of now.
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { createMetric, metricEffects, updateMetricDetails, type MetricEffects } from "./metrics";
import { forReader } from "./snapshots";
import { submitValue } from "./submissions";
import { canvas, metric as fixtureMetric } from "./test/fixtures";
import { workspace } from "./test/db-fixtures";
import { setNumberStyle, setWorkspaceProfile } from "./workspace-settings";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const fx = (): MetricEffects => ({ ...metricEffects, promptSubmitter: vi.fn(async () => {}) });
const row = async (id: number) => (await db().from("metrics").select("unit, unit_position, format").eq("id", id).single()).data;

describe("the unit's side", () => {
  it("is stored as given, and a unit left out is the one the form would propose", async () => {
    const w = await ws(); const sara = await w.person("owner"); const owner = w.actor(sara);
    const dollars = await createMetric(owner, { name: "ARR", format: "currency", unit: "$", unitPosition: "before" }, fx());
    expect(await row(dollars.id)).toEqual({ unit: "$", unit_position: "before", format: "currency" });
    // A side that is not one of the two is "after"; the unit is kept as typed, with the space it ends with.
    const odd = await createMetric(owner, { name: "Odd", unit: "CHF ", unitPosition: "left" }, fx());
    expect(await row(odd.id)).toEqual({ unit: "CHF ", unit_position: "after", format: "number" });
    // Left out (as a program may), money follows the Workspace Profile's currency, a percent gets "%".
    expect(await row((await createMetric(owner, { name: "Cash", format: "currency" }, fx())).id)).toEqual({ unit: "€", unit_position: "after", format: "currency" });
    await setWorkspaceProfile(owner, { country: "US", currency: "USD" });
    expect(await row((await createMetric(owner, { name: "MRR", format: "currency" }, fx())).id)).toEqual({ unit: "$", unit_position: "before", format: "currency" });
    await setWorkspaceProfile(owner, { country: "CH", currency: "CHF" });
    expect(await row((await createMetric(owner, { name: "Sales", format: "currency" }, fx())).id)).toEqual({ unit: "CHF ", unit_position: "before", format: "currency" });
    expect(await row((await createMetric(owner, { name: "Churn", format: "percent" }, fx())).id)).toEqual({ unit: "%", unit_position: "after", format: "percent" });
    // An empty unit given is kept empty: only a unit left out is proposed.
    expect(await row((await createMetric(owner, { name: "Bare", format: "currency", unit: "" }, fx())).id)).toEqual({ unit: "", unit_position: "after", format: "currency" });
  });

  it("is changed by the owner, kept when left out, and the column refuses anything but before or after", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { unit: "$", format: "currency" });
    expect(await row(m.id)).toMatchObject({ unit_position: "after" });
    await updateMetricDetails(w.actor(sara), m.id, { unitPosition: "before" });
    expect(await row(m.id)).toMatchObject({ unit: "$", unit_position: "before" });
    await updateMetricDetails(w.actor(sara), m.id, { name: "Renamed" });
    await updateMetricDetails(w.actor(sara), m.id, { unitPosition: "sideways" });
    expect(await row(m.id)).toMatchObject({ unit_position: "before" });
    const { error } = await db().from("metrics").update({ unit_position: "left" }).eq("id", m.id);
    expect(error).not.toBeNull();
    const { data: v } = await db().from("versions").select("snapshot").eq("object_type", "metric").eq("object_id", m.id).order("version", { ascending: false }).limit(1).single();
    expect(v?.snapshot).toMatchObject({ unit: "$", unit_position: "before" });
  });
});

describe("values written in the Number Style", () => {
  it("are what a reply to a value says", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara, { name: "Revenue", unit: "€", format: "currency", decimals: 2 });
    const code = await w.token(m.id, ann);
    await setNumberStyle(w.actor(sara), "1.234,5");
    const r = await submitValue({ source: "web_form", sender: code, text: "1234.5" });
    expect(r.detail).toContain("1.234,50 €");
  });

  it("are how a kept Snapshot reads now, with the unit an old Metric's format used to add", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Cash", unit: "", format: "currency" });
    await setNumberStyle(w.actor(sara), "1 234,5");
    // As a Snapshot kept it before units had a side: an empty unit, no side, and no Number Style.
    const old: Record<string, unknown> = fixtureMetric({ id: m.id, slug: m.slug, owner_id: sara, unit: "", format: "currency" });
    delete old.unit_position;
    const kept = { ...canvas([old as never], { [m.slug]: [{ period: "2026-10-01", value: 1200 }] }) } as Record<string, unknown>;
    delete kept.numberStyle;
    const { data } = await forReader(w.actor(sara), [], kept as never, null);
    expect(data.numberStyle).toBe("1 234,5");
    expect(data.metrics[0]).toMatchObject({ unit: "€", unit_position: "after" });
  });
});
