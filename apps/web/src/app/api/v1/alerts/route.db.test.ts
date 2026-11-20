// The Alert endpoints over HTTP (spec 0032, ticket #376; GLOSSARY: Alert, Access Key): shapes and status codes, the
// scopes (Manage alerts to change, Read metrics to list), that a key acts only for its own creator, and that a Metric
// the creator cannot see answers like one that does not exist. The core's own rules are proven in alerts.db.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import type { Scope } from "@ziffr/core/actor";
import { accessLogOf, workspace } from "@ziffr/core/test/db-fixtures";
import { saveWorkflow, setMetricWorkflow } from "@ziffr/core/workflows";
import { GET as list, POST as create } from "./route";
import { DELETE as remove, PATCH as patch } from "./[id]/route";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

type W = Awaited<ReturnType<typeof workspace>>;
const ALL: Scope[] = ["metrics:read", "alerts:write"];

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ben = await w.person("member"); const gia = await w.person("guest");
  const cash = await w.metric(sara, { name: "Cash", target_min: 100 });
  const payroll = await w.metric(sara, { name: "Payroll" });
  for (const user of [ben, gia]) await w.share(cash.id, user);
  return { w, sara, ben, gia, cash, payroll };
}
async function keyFor(w: W, person: string, role: "owner" | "member" | "guest", scopes: Scope[] = ALL) {
  const { id, secret } = await createAccessKey(w.actor(person, role), { name: "Assistant", scopes, expiresOn: inDays(30) });
  const req = (method: string, path: string, body?: unknown) => new Request(`http://ziffr.test/api/v1${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { authorization: `Bearer ${secret}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });
  const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
  return { id, req, params };
}

