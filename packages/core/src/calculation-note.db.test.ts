// How a Metric is calculated, against the real database (spec 0060; GLOSSARY: Calculation Note, Version, View Link):
// who may change and read it, that it is stored sealed, that each change is a Version that says so and can be restored,
// and that neither a View Link nor a form link ever carries it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { getMetric } from "./api";
import { createDashboard, placeWidget } from "./dashboards";
import { db } from "./db";
import { createDerivedMetric } from "./derived-metrics";
import { createMetric, metricDraftFrom, metricEffects, updateMetricDetails, type MetricEffects } from "./metrics";
import { submissionForm } from "./page-data";
import { metricQuickLook, QUICK_LOOK_REFUSAL } from "./quick-look";
import { share } from "./sharing";
import { createViewLink, openViewLink } from "./view-links";
import { listVersions, restoreVersion } from "./version-history";
import { isSealed } from "./workspace-keys";
import { getMetrics } from "./workspace-data";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const saved = process.env.ZIFFR_SECRETS_KEY;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 60).toString("base64"); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
});
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const quiet: MetricEffects = { ...metricEffects, promptSubmitter: async () => false };
const forbidden = expect.any(Forbidden);
const NOTE = "Recurring fees of active contracts.\nOne-off fees are left out.";

/** A Workspace whose Owner made one Metric with a Calculation Note. */
async function made() {
  const w = await ws(); const sara = await w.person("owner");
  const m = await createMetric(w.actor(sara), { name: "ARR", description: "What recurs each year.", calculationNote: `  ${NOTE.replace("\n", "\r\n")}  ` }, quiet);
  return { w, sara, m };
}
const read = async (workspaceId: string, id: number) => (await getMetrics(workspaceId)).find((x) => x.id === id)!;
const stored = async (id: number) => (await db().from("metrics").select("calculation_note").eq("id", id).single()).data!.calculation_note as string | null;

