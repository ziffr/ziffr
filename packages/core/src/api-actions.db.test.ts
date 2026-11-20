// Questions, Tasks and Approvals for programs against the database (ticket #427; GLOSSARY: Action, Thread, Self-check,
// Approval, Access Key): each call needs its scope, acts only for the key's creator by the app's own rules, answers an
// Action the creator may not read as one that is not there, and never lets a reply stand in for an Approval or a
// Self-check. Approving needs a program's key with its own scope, and never one's own value.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actorForSecret, checkKeyRequest, createAccessKey } from "./access-keys";
import { Forbidden, type KeyActor, type Scope } from "./actor";
import { ActionRefused, decideApprovalWithKey, listActionsWithKey, markDoneWithKey, replyWithKey, selfCheckWithKey, setStatusWithKey } from "./api-actions";
import { requestedScopes } from "./assistant-connections";
import { db } from "./db";
import { mailHostResolver } from "./mail-hosts";
import { JANUARY, periodStart } from "./periods";
import { workspace } from "./test/db-fixtures";
import { onValue } from "./workflow-engine";
import { createWebhook } from "./webhooks";
import { saveWorkflow, setMetricWorkflow } from "./workflows";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const saved = process.env.ZIFFR_SECRETS_KEY;
const realLookup = mailHostResolver.lookup;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 79).toString("base64");
  mailHostResolver.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
});
afterEach(async () => {
  mailHostResolver.lookup = realLookup;
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved;
});

const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const month = () => periodStart(new Date(), "month", JANUARY);
const API = { type: "api" } as const;
type W = Awaited<ReturnType<typeof workspace>>;

/** A key of a person, holding these scopes, as the API's guard hands it to the core. */
async function keyOf(w: W, person: string, role: "owner" | "admin" | "member", scopes: Scope[]): Promise<KeyActor> {
  const { secret } = await createAccessKey(w.actor(person, role), { name: "Program", scopes, expiresOn: inDays(30) });
  return (await actorForSecret(secret)) as KeyActor;
}
const ALL: Scope[] = ["actions:read", "actions:write", "values:submit", "values:approve", "metrics:read"];
const statusOf = async (id: number) => (await db().from("actions").select("status").eq("id", id).single()).data?.status as string;

/** Sara owns the Metric and asks; Ann is asked; Carla is on nothing; Sam submits Revenue and Ada approves its values (every one). */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ann = await w.person("member"); const carla = await w.person("member"); const ada = await w.person("admin"); const sam = await w.person("member");
  const cash = await w.metric(sara, { name: "Cash" });
  const revenue = await w.metric(sara, { name: "Revenue", sources: ["web_form", "api"] });
  const workflowId = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ada], values: "every" }, { type: "publish", lock: false }] });
  await setMetricWorkflow(w.actor(sara), revenue.id, workflowId);
  await w.token(revenue.id, sam);
  const question = await w.action({ metric_id: cash.id, period_start: month(), asker_id: sara, assignee_id: ann, kind: "question", question: "Why is cash down?" });
  const task = await w.action({ metric_id: cash.id, period_start: month(), asker_id: sara, assignee_id: ann, kind: "task", question: "Send the report" });
  // A value from Sam waits for Ada's approval.
  await w.value(revenue.id, month(), 100, sam);
  await onValue(revenue.id, month(), sam);
  const { data } = await db().from("actions").select("id").eq("metric_id", revenue.id).eq("purpose", "approval").single();
  return { w, sara, ann, carla, ada, sam, cash, revenue, question, task, approval: data!.id as number };
}

