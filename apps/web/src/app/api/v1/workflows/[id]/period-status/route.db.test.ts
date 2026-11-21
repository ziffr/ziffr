// GET /api/v1/workflows/{id}/period-status and GET /api/v1/workflows over HTTP (ticket #410; GLOSSARY: Period
// Timeline): a key that may read metrics gets the period as its creator may see it, a Metric they do not see only as a
// count, another workspace's Workflow is 404, and every call is in the Access Log. The answer matches the schema.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { saveWorkflow } from "@ziffr/core/workflows";
import { accessLogOf, workspace } from "@ziffr/core/test/db-fixtures";
import { PeriodStatus, WorkflowList } from "../../../schemas";
import { GET as LIST } from "../../route";
import { GET } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const get = (id: number, secret: string, q = "") => GET(new Request(`http://ziffr.test/api/v1/workflows/${id}/period-status${q}`, { headers: { authorization: `Bearer ${secret}` } }), { params: Promise.resolve({ id: String(id) }) } as never);

describe("GET /api/v1/workflows/{id}/period-status", () => {
  it("answers the period as the key's creator sees it, and logs the call", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); const ben = await w.person("member");
    const flow = await saveWorkflow(w.actor(sara), null, "Weekly numbers", { dueWorkingDays: 3, steps: [{ type: "publish", lock: false }] });
    const seen = await w.metric(sara, { name: "Revenue", period: "week", workflow_id: flow }); await w.token(seen.id, ben);
    const hidden = await w.metric(sara, { name: "Secret payroll", period: "week", workflow_id: flow });
    await w.value(seen.id, "2026-11-16", 10, ben); await w.value(hidden.id, "2026-11-16", 987654, sara);
    const { id, secret } = await createAccessKey(w.actor(ben, "member"), { name: "Read", scopes: ["metrics:read"], expiresOn: inDays(30) });
    const res = await get(flow, secret, "?period=2026-11-16");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(PeriodStatus.parse(body)).toEqual(body);
    expect(body).toMatchObject({ workflow: { id: flow, name: "Weekly numbers" }, period: { start: "2026-11-16" }, in: 2, of: 2 });
    expect(JSON.stringify(body)).not.toMatch(/Secret|payroll|\b987654\b/);
    expect(body.events[0].items).toContain("1 value");
    expect(await accessLogOf(id)).toEqual([{ method: "GET", route: `/api/v1/workflows/${flow}/period-status`, status: 200, submitted: 0 }]);
    // Left out, the newest period that has anything; a bad day is 400; the list names the Workflow.
    expect((await get(flow, secret)).status).toBe(200);
    expect((await get(flow, secret, "?period=soon")).status).toBe(400);
    const list = await (await LIST(new Request("http://ziffr.test/api/v1/workflows", { headers: { authorization: `Bearer ${secret}` } }), {} as never)).json();
    expect(WorkflowList.parse(list).items).toEqual([{ id: flow, name: "Weekly numbers" }]);
  });

  it("is 404 for another workspace's Workflow", async () => {
    const a = await workspace(); cleanups.push(a.cleanup);
    const b = await workspace(); cleanups.push(b.cleanup);
    const sara = await a.person("owner"); const eve = await b.person("owner");
    const flow = await saveWorkflow(a.actor(sara), null, "Weekly numbers", { dueWorkingDays: 3, steps: [{ type: "publish", lock: false }] });
    const { secret } = await createAccessKey(b.actor(eve, "owner"), { name: "Read", scopes: ["metrics:read"], expiresOn: inDays(30) });
    expect((await get(flow, secret, "?period=2026-11-16")).status).toBe(404);
  });
});
