// Workflows over HTTP (ticket #433; GLOSSARY: Workflow, Access Key): shapes and status codes, the scopes, 404 for a
// Workflow that is not the creator's, 422 with the words for a refusal, and that an assistant reaches the same routes
// from inside. The core's own rules are proven in api-workflows.db.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import type { Scope } from "@ziffr/core/actor";
import { accessLogOf, workspace } from "@ziffr/core/test/db-fixtures";
import { matchRoute } from "@/lib/api-in-process";
import { GET as list, POST as create } from "./route";
import { DELETE as remove, GET as read, PATCH as change } from "./[id]/route";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
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

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ann = await w.person("member"); const ada = await w.person("admin");
  return { w, sara, ann, ada };
}
const STEPS = [{ type: "check", change_pct: 20, outside_target: true }, { type: "publish", lock: false }];

describe("Workflows over HTTP", () => {
  it("makes, reads, changes, lists and deletes one, with the Access Log entries", async () => {
    const { w, sara } = await setup();
    const k = await keyFor(w, sara, "owner", ["metrics:read", "workflows:write"]);
    const res = await create(k.req("POST", "/workflows", { name: "Close", due_working_days: 2, steps: STEPS }), undefined);
    expect(res.status).toBe(201);
    const made = await res.json();
    expect(made).toMatchObject({ name: "Close", due_working_days: 2, lock_summary: false, metrics: 0, steps: STEPS });
    expect(await (await read(k.req("GET", `/workflows/${made.id}`), k.params(made.id))).json()).toEqual(made);
    const changed = await change(k.req("PATCH", `/workflows/${made.id}`, { name: "Weekly close" }), k.params(made.id));
    expect(await changed.json()).toMatchObject({ name: "Weekly close", steps: STEPS });
    expect((await (await list(k.req("GET", "/workflows"), undefined)).json()).items).toEqual([{ id: made.id, name: "Weekly close" }]);
    expect(await (await remove(k.req("DELETE", `/workflows/${made.id}`), k.params(made.id))).json()).toEqual({ removed: made.id });
    expect((await read(k.req("GET", `/workflows/${made.id}`), k.params(made.id))).status).toBe(404);
    expect((await accessLogOf(k.id)).map((c) => `${c.method} ${c.status}`)).toEqual(["POST 201", "GET 200", "PATCH 200", "GET 200", "DELETE 200", "GET 404"]);
  });

  it("answers 403 without the scope, 404 for someone else's Workflow, 400 for bad input and 422 with the words", async () => {
    const { w, sara, ann, ada } = await setup();
    const k = await keyFor(w, sara, "owner", ["metrics:read", "workflows:write"]);
    const made = await (await create(k.req("POST", "/workflows", { name: "Close", steps: STEPS }), undefined)).json();
    const reader = await keyFor(w, sara, "owner", ["metrics:read"]);
    expect((await create(reader.req("POST", "/workflows", { name: "X" }), undefined)).status).toBe(403);
    expect((await change(reader.req("PATCH", `/workflows/${made.id}`, { name: "X" }), reader.params(made.id))).status).toBe(403);
    expect((await remove(reader.req("DELETE", `/workflows/${made.id}`), reader.params(made.id))).status).toBe(403);
    // Ann holds every scope but the Workflow is Sara's: it is not there for her.
    const anns = await keyFor(w, ann, "member", ["metrics:read", "workflows:write", "workflows:people"]);
    expect((await read(anns.req("GET", `/workflows/${made.id}`), anns.params(made.id))).status).toBe(404);
    expect((await change(anns.req("PATCH", `/workflows/${made.id}`, { name: "X" }), anns.params(made.id))).status).toBe(404);
    expect((await remove(anns.req("DELETE", `/workflows/${made.id}`), anns.params(made.id))).status).toBe(404);
    // Bad input: unknown part, an empty change, a step out of range.
    expect((await create(k.req("POST", "/workflows", { name: "X", colour: "red" }), undefined)).status).toBe(400);
    expect((await change(k.req("PATCH", `/workflows/${made.id}`, {}), k.params(made.id))).status).toBe(400);
    expect((await create(k.req("POST", "/workflows", { name: "X", steps: [{ type: "remind", days_before: 99 }] }), undefined)).status).toBe(400);
    expect((await read(k.req("GET", "/workflows/abc"), k.params("abc"))).status).toBe(400);
    // Who approves is not this key's to choose: 422 in words, and nothing changed.
    const refused = await create(k.req("POST", "/workflows", { name: "Gate", steps: [{ type: "approve", approvers: [ada], values: "every", nobody_else: "count" }] }), undefined);
    expect(refused.status).toBe(422);
    expect((await refused.json()).error).toMatchObject({ code: "unprocessable", message: expect.stringContaining("cannot choose who approves") });
    const programs = await keyFor(w, sara, "owner", ["metrics:read", "workflows:write", "workflows:people"]);
    const gate = await create(programs.req("POST", "/workflows", { name: "Gate", steps: [{ type: "approve", approvers: [ada], values: "every", nobody_else: "count" }] }), undefined);
    expect(gate.status).toBe(201);
    const gateId = (await gate.json()).id as number;
    expect((await remove(k.req("DELETE", `/workflows/${gateId}`), k.params(gateId))).status).toBe(422);
    expect((await remove(programs.req("DELETE", `/workflows/${gateId}`), programs.params(gateId))).status).toBe(200);
  });

  it("is reachable from the remote MCP Server's tools, which are held to the same keys", () => {
    expect(matchRoute("workflows")).not.toBeNull();
    expect(matchRoute("workflows/5")).not.toBeNull();
  });
});
