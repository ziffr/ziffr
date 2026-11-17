// Dashboards built by programs, against the real database (spec 0014; spec 0013): the scopes, the creator's role and
// rights, what a key may see and send, Versions that name the key, and the daily limits.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, type KeyActor, type Scope } from "./actor";
import { actorForKey, createAccessKey } from "./access-keys";
import {
  addFindingWithKey, addWidgetWithKey, admitBuild, CHANGES_PER_DAY, createDashboardFromTemplateWithKey, createDashboardWithKey, DASHBOARDS_PER_DAY,
  getDashboardWithKey, listDashboardsWithKey, listTemplatesWithKey, removeWidgetWithKey, Unusable, updateDashboardWithKey, updateFindingWithKey, updateWidgetWithKey,
} from "./api-dashboards";
import { db } from "./db";
import { createDashboard, placeWidget } from "./dashboards";
import { share } from "./sharing";
import { DEMO_WORKSPACE_ID } from "./team";
import { logCalls, workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const forbidden = expect.any(Forbidden);
const unusable = expect.any(Unusable);

async function keyFor(w: Awaited<ReturnType<typeof ws>>, person: string, role: "owner" | "admin" | "member" | "guest" = "member", scopes: Scope[] = ["dashboards:read", "dashboards:write"]) {
  const { id, secret } = await createAccessKey(w.actor(person, role), { name: "Assistant", scopes, expiresOn: inDays(30) });
  return { id, key: (await actorForKey(secret)) as KeyActor };
}

describe("scopes and roles", () => {
  it("needs dashboards:read to read and dashboards:write to build", async () => {
    const w = await ws(); const ben = await w.person("member");
    const { key: reader } = await keyFor(w, ben, "member", ["dashboards:read"]);
    const { key: other } = await keyFor(w, ben, "member", ["metrics:read"]);
    await expect(listDashboardsWithKey(other)).rejects.toEqual(forbidden);
    await expect(listTemplatesWithKey(other)).rejects.toEqual(forbidden);
    await expect(createDashboardWithKey(reader, { name: "Board" })).rejects.toEqual(forbidden);
    expect((await listDashboardsWithKey(reader)).items).toEqual([]);
  });
  it("refuses dashboards:write to a Guest's key, and stops building when the creator becomes a Guest", async () => {
    const w = await ws(); const gus = await w.person("guest"); const ben = await w.person("member");
    await expect(createAccessKey(w.actor(gus, "guest"), { name: "x", scopes: ["dashboards:write"], expiresOn: inDays(5) })).rejects.toEqual(forbidden);
    const { id } = await keyFor(w, ben);
    await w.setRole(ben, "guest");
    const { data: k } = await db().from("access_keys").select("prefix").eq("id", id).single();
    expect(k).toBeTruthy();
    const key: KeyActor = { personId: ben, workspaceId: w.id, role: "guest", key: { id: String(id), scopes: ["dashboards:read", "dashboards:write"] } };
    await expect(createDashboardWithKey(key, { name: "Board" })).rejects.toEqual(forbidden);
    // Still an Editor of a shared dashboard, as a Guest may be, but the key no longer changes it.
    const sara = await w.person("owner"); const m = await w.metric(sara);
    const shared = await createDashboard(w.actor(sara), "Shared");
    await share(w.actor(sara), "dashboard", shared, ben, "editor");
    await expect(addWidgetWithKey(key, shared, { view: "number", metrics: [m.slug] })).rejects.toEqual(forbidden);
  });
  it("refuses the demo", async () => {
    const demo: KeyActor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner", key: { id: "0", scopes: ["dashboards:write"] } };
    await expect(createDashboardWithKey(demo, { name: "x" })).rejects.toEqual(forbidden);
  });
});

describe("building a dashboard", () => {
  it("creates one owned by the creator, from a template, with Versions and an audit entry naming the key", async () => {
    const w = await ws(); const ben = await w.person("member"); const rev = await w.metric(ben); const orders = await w.metric(ben);
    const { id: keyId, key } = await keyFor(w, ben);
    const d = await createDashboardFromTemplateWithKey(key, { template: "side-by-side", name: "Money and orders", fills: [[rev.slug], [orders.slug]] });
    expect(d).toMatchObject({ name: "Money and orders", role: "owner", path: `/dashboards/${d.id}` });
    expect(d.widgets).toHaveLength(5);
    expect(d.widgets.at(-1)!.metrics).toEqual([rev.slug, orders.slug]);
    const { data: versions } = await db().from("versions").select("message, author_id").eq("object_type", "dashboard").eq("object_id", d.id);
    expect(versions).toEqual([{ message: "Made from the template “Two metrics side by side”; changed through the API (key “Assistant”)", author_id: ben }]);
    const { data: audit } = await db().from("audit_events").select("kind, access_key_id").eq("workspace_id", w.id).eq("kind", "dashboard.created");
    expect(audit).toEqual([{ kind: "dashboard.created", access_key_id: keyId }]);
  });
  it("adds, changes and removes widgets in the first free place, and burst changes are one Version", async () => {
    const w = await ws(); const ben = await w.person("member"); const m = await w.metric(ben);
    const { key } = await keyFor(w, ben);
    const d = await createDashboardWithKey(key, { name: "Board" });
    const a = await addWidgetWithKey(key, d.id, { view: "number", metrics: [m.slug] });
    const b = await addWidgetWithKey(key, d.id, { view: "gauge", metrics: [m.slug], title: "Against target" });
    expect([a, b].map((x) => ({ x: x.x, y: x.y }))).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }]);
    const changed = await updateWidgetWithKey(key, d.id, a.id, { view: "line", settings: { window: 24, showTarget: true } });
    expect(changed).toMatchObject({ view: "line", metrics: [m.slug] });
    const { data: stored } = await db().from("widgets").select("settings").eq("id", a.id).single();
    expect(stored!.settings).toMatchObject({ window: 24, showTarget: true });
    await removeWidgetWithKey(key, d.id, b.id);
    expect((await getDashboardWithKey(key, d.id)).widgets.map((x) => x.id)).toEqual([a.id]);
    const { data: versions } = await db().from("versions").select("message").eq("object_type", "dashboard").eq("object_id", d.id).order("version");
    expect(versions!.map((v) => v.message)).toEqual(["Before version history", "Changed through the API (key “Assistant”)"]);
  });
  it("changes only what the creator may change, and only with Metrics they see", async () => {
    const w = await ws(); const sara = await w.person("member"); const ben = await w.person("member");
    const hers = await w.metric(sara); const his = await w.metric(ben);
    const viewed = await createDashboard(w.actor(sara, "member"), "Sara's");
    await placeWidget(w.actor(sara, "member"), viewed, { type: "metric", id: hers.id });
    await share(w.actor(sara, "member"), "dashboard", viewed, ben, "viewer");
    const hidden = await createDashboard(w.actor(sara, "member"), "Hidden");
    const { key } = await keyFor(w, ben);
    // He sees Sara's dashboard, so its Metric too, but may not change it.
    expect((await getDashboardWithKey(key, viewed)).widgets[0].metrics).toEqual([hers.slug]);
    await expect(addWidgetWithKey(key, viewed, { view: "number", metrics: [his.slug] })).rejects.toEqual(forbidden);
    await expect(getDashboardWithKey(key, hidden)).rejects.toEqual(forbidden);
    await expect(addWidgetWithKey(key, hidden, { view: "number", metrics: [his.slug] })).rejects.toEqual(forbidden);
    const mine = await createDashboardWithKey(key, { name: "Mine" });
    const other = await w.metric(sara);
    await expect(addWidgetWithKey(key, mine.id, { view: "number", metrics: [other.slug] })).rejects.toEqual(unusable);
    await expect(addWidgetWithKey(key, mine.id, { view: "number", metrics: ["no-such-metric"] })).rejects.toEqual(unusable);
  });
  it("refuses another workspace's dashboards and Free Layouts", async () => {
    const a = await ws("A"); const b = await ws("B"); const ann = await a.person("owner"); const zoe = await b.person("owner");
    const theirs = await createDashboard(b.actor(zoe), "Theirs");
    const { key } = await keyFor(a, ann, "owner");
    await expect(getDashboardWithKey(key, theirs)).rejects.toEqual(forbidden);
    const m = await a.metric(ann);
    const mine = await createDashboardWithKey(key, { name: "Mine" });
    await expect(addWidgetWithKey(key, mine.id, { view: "canvas" as never, metrics: [m.slug] })).rejects.toEqual(unusable);
    await placeWidget(a.actor(ann), mine.id, { type: "spec", template: "canvas", metricIds: [] });
    const layout = (await getDashboardWithKey(key, mine.id)).widgets.find((x) => x.view === "canvas")!;
    await expect(updateWidgetWithKey(key, mine.id, layout.id, { title: "x" })).rejects.toEqual(unusable);
    await expect(removeWidgetWithKey(key, mine.id, layout.id)).rejects.toEqual(unusable);
  });
  it("shows a widget by a Display Period, reads it back and clears it with null (spec 0018)", async () => {
    const w = await ws(); const ben = await w.person("member"); const m = await w.metric(ben);
    const { key } = await keyFor(w, ben);
    const d = await createDashboardWithKey(key, { name: "Board" });
    const a = await addWidgetWithKey(key, d.id, { view: "bars", metrics: [m.slug], settings: { window: 8, display: "quarter" } });
    expect(a).toMatchObject({ view: "bars", display: "quarter" });
    expect((await getDashboardWithKey(key, d.id)).widgets[0].display).toBe("quarter");
    // Changing another setting keeps it; null goes back to the Metric's own period.
    await updateWidgetWithKey(key, d.id, a.id, { settings: { window: 4 } });
    expect((await getDashboardWithKey(key, d.id)).widgets[0].display).toBe("quarter");
    const cleared = await updateWidgetWithKey(key, d.id, a.id, { settings: { display: null } });
    expect(cleared.display).toBeUndefined();
    const { data: stored } = await db().from("widgets").select("settings").eq("id", a.id).single();
    expect(stored!.settings.display).toBeUndefined();
  });
  it("answers widgets without their settings", async () => {
    const w = await ws(); const ben = await w.person("member"); const m = await w.metric(ben);
    const { key } = await keyFor(w, ben);
    const d = await createDashboardWithKey(key, { name: "Board" });
    await addWidgetWithKey(key, d.id, { view: "line", metrics: [m.slug] });
    const [widget] = (await getDashboardWithKey(key, d.id)).widgets;
    expect(Object.keys(widget).sort()).toEqual(["h", "id", "metrics", "title", "view", "w", "x", "y"]);
  });
});

