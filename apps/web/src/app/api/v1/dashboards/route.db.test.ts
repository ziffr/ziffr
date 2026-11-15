// The dashboard and story endpoints over HTTP (spec 0014): status codes, answer and error shapes, links, paging,
// Idempotency-Key and the daily limit. Who may change what is proven in the core's api-dashboards.db.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import type { Scope } from "@ziffr/core/actor";
import { accessLogOf, logCalls, workspace } from "@ziffr/core/test/db-fixtures";
import { GET as list, POST as create } from "./route";
import { POST as fromTemplate } from "./from-template/route";
import { GET as getOne } from "./[id]/route";
import { POST as addWidget } from "./[id]/widgets/route";
import { DELETE as removeWidget, PATCH as patchWidget } from "./[id]/widgets/[widgetId]/route";
import { POST as addFinding } from "../stories/[id]/findings/route";
import { GET as templates } from "../templates/route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function setup(scopes: Scope[] = ["dashboards:read", "dashboards:write"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member");
  const m = await w.metric(ben, { name: "Revenue" });
  const { id, secret } = await createAccessKey(w.actor(ben, "member"), { name: "Assistant", scopes, expiresOn: inDays(30) });
  const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`http://ziffr.test/api/v1${path}`, {
    method, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    headers: { authorization: `Bearer ${secret}`, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
  });
  const params = <T,>(p: T) => ({ params: Promise.resolve(p) });
  return { id, m, req, params };
}

describe("dashboards over HTTP", () => {
  it("creates a dashboard with its link, replays an Idempotency-Key, and lists it", async () => {
    const { id, req } = await setup();
    const res = await create(req("POST", "/dashboards", { name: "Monday" }, { "idempotency-key": "monday-1" }), undefined);
    expect(res.status).toBe(201);
    const d = await res.json();
    expect(d).toEqual({ id: d.id, kind: "dashboard", name: "Monday", role: "owner", url: `http://ziffr.test/dashboards/${d.id}`, intro: null, widgets: [] });
    const again = await create(req("POST", "/dashboards", { name: "Monday" }, { "idempotency-key": "monday-1" }), undefined);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect((await create(req("POST", "/dashboards", { name: "Tuesday" }, { "idempotency-key": "monday-1" }), undefined)).status).toBe(409);
    const page = await (await list(req("GET", "/dashboards?limit=10"), undefined)).json();
    expect(page).toEqual({ items: [{ id: d.id, kind: "dashboard", name: "Monday", role: "owner", url: `http://ziffr.test/dashboards/${d.id}` }], next: null });
    expect((await accessLogOf(id)).map((c) => [c.method, c.route, c.status])).toEqual([
      ["POST", "/api/v1/dashboards", 201], ["POST", "/api/v1/dashboards", 201], ["POST", "/api/v1/dashboards", 409], ["GET", "/api/v1/dashboards", 200],
    ]);
  });
  it("makes a dashboard from a template, and says why when a Slot is wrong", async () => {
    const { m, req } = await setup();
    const ok = await fromTemplate(req("POST", "/dashboards/from-template", { template: "deep-dive", fills: [[m.slug]] }), undefined);
    expect(ok.status).toBe(201);
    expect((await ok.json()).widgets).toHaveLength(6);
    const bad = await fromTemplate(req("POST", "/dashboards/from-template", { template: "side-by-side", fills: [[m.slug]] }), undefined);
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toEqual({ code: "unprocessable", message: expect.stringContaining("2 Slots") });
    const hidden = await fromTemplate(req("POST", "/dashboards/from-template", { template: "deep-dive", fills: [["someone-elses"]] }), undefined);
    expect(hidden.status).toBe(422);
  });
  it("adds, changes and removes widgets; 404 for a dashboard not seen; 400 for a bad body", async () => {
    const { m, req, params } = await setup();
    const d = await (await create(req("POST", "/dashboards", { name: "Board" }), undefined)).json();
    const added = await addWidget(req("POST", `/dashboards/${d.id}/widgets`, { view: "line", metrics: [m.slug], settings: { window: 24 } }), params({ id: String(d.id) }));
    expect(added.status).toBe(201);
    const w = await added.json();
    expect(w).toMatchObject({ view: "line", metrics: [m.slug], x: 0, y: 0 });
    const patched = await patchWidget(req("PATCH", `/dashboards/${d.id}/widgets/${w.id}`, { title: "Money in" }), params({ id: String(d.id), widgetId: String(w.id) }));
    expect((await patched.json()).title).toBe("Money in");
    for (const body of [{ view: "canvas", metrics: [m.slug] }, { view: "line", metrics: [m.slug], settings: { canvas: {} } }, { metrics: [m.slug], template: 3 }]) {
      const res = await addWidget(req("POST", `/dashboards/${d.id}/widgets`, body), params({ id: String(d.id) }));
      expect(res.status).toBe(400);
    }
    expect((await getOne(req("GET", "/dashboards/999999999"), params({ id: "999999999" }))).status).toBe(404);
    const removed = await removeWidget(req("DELETE", `/dashboards/${d.id}/widgets/${w.id}`), params({ id: String(d.id), widgetId: String(w.id) }));
    expect(await removed.json()).toEqual({ removed: w.id });
    expect((await (await getOne(req("GET", `/dashboards/${d.id}`), params({ id: String(d.id) }))).json()).widgets).toEqual([]);
  });
  it("writes a Finding on a story, and refuses a widget there with a reason", async () => {
    const { m, req, params } = await setup();
    const s = await (await create(req("POST", "/dashboards", { name: "Draft", kind: "story" }), undefined)).json();
    expect(s.url).toBe(`http://ziffr.test/stories/${s.id}`);
    const f = await addFinding(req("POST", `/stories/${s.id}/findings`, { metric: m.slug, headline: "{metric} grew" }), params({ id: String(s.id) }));
    expect(f.status).toBe(201);
    expect((await f.json()).words.headline).toBe("{metric} grew");
    const w = await addWidget(req("POST", `/dashboards/${s.id}/widgets`, { view: "number", metrics: [m.slug] }), params({ id: String(s.id) }));
    expect(w.status).toBe(422);
  });
  it("answers 403 without the scope and 429 with Retry-After at the daily limit", async () => {
    const reader = await setup(["dashboards:read"]);
    expect((await create(reader.req("POST", "/dashboards", { name: "X" }), undefined)).status).toBe(403);
    expect((await templates(reader.req("GET", "/templates?kind=dashboard"), undefined)).status).toBe(200);
    const { id, req } = await setup();
    await logCalls(id, 50, { method: "POST", route: "/api/v1/dashboards", status: 201 });
    const res = await create(req("POST", "/dashboards", { name: "One too many" }), undefined);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await res.json()).error.code).toBe("rate_limited");
  });
});