describe("listing Actions", () => {
  it("lists what waits for the creator and what they asked, never anyone else's, never another Workspace's", async () => {
    const { w, sara, ann, carla, question, task, approval } = await setup();
    const annKey = await keyOf(w, ann, "member", ["actions:read"]);
    expect((await listActionsWithKey(annKey, { limit: 50 })).items.map((a) => a.id).sort()).toEqual([question, task].sort());
    expect((await listActionsWithKey(annKey, { limit: 50, role: "asker" })).items).toEqual([]);
    const sarasKey = await keyOf(w, sara, "owner", ["actions:read"]);
    const asked = await listActionsWithKey(sarasKey, { limit: 50, role: "asker" });
    expect(asked.items.map((a) => a.id)).toEqual(expect.arrayContaining([question, task]));
    expect(asked.items[0]).toMatchObject({ asked_by_me: true, assigned_to_me: false, metric: expect.objectContaining({ name: expect.any(String) }) });
    expect(asked.items.find((a) => a.id === question)).toMatchObject({ kind: "question", status: "open", purpose: null, question: "Why is cash down?", assignee: ann });
    // Carla is on none of them; another Workspace's key sees none of this either.
    expect((await listActionsWithKey(await keyOf(w, carla, "member", ["actions:read"]), { limit: 50 })).items).toEqual([]);
    const other = await workspace(); cleanups.push(other.cleanup);
    const eve = await other.person("owner");
    expect((await listActionsWithKey(await keyOf(other, eve, "owner", ["actions:read"]), { limit: 50 })).items).toEqual([]);
    expect(approval).toBeGreaterThan(0);
  });

  it("pages newest first, leaves closed ones out unless asked, and names a Metric only to someone who sees it", async () => {
    const { w, sara, ann, ada, revenue, question, task, approval } = await setup();
    const annKey = await keyOf(w, ann, "member", ["actions:read"]);
    const first = await listActionsWithKey(annKey, { limit: 1 });
    expect(first.items.map((a) => a.id)).toEqual([Math.max(question, task)]);
    expect(first.next).toBe(Math.max(question, task));
    expect((await listActionsWithKey(annKey, { limit: 1, after: first.next })).items.map((a) => a.id)).toEqual([Math.min(question, task)]);
    await setStatusWithKey(await keyOf(w, sara, "owner", ["actions:write"]), task, "closed", API);
    expect((await listActionsWithKey(annKey, { limit: 50 })).items.map((a) => a.id)).toEqual([question]);
    expect((await listActionsWithKey(annKey, { limit: 50, status: "closed" })).items.map((a) => a.id)).toEqual([task]);
    // Ada holds the approval for a Metric nobody shared with her: it is hers to decide, and the Metric stays unnamed.
    const adaItems = (await listActionsWithKey(await keyOf(w, ada, "admin", ["actions:read"]), { limit: 50 })).items;
    expect(adaItems).toEqual([expect.objectContaining({ id: approval, purpose: "approval", metric: null })]);
    await w.share(revenue.id, ada);
    expect((await listActionsWithKey(await keyOf(w, ada, "admin", ["actions:read"]), { limit: 50 })).items[0].metric).toEqual({ slug: revenue.slug, name: "Revenue" });
  });

  it("needs the scope actions:read", async () => {
    const { w, ann } = await setup();
    await expect(listActionsWithKey(await keyOf(w, ann, "member", ["metrics:read", "actions:write"]), { limit: 5 })).rejects.toThrow(/Read questions and tasks/);
  });
});

describe("replying, closing and marking done", () => {
  it("replies for people on the Thread only, as words: the assignee's reply answers a Question", async () => {
    const { w, ann, carla, question } = await setup();
    const annKey = await keyOf(w, ann, "member", ["actions:write"]);
    const after = await replyWithKey(annKey, question, { body: "Rent went up", correction: 90 }, API);
    expect(after.status).toBe("answered");
    const { data } = await db().from("thread_messages").select("author_id, correction_value, correction_status").eq("action_id", question);
    expect(data).toEqual([{ author_id: ann, correction_value: 90, correction_status: "proposed" }]);
    // Carla may not read it: it is not there for her. Without the scope, nothing happens either.
    await expect(replyWithKey(await keyOf(w, carla, "member", ["actions:write"]), question, { body: "Hi" }, API)).rejects.toBeInstanceOf(Forbidden);
    await expect(replyWithKey(await keyOf(w, ann, "member", ["actions:read"]), question, { body: "Hi" }, API)).rejects.toThrow(/Answer questions and tasks/);
  });

  it("lets only the asker close and reopen, and only the assignee mark done", async () => {
    const { w, sara, ann, task } = await setup();
    const annKey = await keyOf(w, ann, "member", ["actions:write"]); const saraKey = await keyOf(w, sara, "owner", ["actions:write"]);
    await expect(setStatusWithKey(annKey, task, "closed", API)).rejects.toThrow(ActionRefused);
    await expect(markDoneWithKey(saraKey, task, API)).rejects.toThrow(ActionRefused);
    expect((await markDoneWithKey(annKey, task, API)).status).toBe("answered");
    await expect(markDoneWithKey(annKey, task, API)).rejects.toThrow(ActionRefused);
    expect((await setStatusWithKey(saraKey, task, "closed", API)).status).toBe("closed");
    expect((await setStatusWithKey(saraKey, task, "open", API)).status).toBe("open");
  });

  it("answers an Action of another Workspace as one that is not there", async () => {
    const { w, ann, task } = await setup();
    const other = await workspace(); cleanups.push(other.cleanup);
    const eve = await other.person("owner");
    const eveKey = await keyOf(other, eve, "owner", ["actions:write", "values:submit", "values:approve"]);
    for (const run of [() => replyWithKey(eveKey, task, { body: "x" }, API), () => setStatusWithKey(eveKey, task, "closed", API), () => markDoneWithKey(eveKey, task, API), () => selfCheckWithKey(eveKey, task, { decision: "confirm" }, API), () => decideApprovalWithKey(eveKey, task, { decision: "approve" }, API)]) {
      await expect(run()).rejects.toBeInstanceOf(Forbidden);
    }
    expect(await statusOf(task)).toBe("open");
    expect(ann).toBeTruthy(); expect(w.id).not.toBe(other.id);
  });

  it("sends each change to the Webhooks with the source api or mcp", async () => {
    const { w, sara, ann, question, task } = await setup();
    await createWebhook(w.actor(sara), { name: "To Do", url: "https://todo.example.test/hook/1", events: ["action.answered", "action.done", "action.updated"] });
    const annKey = await keyOf(w, ann, "member", ["actions:write"]);
    await replyWithKey(annKey, question, { body: "Because" }, API);
    await markDoneWithKey(annKey, task, { type: "mcp" });
    const rows = async (id: number) => ((await db().from("webhook_sends").select("type, source_type").eq("action_id", id)).data ?? []).map((r) => `${r.type}:${r.source_type}`);
    expect(await rows(question)).toEqual(["action.answered:api"]);
    expect(await rows(task)).toEqual(["action.done:mcp"]);
  });
});

