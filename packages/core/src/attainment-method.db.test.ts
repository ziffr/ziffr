// The Attainment method against the real database (spec 0022, ticket #130; GLOSSARY: Attainment): the Workspace's
// default is Ratio for every Workspace, only Owners and Admins change it and never in the demo, each change is
// audited; a Metric's own method is stored with a check, set in the form and through the API, copied by a duplicate
// and kept in Versions; Snapshots and frozen View Links keep the methods they were made with.
import { openFrozenData } from "./sealed-words";
import { workspaceCipher } from "./workspace-keys";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type KeyActor } from "./actor";
import { actorForKey, createAccessKey } from "./access-keys";
import { getMetric } from "./api";
import { db } from "./db";
import { getCanvasData } from "./access";
import { createMetricWithKey } from "./api-metrics";
import { summary, resolverFrom } from "./compare";
import { createDashboard, placeWidget } from "./dashboards";
import { createMetric, metricDraftFrom, metricEffects, updateMetricDetails, type MetricEffects } from "./metrics";
import { openSnapshot, showSnapshot, takeSnapshot } from "./snapshots";
import { DEMO_WORKSPACE_ID } from "./team";
import { createViewLink, openViewLink } from "./view-links";
import { attainmentMethodOf, setAttainmentMethod, workspaceAttainmentMethod } from "./workspace-settings";
import { workspace, opened } from "./test/db-fixtures";
import type { CanvasData } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const fx = (): MetricEffects => ({ ...metricEffects, promptSubmitter: vi.fn(async () => {}) });
const methodOf = async (id: number) => (await db().from("metrics").select("attainment_method").eq("id", id).single()).data?.attainment_method;
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
/** The Attainment a widget shows for a Metric of some canvas data: the comparison strip's number. */
const shown = (data: CanvasData, slug: string) => {
  const m = data.metrics.find((x) => x.slug === slug)!;
  return summary(m, resolverFrom(data.metrics, data.series), data.targets[m.id], { keys: [], yearStart: data.yearStart, attainmentMethod: data.attainmentMethod });
};

describe("the Workspace's Attainment method", () => {
  it("is Ratio until an Owner or Admin changes it, for every member to read, and each change is audited", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin"); const gus = await w.person("guest");
    expect(await workspaceAttainmentMethod(w.actor(gus, "guest"))).toBe("ratio");
    expect(await setAttainmentMethod(w.actor(sara), "distance")).toBe("distance");
    expect(await attainmentMethodOf(w.id)).toBe("distance");
    await setAttainmentMethod(w.actor(ann, "admin"), "ratio");
    // The same method again changes nothing and records nothing.
    await setAttainmentMethod(w.actor(ann, "admin"), "ratio");
    const data = await opened("audit_events", w.id, (await db().from("audit_events").select("id, actor_id, details").eq("workspace_id", w.id).eq("kind", "workspace.attainment_method_changed").order("id")).data, { dropId: true });
    expect(data).toEqual([{ actor_id: sara, details: { from: "ratio", to: "distance" } }, { actor_id: ann, details: { from: "distance", to: "ratio" } }]);
  });

  it("refuses Members, Guests, Access Keys, the demo and anything but ratio or distance", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    await expect(setAttainmentMethod(w.actor(ben, "member"), "distance")).rejects.toEqual(expect.any(Forbidden));
    await expect(setAttainmentMethod(w.actor(gus, "guest"), "distance")).rejects.toEqual(expect.any(Forbidden));
    await expect(setAttainmentMethod({ ...w.actor(sara), key: { id: "k1", scopes: ["metrics:write"] } } as never, "distance")).rejects.toEqual(expect.any(Forbidden));
    await expect(setAttainmentMethod({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, "distance")).rejects.toEqual(expect.any(Forbidden));
    for (const bad of ["Distance", "ratio ", "", null, 1, "percent"]) await expect(setAttainmentMethod(w.actor(sara), bad)).rejects.toThrow(/Attainment method/);
    expect(await attainmentMethodOf(w.id)).toBe("ratio");
    // The column's check holds even for a write that skips the core; the demo is Ratio too.
    expect((await db().from("workspaces").update({ attainment_method: "percent" }).eq("id", w.id)).error).not.toBeNull();
    expect((await db().from("workspaces").update({ attainment_method: null }).eq("id", w.id)).error).not.toBeNull();
    expect(await attainmentMethodOf(DEMO_WORKSPACE_ID)).toBe("ratio");
  });
});

