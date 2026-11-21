// Snapshots and View Links over HTTP (ticket #435; GLOSSARY: Snapshot, View Link, Access Key): the shapes, the scopes, who
// gets 404, the words of a refusal, and that a View Link's secret is in the one answer that makes it. The View Link
// scope is for programs only: no assistant, no Guest, not through the remote MCP Server.
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkKeyRequest, createAccessKey } from "@ziffr/core/access-keys";
import type { Scope } from "@ziffr/core/actor";
import { createDashboard, placeWidget } from "@ziffr/core/dashboards";
import { share } from "@ziffr/core/sharing";
import { showSnapshot, takeSnapshot } from "@ziffr/core/snapshots";
import { openViewLink } from "@ziffr/core/view-links";
import { VIEW_LINKS_PER_DAY } from "@ziffr/core/api-view-links";
import { auditRowsOf, insertAssistantKey, workspace } from "@ziffr/core/test/db-fixtures";
import { matchRoute } from "@/lib/api-in-process";
import { GET as listSnapshots, POST as take } from "./[id]/snapshots/route";
import { GET as readSnapshot } from "../snapshots/[id]/route";
import { GET as listLinks, POST as makeLink } from "./[id]/view-links/route";
import { DELETE as revokeLink } from "../view-links/[id]/route";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
type W = Awaited<ReturnType<typeof workspace>>;

async function keyFor(w: W, person: string, role: "owner" | "admin" | "member", scopes: Scope[]) {
  const { id, secret } = await createAccessKey(w.actor(person, role), { name: "Program", scopes, expiresOn: inDays(30) });
  const req = (method: string, path: string, body?: unknown) => new Request(`http://ziffr.test/api/v1${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { authorization: `Bearer ${secret}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });
  const params = (n: number | string) => ({ params: Promise.resolve({ id: String(n) }) });
  return { id, req, params };
}

/** An owner, an Editor and a Viewer of one dashboard that draws one Metric with a value for October 2026. */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
  const rev = await w.metric(sara, { name: "Revenue" });
  await w.value(rev.id, "2026-10-01", 100);
  const dash = await createDashboard(w.actor(sara), "Monthly overview");
  await placeWidget(w.actor(sara), dash, { type: "spec", template: "story", metricIds: [rev.id], settings: { headline: "Revenue held up", panels: [] } });
  await share(w.actor(sara), "dashboard", dash, ben, "editor");
  await share(w.actor(sara), "dashboard", dash, ann, "viewer");
  return { w, sara, ben, ann, owner: w.actor(sara), rev, dash };
}
const october = { kind: "month", start: "2026-10-01" };