describe("Approvals", () => {
  it("lets the Approver approve with the scope, and publishes the value", async () => {
    const { w, ada, approval, revenue } = await setup();
    const adaKey = await keyOf(w, ada, "admin", ALL);
    const done = await decideApprovalWithKey(adaKey, approval, { decision: "approve" }, API);
    expect(done).toMatchObject({ status: "closed", purpose: "approval" });
    const { data } = await db().from("period_states").select("state").eq("metric_id", revenue.id).eq("period_start", month()).single();
    expect(data?.state).toBe("published");
  });

  it("sends a value back with a comment", async () => {
    const { w, ada, approval, revenue } = await setup();
    const sent = await decideApprovalWithKey(await keyOf(w, ada, "admin", ALL), approval, { decision: "send_back", comment: "Check the March invoices" }, API);
    expect(sent.status).toBe("answered");
    const { data } = await db().from("period_states").select("state").eq("metric_id", revenue.id).eq("period_start", month()).single();
    expect(data?.state).toBe("submitted");
  });

  it("refuses without the scope, for someone who is not the Approver, and for an assistant's connection", async () => {
    const { w, sara, ada, ann, approval } = await setup();
    await expect(decideApprovalWithKey(await keyOf(w, ada, "admin", ["actions:read", "actions:write", "values:submit"]), approval, { decision: "approve" }, API)).rejects.toThrow(/Approve values/);
    // Sara owns the Metric and may read the task, but the Approver the Workflow names is Ada.
    await expect(decideApprovalWithKey(await keyOf(w, sara, "owner", ALL), approval, { decision: "approve" }, API)).rejects.toThrow(ActionRefused);
    await expect(decideApprovalWithKey(await keyOf(w, ann, "member", ALL), approval, { decision: "approve" }, API)).rejects.toBeInstanceOf(Forbidden);
    // A key made for an assistant never holds the scope (the database refuses it; the core also checks the key's kind).
    const adaKey = await keyOf(w, ada, "admin", ALL);
    const client = "zc_" + "A".repeat(22);
    await db().from("oauth_clients").insert({ id: client, name: "Assistant", redirect_uris: ["https://assistant.example.test/cb"] });
    cleanups.push(async () => { await db().from("access_keys").delete().eq("id", Number(adaKey.key.id)); await db().from("oauth_clients").delete().eq("id", client); });
    const { error } = await db().from("access_keys").update({ kind: "assistant", oauth_client_id: client, scopes: ["actions:read"] }).eq("id", Number(adaKey.key.id));
    expect(error).toBeNull();
    // Not even the database takes an assistant's key with the scope.
    const { error: backstop } = await db().from("access_keys").update({ scopes: ["values:approve"] }).eq("id", Number(adaKey.key.id));
    expect(backstop?.message).toMatch(/access_keys_assistant_never_approves/);
    await expect(decideApprovalWithKey(adaKey, approval, { decision: "approve" }, API)).rejects.toBeInstanceOf(Forbidden);
    expect(await statusOf(approval)).toBe("open");
  });

  it("never lets someone approve their own value, even when its task was handed to them", async () => {
    const { w, sam, approval } = await setup();
    await db().from("actions").update({ assignee_id: sam }).eq("id", approval);
    await expect(decideApprovalWithKey(await keyOf(w, sam, "member", ALL), approval, { decision: "approve" }, API)).rejects.toThrow(/Nobody approves their own value/);
    expect(await statusOf(approval)).toBe("open");
  });

  it("is not decided by a reply that says approve, from a key that may only answer", async () => {
    const { w, ada, sam, approval, revenue } = await setup();
    await replyWithKey(await keyOf(w, ada, "admin", ["actions:write"]), approval, { body: "Approved" }, API);
    await replyWithKey(await keyOf(w, ada, "admin", ["actions:write"]), approval, { body: "send back: no" }, API);
    expect(await statusOf(approval)).toBe("open");
    const { data } = await db().from("period_states").select("state").eq("metric_id", revenue.id).eq("period_start", month()).single();
    expect(data?.state).toBe("approval");
    // Nor can the task be marked done or closed by hand to get round it, not even by the submitter who asked for it.
    await expect(markDoneWithKey(await keyOf(w, ada, "admin", ["actions:write"]), approval, API)).rejects.toThrow(ActionRefused);
    await expect(setStatusWithKey(await keyOf(w, sam, "member", ["actions:write"]), approval, "closed", API)).rejects.toThrow(/decided by approving/);
    expect(await statusOf(approval)).toBe("open");
  });
});