describe("writing a dashboard up (spec 0013)", () => {
  it("writes the name, introduction and Findings with their words, Findings last in reading order", async () => {
    const w = await ws(); const ben = await w.person("member"); const churn = await w.metric(ben, { name: "Churn" });
    const { key } = await keyFor(w, ben);
    const s = await createDashboardWithKey(key, { name: "Draft", intro: "First words." });
    expect(s).toMatchObject({ path: `/dashboards/${s.id}`, intro: "First words." });
    expect("kind" in s).toBe(false);
    await updateDashboardWithKey(key, s.id, { name: "Why churn went up", intro: "A first draft." });
    // A dashboard takes widgets and Findings alike; a Finding goes below everything, full width.
    const n = await addWidgetWithKey(key, s.id, { view: "number", metrics: [churn.slug] });
    const f = await addFindingWithKey(key, s.id, { metric: churn.slug, headline: "{metric} doubled after the price change", source: "" });
    expect(f).toMatchObject({ view: "story", metrics: [churn.slug], x: 0, w: 12, words: { headline: "{metric} doubled after the price change", source: "" } });
    expect(f.y).toBeGreaterThanOrEqual(n.y + n.h);
    const g = await updateFindingWithKey(key, s.id, f.id, { kicker: "October", headline: "" });
    expect(g.words).toMatchObject({ kicker: "October", headline: "" });
    const d = await getDashboardWithKey(key, s.id);
    expect(d).toMatchObject({ name: "Why churn went up", intro: "A first draft." });
    expect(d.widgets.find((x) => x.id === n.id)?.words).toBeUndefined();
    // Only a Finding has words; a composed Finding's view is changed in Ziffr.
    await expect(updateFindingWithKey(key, s.id, n.id, { headline: "x" })).rejects.toEqual(unusable);
    await expect(updateWidgetWithKey(key, s.id, f.id, { title: "x" })).rejects.toEqual(unusable);
    await removeWidgetWithKey(key, s.id, f.id);
  });
});

