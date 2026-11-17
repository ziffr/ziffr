// Dashboards, widgets and View Links through the core, against the real database (ticket #13).
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { canvasAdd, createDashboard, deleteSavedWidget, placeWidget, removeWidget, saveLayout, saveToPool, setDashboardTheme, updateWidget } from "./dashboards";
import { share } from "./sharing";
import { createViewLink, openViewLink, revokeViewLink } from "./view-links";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const widgetsOf = async (dashboardId: number) => (await db().from("widgets").select("*").eq("dashboard_id", dashboardId).order("id")).data ?? [];
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe("dashboards and widgets", () => {
  it("creates a dashboard in the actor's workspace, and refuses Guests", async () => {
    const w = await ws(); const sara = await w.person("owner"); const gus = await w.person("guest");
    const id = await createDashboard(w.actor(sara), "Board");
    expect((await db().from("dashboards").select("workspace_id, owner_id").eq("id", id).single()).data).toEqual({ workspace_id: w.id, owner_id: sara });
    await expect(createDashboard(w.actor(gus, "guest"), "Mine")).rejects.toEqual(forbidden);
  });
  it("lets the owner and Editors place widgets, but only with Metrics they see", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); const secret = await w.metric(ben);
    const d = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), d, { type: "metric", id: m.id });
    await expect(placeWidget(w.actor(sara), d, { type: "metric", id: secret.id })).rejects.toEqual(forbidden);
    await expect(placeWidget(w.actor(ben, "member"), d, { type: "metric", id: secret.id })).rejects.toEqual(forbidden);
    await share(w.actor(sara), "dashboard", d, ben, "editor");
    await placeWidget(w.actor(ben, "member"), d, { type: "metric", id: secret.id });
    expect((await widgetsOf(d)).length).toBe(2);
  });
  it("refuses Sample Data's negative Metric ids, also next to a real one (spec 0011)", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara);
    const d = await createDashboard(w.actor(sara), "Board");
    await expect(placeWidget(w.actor(sara), d, { type: "spec", template: "correlation", metricIds: [m.id, -2] })).rejects.toEqual(forbidden);
    await expect(placeWidget(w.actor(sara), d, { type: "spec", template: "line", metricIds: [-1] })).rejects.toEqual(forbidden);
    await expect(placeWidget(w.actor(sara), d, { type: "metric", id: -1 })).rejects.toEqual(forbidden);
    expect(await widgetsOf(d)).toEqual([]);
  });
  it("refuses dashboards and widgets of another workspace", async () => {
    const a = await ws("A"); const b = await ws("B"); const ann = await a.person("owner"); const zoe = await b.person("owner");
    const mb = await b.metric(zoe); const db_ = await createDashboard(b.actor(zoe), "Theirs");
    await placeWidget(b.actor(zoe), db_, { type: "metric", id: mb.id });
    const [theirWidget] = await widgetsOf(db_);
    const mine = await createDashboard(a.actor(ann), "Mine");
    await expect(placeWidget(a.actor(ann), db_, { type: "spec", template: "number", metricIds: [] })).rejects.toEqual(forbidden);
    await expect(placeWidget(a.actor(ann), mine, { type: "widget", id: theirWidget.id })).rejects.toEqual(forbidden);
    await expect(updateWidget(a.actor(ann), theirWidget.id, { title: "mine now" })).rejects.toEqual(forbidden);
    await expect(removeWidget(a.actor(ann), theirWidget.id)).rejects.toEqual(forbidden);
    const { data: theme } = await db().from("themes").insert({ owner_id: zoe, name: "T", tokens: {}, slides: {}, workspace_id: b.id }).select("id").single();
    await expect(setDashboardTheme(a.actor(ann), mine, theme!.id)).rejects.toEqual(forbidden);
  });
  it("keeps layouts in range and widget settings within a size", async () => {
    const w = await ws(); const sara = await w.person("owner"); const m = await w.metric(sara);
    const d = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), d, { type: "metric", id: m.id });
    const [wid] = await widgetsOf(d);
    await saveLayout(w.actor(sara), d, [{ i: String(wid.id), x: -5, y: 3.6, w: 99, h: 0 }]);
    expect(await widgetsOf(d)).toMatchObject([{ x: 0, y: 4, w: 12, h: 1 }]);
    await expect(updateWidget(w.actor(sara), wid.id, { settings: { note: "x".repeat(300_000) } as never })).rejects.toThrow(/too large/);
  });
  it("keeps a widget's Display Period, and refuses one that is not (spec 0018)", async () => {
    const w = await ws(); const sara = await w.person("owner"); const m = await w.metric(sara);
    const d = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), d, { type: "spec", template: "bars", metricIds: [m.id], settings: { window: 8, display: "quarter" } });
    const [wid] = await widgetsOf(d);
    expect(wid.settings).toMatchObject({ window: 8, display: "quarter" });
    await updateWidget(w.actor(sara), wid.id, { settings: { ...wid.settings, display: "year" } });
    expect((await widgetsOf(d))[0].settings.display).toBe("year");
    // Another view that draws a series keeps it; a gauge does not.
    await updateWidget(w.actor(sara), wid.id, { template: "line" });
    expect((await widgetsOf(d))[0].settings.display).toBe("year");
    await updateWidget(w.actor(sara), wid.id, { template: "gauge" });
    expect((await widgetsOf(d))[0].settings.display).toBeUndefined();
    await updateWidget(w.actor(sara), wid.id, { template: "bars", settings: { display: "year" } });
    await expect(updateWidget(w.actor(sara), wid.id, { settings: { display: "fortnight" } as never })).rejects.toThrow(/shown by/);
    // Saved to the Pool and placed again, it keeps the setting.
    await saveToPool(w.actor(sara), { type: "widget", id: wid.id }, "Quarterly");
    const { data: saved } = await db().from("widgets").select("settings").eq("workspace_id", w.id).eq("saved", true).single();
    expect(saved!.settings.display).toBe("year");
  });
  it("keeps saved widgets their owner's", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    const m = await w.metric(sara);
    await saveToPool(w.actor(sara), { type: "metric", id: m.id }, "Mine");
    const { data: saved } = await db().from("widgets").select("id").eq("workspace_id", w.id).eq("saved", true).single();
    await expect(updateWidget(w.actor(ben, "member"), saved!.id, { title: "taken" })).rejects.toEqual(forbidden);
    await deleteSavedWidget(w.actor(ben, "member"), saved!.id);
    expect((await db().from("widgets").select("id").eq("id", saved!.id)).data).toHaveLength(1);
    await expect(saveToPool(w.actor(gus, "guest"), { type: "spec", template: "number", metricIds: [] }, "x")).rejects.toEqual(forbidden);
  });
  it("puts only Metrics the actor sees on their Analysis Canvas", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const secret = await w.metric(ben);
    await expect(canvasAdd(w.actor(sara), [secret.id])).rejects.toEqual(forbidden);
  });
});

