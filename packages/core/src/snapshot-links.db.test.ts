// A deck made from a Snapshot, and View Links that show one (spec 0013, ticket #178), against the database.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createDashboard, placeWidget, saveDashboardText } from "./dashboards";
import { share } from "./sharing";
import { deleteSnapshot, editSnapshotWords, openSnapshot, showSnapshot, snapshotDeckSeed, takeSnapshot } from "./snapshots";
import { createViewLink, listViewLinks, openViewLink } from "./view-links";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** A dashboard with a Finding about a monthly Metric, its owner, an Editor, a Viewer and a Guest Viewer, and a draft
 * Snapshot of October 2026. */
async function setup() {
  const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member"); const gus = await w.person("guest");
  const rev = await w.metric(sara, { name: "Revenue" });
  for (const [p, v] of [["2026-09-01", 90], ["2026-10-01", 100], ["2026-11-01", 110]] as const) await w.value(rev.id, p, v);
  const dash = await createDashboard(w.actor(sara), "Monthly overview");
  await saveDashboardText(w.actor(sara), dash, { intro: "How the month went." });
  await placeWidget(w.actor(sara), dash, { type: "spec", template: "story", metricIds: [rev.id], settings: { headline: "Revenue held up", panels: [] } });
  await share(w.actor(sara), "dashboard", dash, ben, "editor");
  await share(w.actor(sara), "dashboard", dash, ann, "viewer");
  await share(w.actor(sara), "dashboard", dash, gus, "viewer");
  const owner = w.actor(sara);
  const snap = await takeSnapshot(owner, dash, { kind: "month", start: "2026-10-01" });
  return { w, owner, ben: w.actor(ben, "member"), ann: w.actor(ann, "member"), gus: w.actor(gus, "guest"), rev, dash, snap };
}

describe("a deck from a Snapshot", () => {
  it("starts with its words and draws only the values of its period, for whoever may open the Snapshot", async () => {
    const { owner, ann, rev, dash, snap } = await setup();
    const [finding] = (await openSnapshot(owner, snap)).widgets;
    await editSnapshotWords(owner, snap, { intro: "October in short.", widgets: { [finding.id]: { headline: "Revenue grew" } } });
    // A draft is the owner's and Editors' only.
    await expect(snapshotDeckSeed(ann, snap)).rejects.toEqual(forbidden);
    await showSnapshot(owner, snap);
    const seed = await snapshotDeckSeed(ann, snap);
    expect(seed.name).toBe("Monthly overview, October 2026");
    expect(seed.intro).toBe("October in short.");
    expect(seed.widgets).toHaveLength(1);
    expect(seed.widgets[0]).toMatchObject({ template: "story", metric_ids: [rev.id] });
    expect(seed.widgets[0].settings).toMatchObject({ headline: "Revenue grew", asOf: "2026-10-31" });
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(snapshotDeckSeed(other.actor(zoe), snap)).rejects.toEqual(forbidden);
    expect(dash).toBeGreaterThan(0);
  });
});