describe("Alerts over HTTP", () => {
  it("makes, lists, changes and removes the creator's own Alert", async () => {
    const { w, ben, cash } = await setup();
    const k = await keyFor(w, ben, "member");
    const res = await create(k.req("POST", "/alerts", { metric: cash.slug, condition: { kind: "below", value: 10000 }, delivery: "email" }), undefined);
    expect(res.status).toBe(201);
    const a = await res.json();
    expect(a).toEqual({ id: a.id, metric: { slug: cash.slug, name: "Cash" }, condition: { kind: "below", value: "10000" }, delivery: "email", include_unapproved: false, paused_by_person: false, paused: null, state: "armed", fired_at: null, created_at: expect.any(String) });
    expect(await (await list(k.req("GET", "/alerts"), undefined)).json()).toEqual({ items: [a] });
    expect((await (await list(k.req("GET", `/alerts?metric=${cash.slug}`), undefined)).json()).items).toHaveLength(1);
    const changed = await patch(k.req("PATCH", `/alerts/${a.id}`, { condition: { kind: "share_of_target", share: "80" }, include_unapproved: true, paused: true }), k.params(a.id));
    expect(await changed.json()).toMatchObject({ id: a.id, condition: { kind: "share_of_target", share: "80" }, include_unapproved: true, paused_by_person: true });
    expect(await (await remove(k.req("DELETE", `/alerts/${a.id}`), k.params(a.id))).json()).toEqual({ removed: a.id });
    expect((await (await list(k.req("GET", "/alerts"), undefined)).json()).items).toEqual([]);
    expect((await accessLogOf(k.id)).map((c) => `${c.method} ${c.status}`)).toEqual(["POST 201", "GET 200", "GET 200", "PATCH 200", "DELETE 200", "GET 200"]);
  });

  it("needs Manage alerts to change and Read metrics to list; a key without either is refused", async () => {
    const { w, ben, cash } = await setup();
    const reader = await keyFor(w, ben, "member", ["metrics:read"]);
    const body = { metric: cash.slug, condition: { kind: "below", value: 1 } };
    expect((await create(reader.req("POST", "/alerts", body), undefined)).status).toBe(403);
    expect((await patch(reader.req("PATCH", "/alerts/1", { paused: true }), reader.params(1))).status).toBe(403);
    expect((await remove(reader.req("DELETE", "/alerts/1"), reader.params(1))).status).toBe(403);
    expect((await list(reader.req("GET", "/alerts"), undefined)).status).toBe(200);
    const writer = await keyFor(w, ben, "member", ["alerts:write"]);
    const refused = await list(writer.req("GET", "/alerts"), undefined);
    expect(refused.status).toBe(403);
    expect((await refused.json()).error.message).toContain("metrics:read");
    // Making and changing answer with the Metric, so they need Read metrics too.
    expect((await create(writer.req("POST", "/alerts", body), undefined)).status).toBe(403);
    expect((await patch(writer.req("PATCH", "/alerts/1", { paused: true }), writer.params(1))).status).toBe(403);
    expect((await remove(writer.req("DELETE", "/alerts/1"), writer.params(1))).status).toBe(403);
    expect((await create(reader.req("POST", "/alerts", body), undefined)).status).toBe(403);
    const submitter = await keyFor(w, ben, "member", ["metrics:read", "values:submit", "metrics:edit"]);
    expect((await create((await keyFor(w, ben, "member")).req("POST", "/alerts", body), undefined)).status).toBe(201);
    expect((await create(submitter.req("POST", "/alerts", body), undefined)).status).toBe(403);
    expect((await create(new Request("http://ziffr.test/api/v1/alerts", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), undefined)).status).toBe(401);
  });

  it("acts only for the key's creator: nobody else's Alert is listed, changed or removed, not even an Owner's key", async () => {
    const { w, sara, ben, cash } = await setup();
    const kb = await keyFor(w, ben, "member");
    const ks = await keyFor(w, sara, "owner");
    const mine = await (await create(kb.req("POST", "/alerts", { metric: cash.slug, condition: { kind: "below", value: 5 } }), undefined)).json();
    expect((await (await list(ks.req("GET", "/alerts"), undefined)).json()).items).toEqual([]);
    expect((await patch(ks.req("PATCH", `/alerts/${mine.id}`, { paused: true }), ks.params(mine.id))).status).toBe(404);
    expect((await remove(ks.req("DELETE", `/alerts/${mine.id}`), ks.params(mine.id))).status).toBe(404);
    // Nothing was changed or removed.
    expect((await (await list(kb.req("GET", "/alerts"), undefined)).json()).items).toEqual([expect.objectContaining({ id: mine.id, paused_by_person: false })]);
    // No body names a person: a field for one is refused as any it does not know.
    expect((await create(kb.req("POST", "/alerts", { metric: cash.slug, condition: { kind: "below", value: 5 }, person_id: sara }), undefined)).status).toBe(400);
    expect((await create(kb.req("POST", "/alerts", { metric: cash.slug, condition: { kind: "below", value: 5 }, user_id: sara }), undefined)).status).toBe(400);
  });

  it("answers a Metric the creator cannot see like one that is not there, and stops listing an Alert whose Metric was lost", async () => {
    const { w, ben, cash, payroll } = await setup();
    const k = await keyFor(w, ben, "member");
    const hidden = await create(k.req("POST", "/alerts", { metric: payroll.slug, condition: { kind: "below", value: 1 } }), undefined);
    const missing = await create(k.req("POST", "/alerts", { metric: "no-such-metric", condition: { kind: "below", value: 1 } }), undefined);
    expect([hidden.status, missing.status]).toEqual([404, 404]);
    expect(await hidden.json()).toEqual(await missing.json());
    expect((await (await list(k.req("GET", `/alerts?metric=${payroll.slug}`), undefined)).json()).items).toEqual([]);
    const a = await (await create(k.req("POST", "/alerts", { metric: cash.slug, condition: { kind: "below", value: 1 } }), undefined)).json();
    await w.unshare(cash.id, ben);
    expect((await (await list(k.req("GET", "/alerts"), undefined)).json()).items).toEqual([]);
    expect((await patch(k.req("PATCH", `/alerts/${a.id}`, { paused: true }), k.params(a.id))).status).toBe(404);
    expect((await remove(k.req("DELETE", `/alerts/${a.id}`), k.params(a.id))).status).toBe(404);
  });

  it("says in words why a condition or a limit is refused (422), and refuses a bad body (400)", async () => {
    const { w, ben, cash, sara } = await setup();
    const k = await keyFor(w, ben, "member");
    const noTarget = await w.metric(sara, { name: "Visits" });
    await w.share(noTarget.id, ben);
    const noShare = await create(k.req("POST", "/alerts", { metric: noTarget.slug, condition: { kind: "share_of_target", share: 80 } }), undefined);
    expect(noShare.status).toBe(422);
    expect((await noShare.json()).error).toEqual({ code: "unprocessable", message: expect.stringContaining("no target") });
    const noFlow = await create(k.req("POST", "/alerts", { metric: cash.slug, condition: { kind: "missing_after_due" } }), undefined);
    expect(noFlow.status).toBe(422);
    expect((await noFlow.json()).error.message).toContain("no Workflow");
    const a = { workspaceId: w.id, personId: sara, role: "owner" as const };
    await setMetricWorkflow(a, cash.id, await saveWorkflow(a, null, "Close", { dueWorkingDays: 2, steps: [] }));
    expect((await create(k.req("POST", "/alerts", { metric: cash.slug, condition: { kind: "missing_after_due" } }), undefined)).status).toBe(201);
    // A share outside 1 to 1,000 is the core's refusal, in words.
    const wide = await create(k.req("POST", "/alerts", { metric: cash.slug, condition: { kind: "changed_more", share: 5000 } }), undefined);
    expect(wide.status).toBe(422);
    // Five on one Metric, the sixth is refused with the number.
    for (let i = 1; i < 5; i++) expect((await create(k.req("POST", "/alerts", { metric: cash.slug, condition: { kind: "below", value: i } }), undefined)).status).toBe(201);
    const sixth = await create(k.req("POST", "/alerts", { metric: cash.slug, condition: { kind: "below", value: 9 } }), undefined);
    expect(sixth.status).toBe(422);
    expect((await sixth.json()).error.message).toContain(`${5} Alerts on this Metric`);
    for (const body of [
      { metric: cash.slug, condition: { kind: "weird" } },
      { metric: cash.slug, condition: { kind: "below" } },
      { metric: cash.slug, condition: { kind: "below", value: "abc", extra: 1 } },
      { metric: cash.slug, condition: { kind: "below", value: 1 }, delivery: "pigeon" },
      { condition: { kind: "below", value: 1 } },
      { metric: cash.slug, condition: { kind: "below", value: 1 }, include_unapproved: "yes" },
    ]) expect((await create(k.req("POST", "/alerts", body), undefined)).status, JSON.stringify(body)).toBe(400);
    const notText = await create(new Request("http://ziffr.test/api/v1/alerts", { method: "POST", body: "{", headers: { authorization: k.req("GET", "/alerts").headers.get("authorization")!, "content-type": "application/json" } }), undefined);
    expect(notText.status).toBe(400);
    expect((await patch(k.req("PATCH", "/alerts/1", {}), k.params(1))).status).toBe(400);
    expect((await patch(k.req("PATCH", "/alerts/abc", { paused: true }), k.params("abc"))).status).toBe(400);
    // A value that is text but not a number is the core's refusal.
    expect((await create(k.req("POST", "/alerts", { metric: cash.slug, condition: { kind: "below", value: "ten" } }), undefined)).status).toBe(422);
  });

  it("lets a Guest who sees a Metric make an Alert on it, and holds nothing for the creator who is no longer in the Workspace", async () => {
    const { w, gia, cash } = await setup();
    const k = await keyFor(w, gia, "guest");
    expect((await create(k.req("POST", "/alerts", { metric: cash.slug, condition: { kind: "at_or_above", value: "1.5" } }), undefined)).status).toBe(201);
    await w.dropMember(gia);
    expect((await list(k.req("GET", "/alerts"), undefined)).status).toBe(401);
  });
});