describe("Self-checks", () => {
  /** Sara alone: the only Approver and the submitter, so her value waits for her own check. */
  async function alone() {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); const ben = await w.person("member");
    const workflowId = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [sara], values: "every" }, { type: "publish", lock: false }] });
    const m = await w.metric(sara, { name: "Revenue", sources: ["web_form", "api"] });
    await setMetricWorkflow(w.actor(sara), m.id, workflowId);
    await w.token(m.id, sara);
    await w.value(m.id, month(), 100, sara);
    await onValue(m.id, month(), sara);
    const { data } = await db().from("actions").select("id").eq("metric_id", m.id).eq("purpose", "self_check").single();
    return { w, sara, ben, m, check: data!.id as number };
  }

  it("confirms the creator's own value with values:submit, recorded as confirmed by the submitter", async () => {
    const { w, sara, m, check } = await alone();
    expect((await selfCheckWithKey(await keyOf(w, sara, "owner", ["values:submit"]), check, { decision: "confirm" }, API))).toMatchObject({ status: "closed", purpose: "self_check" });
    expect((await db().from("period_states").select("state").eq("metric_id", m.id).eq("period_start", month()).single()).data?.state).toBe("published");
  });

  it("corrects it, and the corrected value is the one that counts", async () => {
    const { w, sara, m, check } = await alone();
    await selfCheckWithKey(await keyOf(w, sara, "owner", ["values:submit"]), check, { decision: "correct", value: 120 }, API);
    const { data } = await db().from("observations").select("value, original_value").eq("metric_id", m.id).eq("period_start", month()).order("id", { ascending: false }).limit(1).single();
    expect(Number(data?.value)).toBe(120);
    expect(Number(data?.original_value)).toBe(100);
  });

  it("refuses without the scope, for someone else's check, and when a reply only says confirm", async () => {
    const { w, sara, ben, check } = await alone();
    await expect(selfCheckWithKey(await keyOf(w, sara, "owner", ["actions:write"]), check, { decision: "confirm" }, API)).rejects.toThrow(/Submit values/);
    await expect(selfCheckWithKey(await keyOf(w, ben, "member", ["values:submit"]), check, { decision: "confirm" }, API)).rejects.toBeInstanceOf(Forbidden);
    const key = await keyOf(w, sara, "owner", ["actions:write"]);
    await replyWithKey(key, check, { body: "confirm" }, API);
    await replyWithKey(key, check, { body: "Correction: 5", correction: 5 }, API);
    expect(await statusOf(check)).toBe("open");
    // A Self-check is not closed by hand either, and is not a Task to mark done.
    await expect(setStatusWithKey(key, check, "closed", API)).rejects.toThrow(ActionRefused);
    await expect(markDoneWithKey(key, check, API)).rejects.toThrow(ActionRefused);
    await expect(selfCheckWithKey(await keyOf(w, sara, "owner", ["values:submit"]), check, { decision: "correct", value: Number.NaN }, API)).rejects.toThrow(ActionRefused);
  });
});

describe("the scope values:approve", () => {
  it("is never offered to an assistant, never granted to one, and a program's key can hold it", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    expect(requestedScopes("metrics:read values:approve actions:write")).toEqual(["metrics:read", "actions:write"]);
    expect(() => checkKeyRequest(w.actor(sara), ["values:approve"], inDays(30), { assistant: true })).toThrow(/cannot be allowed to approve/);
    expect(checkKeyRequest(w.actor(sara), ["values:approve"], inDays(30)).scopes).toEqual(["values:approve"]);
    expect(checkKeyRequest(w.actor(sara), ["actions:read", "actions:write"], inDays(30), { assistant: true }).scopes).toEqual(["actions:read", "actions:write"]);
  });
});