describe("templates and limits", () => {
  it("lists views, the team's Widget Templates and Dashboard Templates", async () => {
    const w = await ws(); const ben = await w.person("member");
    const { key } = await keyFor(w, ben);
    const all = await listTemplatesWithKey(key);
    expect(all.some((t) => t.kind === "view" && t.id === "line")).toBe(true);
    expect(all.some((t) => t.kind === "view" && (t.id === "canvas" || t.id === "story"))).toBe(false);
    expect((await listTemplatesWithKey(key, "dashboard")).map((t) => t.id)).toEqual(["overview", "deep-dive", "side-by-side"]);
  });
  it("stops after 50 new dashboards and 500 changes a day", async () => {
    const w = await ws(); const ben = await w.person("member");
    const { id, key } = await keyFor(w, ben);
    expect(await admitBuild(key, "create")).toEqual({ ok: true });
    await logCalls(id, DASHBOARDS_PER_DAY, { method: "POST", route: "/api/v1/dashboards", status: 201 });
    expect(await admitBuild(key, "create")).toMatchObject({ ok: false });
    expect(await admitBuild(key, "change")).toEqual({ ok: true });
    await logCalls(id, CHANGES_PER_DAY - 1, { method: "PATCH", route: "/api/v1/dashboards/1/findings/2", status: 200 });
    await logCalls(id, 5, { method: "POST", route: "/api/v1/dashboards/1/widgets", status: 422 });
    expect(await admitBuild(key, "change")).toEqual({ ok: true });
    await logCalls(id, 1, { method: "DELETE", route: "/api/v1/dashboards/1/widgets/2", status: 200 });
    expect(await admitBuild(key, "change")).toMatchObject({ ok: false });
  });
});