describe("Snapshots over HTTP", () => {
  it("takes, lists and reads a Snapshot as the creator, a draft until a person shows it", async () => {
    const { w, sara, ann, owner, rev, dash } = await setup();
    const k = await keyFor(w, sara, "owner", ["dashboards:read", "dashboards:write"]);
    const made = await take(k.req("POST", `/dashboards/${dash}/snapshots`, october), k.params(dash));
    expect(made.status).toBe(201);
    const snap = await made.json();
    expect(snap).toMatchObject({ dashboard: dash, kind: "month", start: "2026-10-01", end: "2026-10-31", automatic: false, shown: false });
    expect(Object.keys(snap)).not.toContain("takenBy");
    expect(snap.url).toBe(`http://ziffr.test/dashboards/${dash}/snapshots/${snap.id}`);
    // Again, a period still running, a kind that is not one, and a field that is not known.
    const again = await take(k.req("POST", `/dashboards/${dash}/snapshots`, october), k.params(dash));
    expect(again.status).toBe(422);
    expect((await again.json()).error.message).toMatch(/already/);
    expect((await take(k.req("POST", `/dashboards/${dash}/snapshots`, { kind: "month", start: "2026-12-01" }), k.params(dash))).status).toBe(422);
    expect((await take(k.req("POST", `/dashboards/${dash}/snapshots`, { kind: "day", start: "2026-10-01" }), k.params(dash))).status).toBe(400);
    expect((await take(k.req("POST", `/dashboards/${dash}/snapshots`, { ...october, extra: 1 }), k.params(dash))).status).toBe(400);
    expect((await take(k.req("POST", "/dashboards/abc/snapshots", october), k.params("abc"))).status).toBe(400);
    const list = await (await listSnapshots(k.req("GET", `/dashboards/${dash}/snapshots`), k.params(dash))).json();
    expect(list.items.map((s: { id: number }) => s.id)).toEqual([snap.id]);
    const read = await (await readSnapshot(k.req("GET", `/snapshots/${snap.id}`), k.params(snap.id))).json();
    expect(read).toMatchObject({ id: snap.id, name: "Monthly overview", hiddenWidgets: 0, metrics: [{ slug: rev.slug, name: "Revenue", values: [{ period: "2026-10-01", value: 100 }] }], corrections: [] });
    expect(read.widgets).toEqual([expect.objectContaining({ view: "story", metrics: [rev.slug], words: expect.objectContaining({ headline: "Revenue held up" }) })]);
    // A Viewer's key does not see the draft, nor its list entry; once shown, both.
    const viewer = await keyFor(w, ann, "member", ["dashboards:read", "dashboards:write"]);
    expect((await (await listSnapshots(viewer.req("GET", `/dashboards/${dash}/snapshots`), viewer.params(dash))).json()).items).toEqual([]);
    expect((await readSnapshot(viewer.req("GET", `/snapshots/${snap.id}`), viewer.params(snap.id))).status).toBe(404);
    await showSnapshot(owner, snap.id);
    expect((await (await listSnapshots(viewer.req("GET", `/dashboards/${dash}/snapshots`), viewer.params(dash))).json()).items).toHaveLength(1);
    expect((await readSnapshot(viewer.req("GET", `/snapshots/${snap.id}`), viewer.params(snap.id))).status).toBe(200);
    // A Viewer takes none (404, as for anything she may not change).
    expect((await take(viewer.req("POST", `/dashboards/${dash}/snapshots`, { kind: "month", start: "2026-09-01" }), viewer.params(dash))).status).toBe(404);
    // The Audit Log names the key that took it, and nothing about it says more.
    const events = await auditRowsOf(w.id, "snapshot.taken");
    expect(events).toEqual([expect.objectContaining({ access_key_id: k.id, details: expect.objectContaining({ via: "api" }) })]);
  });

  it("answers 403 without the scope and 404 for a dashboard or Snapshot of another workspace", async () => {
    const { w, sara, owner, dash } = await setup();
    const reader = await keyFor(w, sara, "owner", ["dashboards:read"]);
    expect((await take(reader.req("POST", `/dashboards/${dash}/snapshots`, october), reader.params(dash))).status).toBe(403);
    const writer = await keyFor(w, sara, "owner", ["dashboards:write"]);
    expect((await listSnapshots(writer.req("GET", `/dashboards/${dash}/snapshots`), writer.params(dash))).status).toBe(403);
    const id = await takeSnapshot(owner, dash, october);
    const other = await workspace("Other"); cleanups.push(other.cleanup);
    const zoe = await other.person("owner");
    const foreign = await keyFor(other, zoe, "owner", ["dashboards:read", "dashboards:write"]);
    expect((await readSnapshot(foreign.req("GET", `/snapshots/${id}`), foreign.params(id))).status).toBe(404);
    expect((await listSnapshots(foreign.req("GET", `/dashboards/${dash}/snapshots`), foreign.params(dash))).status).toBe(404);
    expect((await take(foreign.req("POST", `/dashboards/${dash}/snapshots`, { kind: "month", start: "2026-09-01" }), foreign.params(dash))).status).toBe(404);
  });

  it("is reachable from the remote MCP Server's in-process routes, for Snapshots only", () => {
    expect(matchRoute("dashboards/5/snapshots")).not.toBeNull();
    expect(matchRoute("snapshots/5")).not.toBeNull();
    expect(matchRoute("dashboards/5/view-links")).toBeNull();
    expect(matchRoute("view-links/5")).toBeNull();
  });
});