describe("View Links", () => {
  async function linked() {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const shown = await w.metric(sara, { name: "Revenue" }); const other = await w.metric(sara, { name: "Payroll" });
    await w.contact({ email: "private@contact.test", phone: "+49 1 2345" });
    const d = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), d, { type: "metric", id: shown.id });
    return { w, sara, ben, shown, other, d };
  }
  it("lets only the owner make one, not Guests, and only within 90 days", async () => {
    const { w, sara, ben, d } = await linked();
    await expect(createViewLink(w.actor(ben, "member"), "dashboard", d, { label: "", expires: inDays(5), frozen: false })).rejects.toEqual(forbidden);
    await expect(createViewLink(w.actor(sara), "dashboard", d, { label: "", expires: inDays(200), frozen: false })).rejects.toThrow(/within 90 days/);
    await db().from("memberships").update({ role: "guest" }).eq("workspace_id", w.id).eq("user_id", sara);
    await expect(createViewLink(w.actor(sara, "guest"), "dashboard", d, { label: "", expires: inDays(5), frozen: false })).rejects.toEqual(forbidden);
  });
  it("shows only what was agreed to and no contact details; a Metric added later stays out", async () => {
    const { w, sara, other, shown, d } = await linked();
    const token = await createViewLink(w.actor(sara), "dashboard", d, { label: "Board", expires: inDays(5), frozen: false });
    await placeWidget(w.actor(sara), d, { type: "metric", id: other.id });
    const view = await openViewLink(token);
    expect(view!.data.metrics.map((m) => m.id)).toEqual([shown.id]);
    expect(JSON.stringify(view)).not.toMatch(/private@contact|2345/);
    expect(view!.data.people.every((p) => p.email === "" && p.slack_handle === "")).toBe(true);
  });
  it("stops working once revoked, and only its owner revokes it", async () => {
    const { w, sara, d } = await linked();
    const token = await createViewLink(w.actor(sara), "dashboard", d, { label: "", expires: inDays(5), frozen: true });
    const { data: link } = await db().from("view_links").select("id").eq("token", token).single();
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(revokeViewLink(other.actor(zoe), link!.id)).rejects.toEqual(forbidden);
    expect(await openViewLink(token)).not.toBeNull();
    await revokeViewLink(w.actor(sara), link!.id);
    expect(await openViewLink(token)).toBeNull();
    expect(await openViewLink("short")).toBeNull();
  });
});

describe("after the review of #13", () => {
  it("copies no widget from a dashboard the actor cannot see", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const secret = await w.metric(sara);
    const d = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), d, { type: "metric", id: secret.id });
    const [wid] = await widgetsOf(d);
    const mine = await createDashboard(w.actor(ben, "member"), "Mine");
    await expect(placeWidget(w.actor(ben, "member"), mine, { type: "widget", id: wid.id })).rejects.toEqual(forbidden);
  });
  it("sends a View Link only the widgets and fields it needs", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const shown = await w.metric(sara, { name: "Revenue" }); const later = await w.metric(sara, { name: "Payroll" });
    const d = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), d, { type: "metric", id: shown.id });
    const token = await createViewLink(w.actor(sara), "dashboard", d, { label: "", expires: inDays(5), frozen: false });
    await placeWidget(w.actor(sara), d, { type: "spec", template: "number", metricIds: [later.id], title: "Payroll by person" });
    const view = await openViewLink(token);
    expect(view!.widgets!.map((x) => x.metric_ids)).toEqual([[shown.id]]);
    expect(JSON.stringify(view!.widgets)).not.toMatch(/owner_id|workspace_id|Payroll/);
    // Nor a widget added later without any Metric: it was not there when the link was made.
    await placeWidget(w.actor(sara), d, { type: "spec", template: "story", metricIds: [], title: "Layoffs next month" });
    expect(JSON.stringify(await openViewLink(token))).not.toMatch(/Layoffs/);
  });
  it("makes no View Links in the demo, whoever asks", async () => {
    await expect(createViewLink({ personId: "sara", workspaceId: "d3e00000-0000-4000-8000-000000000001", role: "owner" }, "dashboard", 1, { label: "", expires: inDays(5), frozen: false })).rejects.toEqual(forbidden);
  });
});
