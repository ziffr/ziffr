// Questions, Tasks and Approvals over HTTP (ticket #427; GLOSSARY: Action, Approval, Access Key): shapes and status
// codes, the scopes, 404 for an Action the creator may not read, 422 with the words for a refusal, and that Approvals
// are not reachable from the remote MCP Server. The core's own rules are proven in api-actions.db.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { actorForSecret, createAccessKey } from "@ziffr/core/access-keys";
import type { KeyActor, Scope } from "@ziffr/core/actor";
import { listActionsWithKey } from "@ziffr/core/api-actions";
import { actionThread } from "@ziffr/core/page-data";
import { JANUARY, periodStart } from "@ziffr/core/periods";
import { accessLogOf, workspace } from "@ziffr/core/test/db-fixtures";
import { onValue } from "@ziffr/core/workflow-engine";
import { saveWorkflow, setMetricWorkflow } from "@ziffr/core/workflows";
import { matchRoute } from "@/lib/api-in-process";
import { GET as list } from "./route";
import { PATCH as change } from "./[id]/route";
import { POST as done } from "./[id]/done/route";
import { POST as replies } from "./[id]/replies/route";
import { POST as selfCheck } from "./[id]/self-check/route";
import { POST as approval } from "./[id]/approval/route";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const month = () => periodStart(new Date(), "month", JANUARY);
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

/** The key's actor, for reading an Action's state back through the core. */
async function asActor(w: W, person: string) {
  const { secret } = await createAccessKey(w.actor(person, "admin"), { name: "Reader", scopes: ["actions:read"], expiresOn: inDays(30) });
  return (await actorForSecret(secret)) as KeyActor;
}

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ann = await w.person("member"); const ada = await w.person("admin"); const sam = await w.person("member"); const eve = await w.person("member");
  const cash = await w.metric(sara, { name: "Cash" });
  const revenue = await w.metric(sara, { name: "Revenue", sources: ["web_form", "api"] });
  const workflowId = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ada], values: "every" }, { type: "publish", lock: false }] });
  await setMetricWorkflow(w.actor(sara), revenue.id, workflowId);
  await w.token(revenue.id, sam);
  const task = await w.action({ metric_id: cash.id, period_start: month(), asker_id: sara, assignee_id: ann, kind: "task", question: "Send the report" });
  await w.value(revenue.id, month(), 100, sam);
  await onValue(revenue.id, month(), sam);
  const adaKey = await keyFor(w, ada, "admin", ["actions:read"]);
  const approvalId = (await (await list(adaKey.req("GET", "/actions"), undefined)).json()).items.find((a: { purpose: string }) => a.purpose === "approval").id as number;
  return { w, sara, ann, ada, sam, eve, cash, task, approvalId };
}