describe("View Links over HTTP", () => {
  it("makes one with its secret shown once, lists none of it, and revokes it", async () => {
    const { w, sara, ben, owner, dash } = await setup();
    const k = await keyFor(w, sara, "owner", ["view-links:write"]);
    const res = await makeLink(k.req("POST", `/dashboards/${dash}/view-links`, { label: "Board", expires: inDays(7), frozen: true }), k.params(dash));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const made = await res.json();
    expect(made).toMatchObject({ dashboard: dash, label: "Board", expires: inDays(7), revoked: false, frozen: true, snapshot: null, url: `http://ziffr.test/v/${made.token}` });
    expect(made.token.length).toBeGreaterThanOrEqual(32);
    expect(await openViewLink(made.token)).not.toBeNull();
    // The list never carries the token or the address.
    const listed = await listLinks(k.req("GET", `/dashboards/${dash}/view-links`), k.params(dash));
    const text = await listed.text();
    expect(text).not.toContain(made.token);
    expect(JSON.parse(text).items).toEqual([{ id: made.id, dashboard: dash, label: "Board", expires: inDays(7), revoked: false, created: expect.any(String), frozen: true, snapshot: null }]);
    // Nor does the Audit Log, which names the key; nor the Access Log.
    const events = await auditRowsOf(w.id, "view_link.");
    expect(JSON.stringify(events)).not.toContain(made.token);
    expect(events).toEqual([expect.objectContaining({ kind: "view_link.created", access_key_id: k.id })]);
    // An Editor of the dashboard is not its owner: 404 for her list, her link and her revoke.
    const editor = await keyFor(w, ben, "member", ["view-links:write"]);
    expect((await listLinks(editor.req("GET", `/dashboards/${dash}/view-links`), editor.params(dash))).status).toBe(404);
    expect((await makeLink(editor.req("POST", `/dashboards/${dash}/view-links`, { expires: inDays(7) }), editor.params(dash))).status).toBe(404);
    expect((await revokeLink(editor.req("DELETE", `/view-links/${made.id}`), editor.params(made.id))).status).toBe(404);
    expect(await openViewLink(made.token)).not.toBeNull();
    // The owner revokes: it stops opening.
    const gone = await revokeLink(k.req("DELETE", `/view-links/${made.id}`), k.params(made.id));
    expect(await gone.json()).toEqual({ revoked: made.id });
    expect(await openViewLink(made.token)).toBeNull();
    expect((await (await listLinks(k.req("GET", `/dashboards/${dash}/view-links`), k.params(dash))).json()).items[0].revoked).toBe(true);
    expect(owner).toBeTruthy();
  });

  it("needs its own scope, which no other scope stands in for", async () => {
    const { w, sara, dash } = await setup();
    const k = await keyFor(w, sara, "owner", ["metrics:read", "dashboards:read", "dashboards:write", "values:approve"]);
    expect((await makeLink(k.req("POST", `/dashboards/${dash}/view-links`, { expires: inDays(7) }), k.params(dash))).status).toBe(403);
    expect((await listLinks(k.req("GET", `/dashboards/${dash}/view-links`), k.params(dash))).status).toBe(403);
    expect((await revokeLink(k.req("DELETE", "/view-links/1"), k.params(1))).status).toBe(403);
  });

  it("is never given to an assistant or a Guest, and the database backs the core up", async () => {
    const { w, sara } = await setup();
    const guest = await w.person("guest");
    await expect(createAccessKey(w.actor(guest, "guest"), { name: "G", scopes: ["view-links:write"], expiresOn: inDays(30) })).rejects.toThrow(/cannot share/);
    expect(() => checkKeyRequest(w.actor(sara), ["metrics:read", "view-links:write"], inDays(30), { assistant: true })).toThrow(/cannot be allowed/);
    expect(checkKeyRequest(w.actor(sara), ["view-links:write"], inDays(30)).scopes).toEqual(["view-links:write"]);
    expect(await insertAssistantKey(w.id, sara, ["view-links:write"])).toBe("23514");
  });

  it("refuses an end date outside 90 days, a Snapshot not shown yet, and takes one that is shown", async () => {
    const { w, sara, owner, dash } = await setup();
    const k = await keyFor(w, sara, "owner", ["view-links:write"]);
    for (const expires of [inDays(-1), inDays(100)]) {
      const r = await makeLink(k.req("POST", `/dashboards/${dash}/view-links`, { expires }), k.params(dash));
      expect(r.status).toBe(422);
      expect((await r.json()).error.message).toMatch(/end date within 90 days/);
    }
    expect((await makeLink(k.req("POST", `/dashboards/${dash}/view-links`, { expires: "soon" }), k.params(dash))).status).toBe(400);
    expect((await makeLink(k.req("POST", `/dashboards/${dash}/view-links`, { expires: inDays(3), extra: true }), k.params(dash))).status).toBe(400);
    const snapshot = await takeSnapshot(owner, dash, october);
    const draft = await makeLink(k.req("POST", `/dashboards/${dash}/view-links`, { expires: inDays(3), snapshot }), k.params(dash));
    expect(draft.status).toBe(422);
    expect((await draft.json()).error.message).toMatch(/Show the Snapshot/);
    await showSnapshot(owner, snapshot);
    const shown = await makeLink(k.req("POST", `/dashboards/${dash}/view-links`, { expires: inDays(3), snapshot }), k.params(dash));
    expect(shown.status).toBe(201);
    expect(await shown.json()).toMatchObject({ snapshot, frozen: true });
    // Another dashboard's Snapshot id is no Snapshot of this one.
    const other = await createDashboard(owner, "Other");
    const wrong = await makeLink(k.req("POST", `/dashboards/${other}/view-links`, { expires: inDays(3), snapshot }), k.params(other));
    expect(wrong.status).toBe(422);
  });

  it("stops a key at 20 View Links in 24 hours with 429", async () => {
    const { w, sara, dash } = await setup();
    const k = await keyFor(w, sara, "owner", ["view-links:write"]);
    for (let i = 0; i < VIEW_LINKS_PER_DAY; i++) expect((await makeLink(k.req("POST", `/dashboards/${dash}/view-links`, { expires: inDays(3) }), k.params(dash))).status).toBe(201);
    const r = await makeLink(k.req("POST", `/dashboards/${dash}/view-links`, { expires: inDays(3) }), k.params(dash));
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBeTruthy();
  });
});