describe("a Metric's own Attainment method", () => {
  it("is stored from the form and the API, changed by its owner, copied by a duplicate and kept in its Versions", async () => {
    const w = await ws(); const sara = await w.person("owner"); const owner = w.actor(sara);
    const plain = await createMetric(owner, { name: "Plain" }, fx());
    expect(await methodOf(plain.id)).toBeNull();
    const own = await createMetric(owner, { name: "Own", attainmentMethod: "distance" }, fx());
    expect(await methodOf(own.id)).toBe("distance");
    // Anything but the two keys follows the Workspace.
    expect(await methodOf((await createMetric(owner, { name: "Odd", attainmentMethod: "percent" }, fx())).id)).toBeNull();

    await updateMetricDetails(owner, plain.id, { attainmentMethod: "ratio" });
    expect(await methodOf(plain.id)).toBe("ratio");
    await updateMetricDetails(owner, plain.id, { name: "Renamed" });
    expect(await methodOf(plain.id)).toBe("ratio");
    const { data: v } = await db().from("versions").select("snapshot").eq("object_type", "metric").eq("object_id", plain.id).order("version", { ascending: false }).limit(1).single();
    expect(v?.snapshot).toMatchObject({ attainment_method: "ratio" });
    // Empty, as the form sends "as the workspace", clears it.
    await updateMetricDetails(owner, plain.id, { attainmentMethod: "" });
    expect(await methodOf(plain.id)).toBeNull();
    expect((await metricDraftFrom(owner, own.id)).attainment_method).toBe("distance");
    expect((await db().from("metrics").update({ attainment_method: "percent" }).eq("id", own.id)).error).not.toBeNull();

    const { secret } = await createAccessKey(owner, { name: "Setup script", scopes: ["metrics:read", "metrics:write"], expiresOn: inDays(30) });
    const key = (await actorForKey(secret)) as KeyActor;
    const made = await createMetricWithKey(key, { name: "From a program", attainment_method: "distance" }, fx());
    expect(made.attainment_method).toBe("distance");
    expect((await getMetric(key, own.slug)).attainment_method).toBe("distance");
    expect((await getMetric(key, plain.slug)).attainment_method).toBeNull();
  });

  it("wins over the Workspace's method, which every other Metric follows", async () => {
    const w = await ws(); const sara = await w.person("owner");
    // "Lower is better", 5 against at most 10: Ratio 200 %, Distance 150 %.
    const follows = await w.metric(sara, { name: "Follows", polarity: "lower", target_max: 10 });
    const own = await w.metric(sara, { name: "Own", polarity: "lower", target_max: 10, attainment_method: "distance" });
    for (const m of [follows, own]) await w.value(m.id, "2026-10-01", 5);
    let data = await getCanvasData(w.id, sara);
    expect(data.attainmentMethod).toBe("ratio");
    expect(shown(data, follows.slug)).toMatchObject({ attainment: 200, method: "ratio" });
    expect(shown(data, own.slug)).toMatchObject({ attainment: 150, method: "distance" });
    await setAttainmentMethod(w.actor(sara), "distance");
    data = await getCanvasData(w.id, sara);
    expect(shown(data, follows.slug)).toMatchObject({ attainment: 150, method: "distance" });
  });
});

describe("Snapshots and View Links", () => {
  it("keep the method they were made with after the Workspace's and the Metric's change", async () => {
    const w = await ws(); const sara = await w.person("owner"); const owner = w.actor(sara);
    const follows = await w.metric(sara, { name: "Churn", polarity: "lower", target_max: 10 });
    const own = await w.metric(sara, { name: "Costs", polarity: "lower", target_max: 10, attainment_method: "distance" });
    for (const m of [follows, own]) await w.value(m.id, "2026-10-01", 5);
    const dash = await createDashboard(owner, "Monthly");
    await placeWidget(owner, dash, { type: "spec", template: "table", metricIds: [follows.id, own.id], settings: {} });
    const snap = await takeSnapshot(owner, dash, { kind: "month", start: "2026-10-01" });
    await showSnapshot(owner, snap);
    const snapLink = await createViewLink(owner, "dashboard", dash, { label: "", expires: inDays(30), frozen: false, snapshotId: snap });
    const frozenLink = await createViewLink(owner, "dashboard", dash, { label: "", expires: inDays(30), frozen: true });

    // Everything changes afterwards: the Workspace's method and each Metric's own.
    await setAttainmentMethod(owner, "distance");
    await updateMetricDetails(owner, own.id, { attainmentMethod: "ratio" });
    const live = await getCanvasData(w.id, sara);
    expect(shown(live, follows.slug).attainment).toBe(150);
    expect(shown(live, own.slug).attainment).toBe(200);

    for (const data of [(await openSnapshot(owner, snap)).data, (await openViewLink(snapLink))!.data, (await openViewLink(frozenLink))!.data]) {
      expect(data.attainmentMethod).toBe("ratio");
      expect(shown(data, follows.slug)).toMatchObject({ attainment: 200, method: "ratio" });
      expect(shown(data, own.slug)).toMatchObject({ attainment: 150, method: "distance" });
    }
  });

  it("keep Ratio when they were made before the method could be chosen", async () => {
    const w = await ws(); const sara = await w.person("owner"); const owner = w.actor(sara);
    const m = await w.metric(sara, { name: "Churn", polarity: "lower", target_max: 10 });
    await w.value(m.id, "2026-10-01", 5);
    const dash = await createDashboard(owner, "Monthly");
    await placeWidget(owner, dash, { type: "spec", template: "table", metricIds: [m.id], settings: {} });
    const snap = await takeSnapshot(owner, dash, { kind: "month", start: "2026-10-01" });
    // As a Snapshot from 0.9.0 kept it: no method in its data or its Metrics.
    const { data: row } = await db().from("dashboard_snapshots").select("frozen").eq("id", snap).single();
    // The data is sealed with the Workspace Key (spec 0028): opened here, and written back plain, as it was before.
    const frozen = openFrozenData(await workspaceCipher(w.id), "dashboard_snapshots", snap, row!.frozen as { data: unknown })! as { data: Record<string, unknown> & { metrics: Record<string, unknown>[] } };
    delete frozen.data.attainmentMethod;
    for (const x of frozen.data.metrics) delete x.attainment_method;
    // The database keeps a Snapshot's frozen part as it was taken; only this test rewrites it, through a fresh copy.
    const { data: copy } = await db().from("dashboard_snapshots").insert({ ...(await db().from("dashboard_snapshots").select("workspace_id, dashboard_id, period_kind, period_start, period_end, label, taken_by, automatic, words").eq("id", snap).single()).data, period_start: "2026-09-01", period_end: "2026-09-30", label: "September 2026", frozen }).select("id").single();
    await setAttainmentMethod(owner, "distance");
    const data = (await openSnapshot(owner, copy!.id as number)).data;
    expect(data.attainmentMethod).toBe("ratio");
    expect(shown(data, m.slug)).toMatchObject({ attainment: 200, method: "ratio" });
  });
});
