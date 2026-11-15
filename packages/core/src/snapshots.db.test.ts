// Snapshots taken by hand (spec 0013, ticket #175; GLOSSARY: Snapshot), against the database: who may take, read,
// write, show and delete them; what they keep for each period; and that their numbers never change.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createDashboard, placeWidget, removeWidget, saveDashboardText } from "./dashboards";
import { dashboardWidgets } from "./page-data";
import { share } from "./sharing";
import { deleteSnapshot, editSnapshotWords, listSnapshots, MAX_SNAPSHOTS, openSnapshot, showSnapshot, takeSnapshot } from "./snapshots";
import { listVersions, restoreVersion, saveNamedVersion } from "./version-history";
import { activityView } from "./page-data";
import { visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { seedDemoSnapshots } from "./demo-snapshots";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const october = { kind: "month", start: "2026-10-01" };

/** A workspace with an owner, an Editor, a Viewer and a Guest Viewer of one dashboard holding a monthly Metric. */
async function setup() {
  const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member"); const gus = await w.person("guest");
  const rev = await w.metric(sara, { name: "Revenue" });
  for (const [p, v] of [["2026-08-01", 80], ["2026-09-01", 90], ["2026-10-01", 100], ["2026-11-01", 110]] as const) await w.value(rev.id, p, v);
  const dash = await createDashboard(w.actor(sara), "Monthly overview");
  await saveDashboardText(w.actor(sara), dash, { intro: "How the month went." });
  await placeWidget(w.actor(sara), dash, { type: "spec", template: "story", metricIds: [rev.id], settings: { headline: "Revenue held up", panels: [] } });
  await share(w.actor(sara), "dashboard", dash, ben, "editor");
  await share(w.actor(sara), "dashboard", dash, ann, "viewer");
  await share(w.actor(sara), "dashboard", dash, gus, "viewer");
  return { w, sara, ben: w.actor(ben, "member"), ann: w.actor(ann, "member"), gus: w.actor(gus, "guest"), owner: w.actor(sara), rev, dash };
}

describe("taking a Snapshot", () => {
  it("is for the dashboard's owner and Editors, not its Viewers, Guests or other workspaces", async () => {
    const { owner, ben, ann, gus, dash } = await setup();
    expect(await takeSnapshot(ben, dash, october)).toBeGreaterThan(0);
    await expect(takeSnapshot(owner, dash, { kind: "month", start: "2026-09-01" })).resolves.toBeGreaterThan(0);
    await expect(takeSnapshot(ann, dash, { kind: "month", start: "2026-08-01" })).rejects.toEqual(forbidden);
    await expect(takeSnapshot(gus, dash, { kind: "month", start: "2026-08-01" })).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(takeSnapshot(other.actor(zoe), dash, { kind: "month", start: "2026-08-01" })).rejects.toEqual(forbidden);
  });

  it("refuses a period that is not one, and a second Snapshot of the same period while the first exists", async () => {
    const { owner, dash } = await setup();
    await expect(takeSnapshot(owner, dash, { kind: "month", start: "2026-10-02" })).rejects.toThrow(/week, month or quarter/);
    await expect(takeSnapshot(owner, dash, { kind: "year", start: "2026-01-01" })).rejects.toThrow(/week, month or quarter/);
    const first = await takeSnapshot(owner, dash, october);
    await expect(takeSnapshot(owner, dash, october)).rejects.toThrow(/October 2026 already/);
    await deleteSnapshot(owner, first);
    await expect(takeSnapshot(owner, dash, october)).resolves.toBeGreaterThan(first);
  });

  it("only of a period that is over, within ten years, and up to the most a dashboard keeps (security review)", async () => {
    const { w, owner, dash } = await setup();
    const today = { today: "2026-11-15" };
    await expect(takeSnapshot(owner, dash, { kind: "month", start: "2026-11-01" }, today)).rejects.toThrow(/not over yet/);
    await expect(takeSnapshot(owner, dash, { kind: "quarter", start: "2030-10-01" }, today)).rejects.toThrow(/not over yet/);
    await expect(takeSnapshot(owner, dash, { kind: "month", start: "1900-01-01" }, today)).rejects.toThrow(/10 years/);
    await expect(takeSnapshot(owner, dash, { kind: "week", start: "2026-11-09" }, today)).rejects.toThrow(/not over yet/);
    await expect(takeSnapshot(owner, dash, { kind: "week", start: "2026-11-02" }, today)).resolves.toBeGreaterThan(0);
    // Fill the dashboard up to the most it keeps, straight in the database, then one more is refused.
    const rows = Array.from({ length: MAX_SNAPSHOTS - 1 }, (_, i) => {
      const d = new Date(Date.UTC(2017, 0, 2 + 7 * i)).toISOString().slice(0, 10);
      return { workspace_id: w.id, dashboard_id: dash, period_kind: "week", period_start: d, period_end: d, label: `W${i}`, taken_by: owner.personId, frozen: null };
    });
    expect((await db().from("dashboard_snapshots").insert(rows)).error).toBeNull();
    await expect(takeSnapshot(owner, dash, october, today)).rejects.toThrow(/500 Snapshots at most/);
  });

  it("needs the taker to see every Metric on the dashboard", async () => {
    const { w, owner, ben, dash } = await setup();
    // Ben's own Metric, placed by Ben, that Sara does not see.
    const payroll = await w.metric(ben.personId, { name: "Payroll" });
    await placeWidget(ben, dash, { type: "metric", id: payroll.id });
    await expect(takeSnapshot(owner, dash, october)).rejects.toEqual(forbidden);
    await expect(takeSnapshot(ben, dash, october)).resolves.toBeGreaterThan(0);
  });

  it("keeps the values of the Metric periods complete by the period's last day, for any Metric period", async () => {
    const { w, owner, rev, dash } = await setup();
    const visits = await w.metric(owner.personId, { name: "Visits", period: "week" });
    for (const p of ["2026-09-21", "2026-09-28", "2026-10-26", "2026-11-02"]) await w.value(visits.id, p, 1);
    const daily = await w.metric(owner.personId, { name: "Orders", period: "day" });
    for (const p of ["2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01"]) await w.value(daily.id, p, 1);
    await placeWidget(owner, dash, { type: "metric", id: visits.id });
    await placeWidget(owner, dash, { type: "metric", id: daily.id });
    const periods = async (id: number, slug: string) => (await openSnapshot(owner, id)).data.series[slug].map((p) => p.period);
    const oct = await takeSnapshot(owner, dash, october);
    expect(await periods(oct, rev.slug)).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    // The week of 2 Nov ends after October; the week of 26 Oct ends on 1 Nov, after October too.
    expect(await periods(oct, visits.slug)).toEqual(["2026-09-21", "2026-09-28"]);
    expect(await periods(oct, daily.slug)).toEqual(["2026-09-30", "2026-10-01", "2026-10-31"]);
    const q3 = await takeSnapshot(owner, dash, { kind: "quarter", start: "2026-07-01" });
    expect(await periods(q3, rev.slug)).toEqual(["2026-08-01", "2026-09-01"]);
    // The week of 28 Sep ends in October, so it is not in Q3.
    expect(await periods(q3, visits.slug)).toEqual(["2026-09-21"]);
    const week = await takeSnapshot(owner, dash, { kind: "week", start: "2026-10-26" });
    expect(await periods(week, visits.slug)).toEqual(["2026-09-21", "2026-09-28", "2026-10-26"]);
  });

  it("goes out without people's contact details or anything to act on", async () => {
    const { w, owner, dash } = await setup();
    await w.person("member", { email: "secret@example.com" });
    const s = await openSnapshot(owner, await takeSnapshot(owner, dash, october));
    expect(JSON.stringify(s.data)).not.toContain("secret@example.com");
    expect(s.data.openActions).toEqual({});
    expect(s.data.groups).toEqual([]);
  });

  it("is written down in the Audit Log", async () => {
    const { w, owner, dash } = await setup();
    const id = await takeSnapshot(owner, dash, october);
    await showSnapshot(owner, id);
    await deleteSnapshot(owner, id);
    const { data } = await db().from("audit_events").select("kind, details").eq("workspace_id", w.id).like("kind", "snapshot.%").order("id");
    expect(data!.map((e) => e.kind)).toEqual(["snapshot.taken", "snapshot.shown", "snapshot.deleted"]);
    expect(data![0].details).toMatchObject({ snapshot_id: id, period: "October 2026", automatic: false });
  });
});

describe("a Snapshot's numbers", () => {
  it("never change, not even through the database, until it is deleted", async () => {
    const { owner, dash } = await setup();
    const id = await takeSnapshot(owner, dash, october);
    const { error } = await db().from("dashboard_snapshots").update({ frozen: { name: "x" } }).eq("id", id);
    expect(error?.message).toMatch(/never change/);
    const { error: period } = await db().from("dashboard_snapshots").update({ period_start: "2026-09-01" }).eq("id", id);
    expect(period?.message).toMatch(/keeps its period/);
    await deleteSnapshot(owner, id);
    const { error: back } = await db().from("dashboard_snapshots").update({ deleted_at: null }).eq("id", id);
    expect(back?.message).toMatch(/stays deleted/);
  });

  it("stay as taken when values change, and the dashboard's widgets and words can change freely", async () => {
    const { w, owner, rev, dash } = await setup();
    const id = await takeSnapshot(owner, dash, october);
    await db().from("observations").update({ value: 999 }).eq("metric_id", rev.id).eq("period_start", "2026-10-01");
    await w.value(rev.id, "2026-07-01", 70);
    await saveDashboardText(owner, dash, { intro: "Changed later." });
    const s = await openSnapshot(owner, id);
    expect(s.data.series[rev.slug]).toEqual([{ period: "2026-08-01", value: 80 }, { period: "2026-09-01", value: 90 }, { period: "2026-10-01", value: 100 }]);
    expect(s.intro).toBe("How the month went.");
  });
});

describe("a Snapshot's words", () => {
  it("are written by the owner and Editors: words only, for widgets it has", async () => {
    const { owner, ben, ann, dash } = await setup();
    const id = await takeSnapshot(owner, dash, october);
    await showSnapshot(owner, id);
    const [finding] = (await openSnapshot(owner, id)).widgets;
    await editSnapshotWords(ben, id, { intro: "October in short.", widgets: { [finding.id]: { headline: "Revenue grew", kicker: "Monthly report" } } });
    const s = await openSnapshot(ann, id);
    expect(s.intro).toBe("October in short.");
    expect(s.widgets[0].settings).toMatchObject({ headline: "Revenue grew", kicker: "Monthly report" });
    await expect(editSnapshotWords(ann, id, { intro: "mine" })).rejects.toEqual(forbidden);
    await expect(editSnapshotWords(owner, id, { widgets: { [finding.id]: { panels: [] } } })).rejects.toThrow(/Only the words/);
    await expect(editSnapshotWords(owner, id, { widgets: { "999999": { headline: "x" } } })).rejects.toThrow(/cannot be saved/);
    await expect(editSnapshotWords(owner, id, { widgets: [] })).rejects.toThrow(/cannot be saved/);
  });

  it("keep Versions in the dashboard's workspace, say when they changed after showing, and come back with a restore", async () => {
    const { w, owner, dash } = await setup();
    const id = await takeSnapshot(owner, dash, october);
    await editSnapshotWords(owner, id, { intro: "Draft words." });
    expect((await listSnapshots(owner, dash))[0].wordsChangedAt).toBeNull();
    await showSnapshot(owner, id);
    await editSnapshotWords(owner, id, { intro: "Corrected words." });
    expect((await listSnapshots(owner, dash))[0].wordsChangedAt).not.toBeNull();
    const { data: rows } = await db().from("versions").select("workspace_id").eq("object_type", "snapshot").eq("object_id", id);
    expect(rows!.length).toBeGreaterThan(0);
    expect(rows!.every((r) => r.workspace_id === w.id)).toBe(true);
    const { versions } = await listVersions(owner, "snapshot", id);
    await restoreVersion(owner, versions.at(-1)!.id);
    expect((await openSnapshot(owner, id)).intro).toBe("How the month went.");
  });
});

describe("the demo's Snapshots", () => {
  it("are taken and shown for the last two complete months of October in short", async () => {
    const DEMO = "d3e00000-0000-4000-8000-000000000001";
    const { data: dash } = await db().from("dashboards").select("id, owner_id").eq("workspace_id", DEMO).eq("name", "October in short").single();
    const owner = { personId: dash!.owner_id as string, workspaceId: DEMO, role: "owner" as const };
    // Start from none, as after a reset.
    for (const s of await listSnapshots(owner, dash!.id)) await deleteSnapshot(owner, s.id);
    await seedDemoSnapshots("2026-11-15");
    const list = await listSnapshots(owner, dash!.id);
    expect(list.map((s) => [s.label, Boolean(s.shownAt)])).toEqual([["October 2026", true], ["September 2026", true]]);
    for (const s of list) await deleteSnapshot(owner, s.id);
  });
});

describe("who sees a Snapshot", () => {
  it("drafts only the owner and Editors; once shown, everyone who may open the dashboard", async () => {
    const { owner, ben, ann, gus, dash } = await setup();
    const id = await takeSnapshot(owner, dash, october);
    expect((await listSnapshots(ben, dash)).map((s) => s.id)).toEqual([id]);
    expect(await listSnapshots(ann, dash)).toEqual([]);
    await expect(openSnapshot(ann, id)).rejects.toEqual(forbidden);
    await expect(listVersions(ann, "snapshot", id)).rejects.toEqual(forbidden);
    await expect(showSnapshot(ann, id)).rejects.toEqual(forbidden);
    await showSnapshot(ben, id);
    expect((await listSnapshots(ann, dash)).map((s) => s.label)).toEqual(["October 2026"]);
    expect((await openSnapshot(gus, id)).canWrite).toBe(false);
  });

  it("shows a draft's Versions in Activity and its Version list only to the owner and Editors (security review)", async () => {
    const { w, owner, ben, ann, dash } = await setup();
    const outsider = w.actor(await w.person("member"), "member");
    const id = await takeSnapshot(owner, dash, october);
    await editSnapshotWords(owner, id, { intro: "Draft words." });
    await saveNamedVersion(owner, "snapshot", id, "do not publish yet");
    const snapshotRows = async (a: typeof owner) => (await activityView(a)).versions.filter((v) => v.object_type === "snapshot");
    expect((await snapshotRows(owner)).length).toBeGreaterThan(0);
    expect((await snapshotRows(ben)).length).toBeGreaterThan(0);
    expect(await snapshotRows(ann)).toEqual([]);
    expect(await snapshotRows(outsider)).toEqual([]);
    // Shown: a Viewer sees only what came after, never the draft's Versions or their names.
    await showSnapshot(owner, id);
    expect((await listVersions(ann, "snapshot", id)).versions).toEqual([]);
    expect(await snapshotRows(ann)).toEqual([]);
    await new Promise((r) => setTimeout(r, 20));
    await editSnapshotWords(ben, id, { intro: "Shown words." });
    expect((await listVersions(ann, "snapshot", id)).versions.map((v) => v.name)).toEqual([null]);
    expect((await snapshotRows(ann)).length).toBe(1);
    expect(await snapshotRows(outsider)).toEqual([]);
  });

  it("lets only owners and Editors who see every Metric it kept read, write or show a draft (second security review)", async () => {
    const { w, owner, ben, ann, dash } = await setup();
    // Ben's own Metric on Sara's dashboard, which Sara does not see: Ben takes the Snapshot, so it keeps Payroll.
    const payroll = await w.metric(ben.personId, { name: "Payroll" });
    await w.value(payroll.id, "2026-10-01", 50);
    await placeWidget(ben, dash, { type: "metric", id: payroll.id });
    const id = await takeSnapshot(ben, dash, october);
    await expect(openSnapshot(owner, id)).rejects.toEqual(forbidden);
    await expect(editSnapshotWords(owner, id, { intro: "x" })).rejects.toEqual(forbidden);
    await expect(showSnapshot(owner, id)).rejects.toEqual(forbidden);
    await expect(listVersions(owner, "snapshot", id)).rejects.toEqual(forbidden);
    // Ben sees all it kept: he reads, writes and shows it; then it is the dashboard's, like any shown Snapshot.
    await editSnapshotWords(ben, id, { intro: "Payroll held." });
    await showSnapshot(ben, id);
    // Shown, each reader gets Payroll exactly when they see it live: Sara does not (no widget, values or name); Ann
    // does, through the dashboard's Share, as on the live dashboard; Ben owns it.
    const sees = async (a: typeof owner) => (await visibleMetricIds(w.id, a.personId, await getMetrics(w.id))).has(payroll.id);
    expect([await sees(owner), await sees(ann), await sees(ben)]).toEqual([false, true, true]);
    const sara = await openSnapshot(owner, id);
    expect([sara.intro, sara.hiddenParts, sara.data.metrics.some((m) => m.id === payroll.id), JSON.stringify(sara).includes("Payroll\"")]).toEqual(["Payroll held.", 1, false, false]);
    for (const reader of [ann, ben]) expect((await openSnapshot(reader, id)).hiddenParts).toBe(0);
  });

  it("shows each reader only the Metrics they may see now, and goes with the dashboard's Share (decided on #193)", async () => {
    const { w, owner, ann, rev, dash } = await setup();
    const id = await takeSnapshot(owner, dash, october);
    await showSnapshot(owner, id);
    const before = await openSnapshot(ann, id);
    expect([before.widgets.length, before.hiddenParts, before.data.series[rev.slug].at(-1)]).toEqual([1, 0, { period: "2026-10-01", value: 100 }]);
    // Taken off the dashboard, Revenue is no longer Ann's to see through it: it goes from her Snapshot too.
    for (const x of await dashboardWidgets(owner, dash)) await removeWidget(owner, x.id);
    const after = await openSnapshot(ann, id);
    expect([after.widgets.length, after.hiddenParts, after.data.metrics.length, after.data.series[rev.slug]]).toEqual([0, 1, 0, undefined]);
    // Sara, who owns Revenue, still reads all of it.
    expect((await openSnapshot(owner, id)).widgets).toHaveLength(1);
    await share(owner, "dashboard", dash, ann.personId, null);
    await expect(openSnapshot(ann, id)).rejects.toEqual(forbidden);
    await expect(listSnapshots(ann, dash)).rejects.toEqual(forbidden);
    // Someone of another workspace never reaches it, whatever id they send.
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(openSnapshot(other.actor(zoe), id)).rejects.toEqual(forbidden);
    expect(w.id).not.toBe(other.id);
  });

  it("is deleted by the dashboard's owner only, with its numbers, words and Versions", async () => {
    const { owner, ben, dash } = await setup();
    const id = await takeSnapshot(owner, dash, october);
    await editSnapshotWords(owner, id, { intro: "Words." });
    await expect(deleteSnapshot(ben, id)).rejects.toEqual(forbidden);
    await deleteSnapshot(owner, id);
    expect(await listSnapshots(owner, dash)).toEqual([]);
    await expect(openSnapshot(owner, id)).rejects.toEqual(forbidden);
    const { data } = await db().from("dashboard_snapshots").select("frozen, words, deleted_by").eq("id", id).single();
    expect(data).toEqual({ frozen: null, words: {}, deleted_by: owner.personId });
    expect((await db().from("versions").select("id").eq("object_type", "snapshot").eq("object_id", id)).data).toEqual([]);
  });
});