describe("Actions over HTTP", () => {
  it("marks a Task done with an optional note kept as the Thread's last reply, and refuses a note that is too long", async () => {
    const { w, sara, ann, cash } = await setup();
    await w.share(cash.id, ann);
    const k = await keyFor(w, ann, "member", ["actions:write"]);
    const make = () => w.action({ metric_id: cash.id, period_start: month(), asker_id: sara, assignee_id: ann, kind: "task", question: "Send the report" });
    const first = await make();
    expect((await done(k.req("POST", `/actions/${first}/done`, { note: "x".repeat(2001) }), k.params(first))).status).toBe(400);
    expect((await done(k.req("POST", `/actions/${first}/done`, { note: "Sent it." }), k.params(first))).status).toBe(200);
    const thread = await actionThread(w.actor(ann, "member"), first);
    expect(thread!.messages.map((m) => [m.author_id, m.body])).toEqual([[ann, "Sent it."]]);
    const second = await make();
    expect((await done(k.req("POST", `/actions/${second}/done`), k.params(second))).status).toBe(200);
  });

  it("lists, replies, marks done and closes, with the Access Log entries", async () => {
    const { w, sara, ann, cash, task } = await setup();
    await w.share(cash.id, ann);
    const k = await keyFor(w, ann, "member", ["actions:read", "actions:write"]);
    const res = await list(k.req("GET", "/actions?role=assignee"), undefined);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ items: [expect.objectContaining({ id: task, kind: "task", status: "open", purpose: null, assigned_to_me: true, question: "Send the report", metric: { slug: expect.any(String), name: "Cash" } })], next: null });
    expect((await (await done(k.req("POST", `/actions/${task}/done`), k.params(task))).json()).status).toBe("answered");
    expect((await replies(k.req("POST", `/actions/${task}/replies`, { body: "On it", correction: 3 }), k.params(task))).status).toBe(201);
    expect((await done(k.req("POST", `/actions/${task}/done`), k.params(task))).status).toBe(422);
    // Only the asker closes: Ann gets the reason in words.
    const refused = await change(k.req("PATCH", `/actions/${task}`, { status: "closed" }), k.params(task));
    expect(refused.status).toBe(422);
    expect((await refused.json()).error).toMatchObject({ code: "unprocessable", message: "Only the person who asked can close or reopen this." });
    const asker = await keyFor(w, sara, "owner", ["actions:write"]);
    expect((await (await change(asker.req("PATCH", `/actions/${task}`, { status: "closed" }), asker.params(task))).json()).status).toBe("closed");
    expect((await accessLogOf(k.id)).map((c) => `${c.method} ${c.status}`)).toEqual(["GET 200", "POST 200", "POST 201", "POST 422", "PATCH 422"]);
  });

  it("answers 403 without the scope, 404 for an Action not readable, 400 for bad input, and needs a program's key", async () => {
    const { w, ann, eve, task } = await setup();
    const reader = await keyFor(w, ann, "member", ["actions:read"]);
    expect((await replies(reader.req("POST", `/actions/${task}/replies`, { body: "x" }), reader.params(task))).status).toBe(403);
    expect((await selfCheck(reader.req("POST", `/actions/${task}/self-check`, { decision: "confirm" }), reader.params(task))).status).toBe(403);
    expect((await approval(reader.req("POST", `/actions/${task}/approval`, { decision: "approve" }), reader.params(task))).status).toBe(403);
    const writer = await keyFor(w, eve, "member", ["actions:write", "actions:read"]);
    expect((await replies(writer.req("POST", `/actions/${task}/replies`, { body: "x" }), writer.params(task))).status).toBe(404);
    expect((await list(writer.req("GET", "/actions"), undefined).then((r) => r.json())).items).toEqual([]);
    const ok = await keyFor(w, ann, "member", ["actions:write"]);
    expect((await replies(ok.req("POST", `/actions/${task}/replies`, { body: "" }), ok.params(task))).status).toBe(400);
    expect((await replies(ok.req("POST", `/actions/${task}/replies`, { body: "x", correction: "ten" }), ok.params(task))).status).toBe(400);
    expect((await replies(ok.req("POST", "/actions/abc/replies", { body: "x" }), ok.params("abc"))).status).toBe(400);
    expect((await change(ok.req("PATCH", `/actions/${task}`, { status: "answered" }), ok.params(task))).status).toBe(400);
    expect((await list(ok.req("GET", "/actions"), undefined)).status).toBe(403);
  });

  it("approves only for the Approver with the scope; a reply 'approve' decides nothing", async () => {
    const { w, ada, sam, approvalId } = await setup();
    const noScope = await keyFor(w, ada, "admin", ["actions:write", "actions:read", "values:submit"]);
    expect((await approval(noScope.req("POST", `/actions/${approvalId}/approval`, { decision: "approve" }), noScope.params(approvalId))).status).toBe(403);
    expect((await replies(noScope.req("POST", `/actions/${approvalId}/replies`, { body: "approve" }), noScope.params(approvalId))).status).toBe(201);
    expect((await listActionsWithKey(await asActor(w, ada), { limit: 50 })).items.find((a) => a.id === approvalId)?.status).toBe("open");
    // The submitter is on the task (they asked for it), so they read it, and the answer says it is not theirs: nobody approves their own value.
    const submitter = await keyFor(w, sam, "member", ["values:approve"]);
    expect((await approval(submitter.req("POST", `/actions/${approvalId}/approval`, { decision: "approve" }), submitter.params(approvalId))).status).toBe(422);
    const approver = await keyFor(w, ada, "admin", ["values:approve"]);
    expect((await approval(approver.req("POST", `/actions/${approvalId}/approval`, { decision: "nod" }), approver.params(approvalId))).status).toBe(400);
    const res = await approval(approver.req("POST", `/actions/${approvalId}/approval`, { decision: "approve" }), approver.params(approvalId));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: approvalId, status: "closed", purpose: "approval" });
    // The same decision again is refused in words, not repeated.
    expect((await approval(approver.req("POST", `/actions/${approvalId}/approval`, { decision: "approve" }), approver.params(approvalId))).status).toBe(422);
  });

  it("keeps the approval endpoint out of the remote MCP Server's reach", () => {
    expect(matchRoute("actions/5/approval")).toBeNull();
    expect(matchRoute("actions/5/replies")).not.toBeNull();
  });
});