describe("a View Link to a Snapshot", () => {
  it("is made by the dashboard's owner only, of a shown Snapshot of that dashboard, not by Editors or Guests", async () => {
    const { w, owner, ben, gus, dash, snap } = await setup();
    const input = { label: "Board", expires: inDays(30), frozen: false, snapshotId: snap };
    await expect(createViewLink(owner, "dashboard", dash, input)).rejects.toThrow(/Show the Snapshot/);
    await showSnapshot(owner, snap);
    await expect(createViewLink(ben, "dashboard", dash, input)).rejects.toEqual(forbidden);
    await expect(createViewLink(gus, "dashboard", dash, input)).rejects.toEqual(forbidden);
    const otherDash = await createDashboard(owner, "Other");
    await expect(createViewLink(owner, "dashboard", otherDash, input)).rejects.toThrow(/Show the Snapshot/);
    await expect(createViewLink(owner, "dashboard", dash, { ...input, expires: inDays(200) })).rejects.toThrow(/within 90 days/);
    expect(await createViewLink(owner, "dashboard", dash, input)).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    const [link] = await listViewLinks(owner, "dashboard", dash);
    expect(link).toMatchObject({ label: "Board", snapshotLabel: "October 2026", revoked: false });
    const { data } = await db().from("audit_events").select("details").eq("workspace_id", w.id).eq("kind", "view_link.created").single();
    expect(data?.details).toMatchObject({ snapshot_id: snap, period: "October 2026", frozen: true });
  });

  it("shows what the Snapshot kept with the words of when the link was made, and ends when it is deleted", async () => {
    const { owner, ben, rev, dash, snap } = await setup();
    await showSnapshot(owner, snap);
    const token = await createViewLink(owner, "dashboard", dash, { label: "", expires: inDays(30), frozen: false, snapshotId: snap });
    await db().from("observations").update({ value: 999 }).eq("metric_id", rev.id).eq("period_start", "2026-10-01");
    // An Editor's later words stay in Ziffr: what someone outside reads under the owner's link does not change.
    await editSnapshotWords(ben, snap, { intro: "Revenue up 40 %." });
    const view = await openViewLink(token);
    expect(view).toMatchObject({ type: "dashboard", id: dash, name: "Monthly overview", intro: "How the month went.", snapshot: { label: "October 2026" } });
    expect(view!.data.series[rev.slug]).toEqual([{ period: "2026-09-01", value: 90 }, { period: "2026-10-01", value: 100 }]);
    // Nothing to act on and no contact details go out.
    expect(view!.data.openActions).toEqual({});
    expect(view!.data.people.every((p) => p.email === "" && p.phone === null)).toBe(true);
    await deleteSnapshot(owner, snap);
    expect(await openViewLink(token)).toBeNull();
    expect((await listViewLinks(owner, "dashboard", dash))[0].revoked).toBe(true);
  });

  it("shows, like the deck made from it, only what its owner may see now (decided on #193)", async () => {
    const { w, owner, ben, dash } = await setup();
    // Ben's Cost, shared with Sara, on Sara's dashboard: she sees it when she takes, shows and links the Snapshot.
    const cost = await w.metric(ben.personId, { name: "Cost" });
    await w.value(cost.id, "2026-10-01", 40);
    await share(ben, "metric", cost.id, owner.personId, "viewer");
    await placeWidget(ben, dash, { type: "metric", id: cost.id });
    const id = await takeSnapshot(owner, dash, { kind: "month", start: "2026-09-01" });
    await showSnapshot(owner, id);
    const token = await createViewLink(owner, "dashboard", dash, { label: "", expires: inDays(30), frozen: false, snapshotId: id });
    expect((await openViewLink(token))!.widgets).toHaveLength(2);
    expect((await snapshotDeckSeed(owner, id)).widgets).toHaveLength(2);
    // Ben stops sharing Cost with Sara: it goes from her link and from a deck she makes, as from the live dashboard.
    await share(ben, "metric", cost.id, owner.personId, null);
    const view = (await openViewLink(token))!;
    expect([view.widgets!.length, view.data.metrics.some((m) => m.id === cost.id), view.data.series[cost.slug]]).toEqual([1, false, undefined]);
    expect((await snapshotDeckSeed(owner, id)).widgets.map((x) => x.metric_ids)).not.toContainEqual([cost.id]);
    // Ben, who owns Cost, still gets it in his deck.
    expect((await snapshotDeckSeed(ben, id)).widgets).toHaveLength(2);
  });

  it("cannot be stored with frozen numbers of its own besides the Snapshot", async () => {
    const { w, owner, dash, snap } = await setup();
    const { error } = await db().from("view_links").insert({ token: "x".repeat(32), object_type: "dashboard", object_id: dash, created_by: owner.personId, expires_at: inDays(5), frozen: { name: "x" }, snapshot_id: snap, workspace_id: w.id });
    expect(error).not.toBeNull();
  });
});