describe("the Calculation Note", () => {
  it("is cleaned, stored sealed, read back, and null where there is none", async () => {
    const { w, sara, m } = await made();
    expect((await read(w.id, m.id)).calculation_note).toBe(NOTE);
    expect(isSealed((await stored(m.id))!)).toBe(true);
    const plain = await createMetric(w.actor(sara), { name: "Orders", calculationNote: "   " }, quiet);
    expect(await stored(plain.id)).toBeNull();
    expect((await getMetric(w.actor(sara), m.slug)).calculation_note).toBe(NOTE);
    expect((await getMetric(w.actor(sara), plain.slug)).calculation_note).toBe("");
    expect((await metricDraftFrom(w.actor(sara), m.id)).calculation_note).toBe(NOTE);
    await updateMetricDetails(w.actor(sara), m.id, { calculationNote: "x".repeat(2100) });
    expect((await read(w.id, m.id)).calculation_note).toHaveLength(2000);
  });

  it("is changed by the owner and Editors only", async () => {
    const { w, sara, m } = await made();
    const ed = await w.person("member"); const vic = await w.person("member"); const dan = await w.person("member"); const gus = await w.person("guest");
    await share(w.actor(sara), "metric", m.id, ed, "editor");
    await share(w.actor(sara), "metric", m.id, vic, "viewer");
    await share(w.actor(sara), "metric", m.id, gus, "viewer");
    for (const a of [w.actor(vic, "member"), w.actor(dan, "member"), w.actor(gus, "guest")]) {
      await expect(updateMetricDetails(a, m.id, { calculationNote: "Mine" })).rejects.toEqual(forbidden);
    }
    const other = await ws(); const zoe = await other.person("owner");
    await expect(updateMetricDetails(other.actor(zoe), m.id, { calculationNote: "Mine" })).rejects.toEqual(forbidden);
    await updateMetricDetails(w.actor(ed, "member"), m.id, { calculationNote: "Net of discounts." });
    expect((await read(w.id, m.id)).calculation_note).toBe("Net of discounts.");
  });

  it("reaches those the Metric is shared with, and nobody else", async () => {
    const { w, sara, m } = await made();
    const vic = await w.person("member"); const dan = await w.person("member");
    await share(w.actor(sara), "metric", m.id, vic, "viewer");
    expect((await metricQuickLook(w.actor(vic, "member"), m.slug)).metric.calculation_note).toBe(NOTE);
    await expect(metricQuickLook(w.actor(dan, "member"), m.slug)).rejects.toThrow(QUICK_LOOK_REFUSAL);
    await expect(getMetric(w.actor(dan, "member"), m.slug)).rejects.toEqual(forbidden);
  });

  it("shows a Derived Metric's formula only to someone who sees every input", async () => {
    const { w, sara, m } = await made();
    const derived = await createDerivedMetric(w.actor(sara), { name: "ARR per month", formula: `{${m.slug}} / 12`, calculationNote: "A twelfth." }, quiet);
    const vic = await w.person("member");
    await share(w.actor(sara), "metric", derived.id, vic, "viewer");
    expect((await metricQuickLook(w.actor(vic, "member"), derived.slug)).metric).toMatchObject({ derived: true, formula: null, calculation_note: "A twelfth." });
    expect((await metricQuickLook(w.actor(sara), derived.slug)).metric.formula).toBe("ARR / 12");
  });

  it("goes out with neither a View Link nor a personal form link", async () => {
    const { w, sara, m } = await made();
    const dash = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), dash, { type: "metric", id: m.id });
    for (const frozen of [false, true]) {
      const token = await createViewLink(w.actor(sara), "dashboard", dash, { label: "", expires: new Date(Date.now() + 86_400_000 * 5).toISOString().slice(0, 10), frozen });
      const view = await openViewLink(token);
      const shown = view!.data.metrics.find((x) => x.id === m.id)!;
      expect(shown.calculation_note).toBe("");
      expect(JSON.stringify(view)).not.toContain("One-off fees");
    }
    const code = await w.token(m.id, sara);
    const form = await submissionForm(code);
    expect(form!.metric.calculation_note).toBeNull();
    expect(JSON.stringify(form)).not.toContain("One-off fees");
  });

  it("keeps every change as a Version that says so, and restores it", async () => {
    const { w, sara, m } = await made();
    const versions = async () => (await listVersions(w.actor(sara), "metric", m.id)).versions;
    const created = (await versions()).at(-1)!;
    // Saving the form with the same words is no change of the definition, whatever else the history makes of it.
    await updateMetricDetails(w.actor(sara), m.id, { name: "ARR", description: "What recurs each year.", calculationNote: NOTE });
    expect((await versions())[0].message).not.toMatch(/how it is calculated/);
    expect((await versions())[0].changes).not.toContain("how it is calculated");
    await updateMetricDetails(w.actor(sara), m.id, { description: "What recurs each year.", calculationNote: "Net of discounts." });
    const [latest] = await versions();
    expect(latest.message).toBe("Changed how it is calculated");
    expect(latest.changes).toContain("how it is calculated");
    await updateMetricDetails(w.actor(sara), m.id, { name: "Annual recurring revenue", calculationNote: "" });
    expect((await versions())[0].message).toBe("Changed how it is calculated and its description");
    expect(await stored(m.id)).toBeNull();
    await restoreVersion(w.actor(sara), created.id);
    expect((await read(w.id, m.id)).calculation_note).toBe(NOTE);
    // Kept Versions hold the words sealed, like the row.
    const { data: kept } = await db().from("versions").select("snapshot").eq("object_type", "metric").eq("object_id", m.id);
    expect(JSON.stringify(kept)).not.toContain("One-off fees");
    // A Version from a Metric without a note takes today's away.
    const plain = await createMetric(w.actor(sara), { name: "Orders" }, quiet);
    await updateMetricDetails(w.actor(sara), plain.id, { calculationNote: "Paid orders." });
    await restoreVersion(w.actor(sara), (await listVersions(w.actor(sara), "metric", plain.id)).versions.at(-1)!.id);
    expect(await stored(plain.id)).toBeNull();
  });
});
