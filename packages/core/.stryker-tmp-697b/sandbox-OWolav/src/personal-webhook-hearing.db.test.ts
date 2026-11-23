// @ts-nocheck
// What a Personal Webhook hears (spec 0037, ticket #642; GLOSSARY: Personal Webhook): personalWebhookMayHear as a table
// (private, shared, Groups, a Thread kept to a Group, own and teammates' Actions, a Metric made private or a person
// demoted between event and send, a value waiting for Approval for those who may and may not see it), and full messages
// through the real send to a TLS server of the test's own: nothing of what the person may not see, no other person's email.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { outboundTls } from "./outbound-request";
import * as hearing from "./personal-webhook-hearing";
import { mayPeekWaitingValue, personalWebhookMayHear } from "./personal-webhook-hearing";
import { createPersonalWebhook, forgetHiddenPersonalMetrics, listOwnPersonalWebhooks, ownPersonalWebhookLog, setPersonalWebhooksAllowed, updatePersonalWebhook } from "./personal-webhooks";
import { Forbidden } from "./actor";
import { queueWebhookEvent } from "./webhook-events";
import { workspace } from "./test/db-fixtures";
import { sendWaitingWebhooks } from "./webhook-send";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const openssl = (() => { try { execFileSync("openssl", ["version"]); return true; } catch { return false; } })();
type Seen = { path: string; headers: IncomingMessage["headers"]; body: string };
const seen: Seen[] = [];
let answer: (req: IncomingMessage, res: ServerResponse) => void = (_q, res) => { res.statusCode = 200; res.end("ok"); };
let port = 0;
let close = () => {};
const saved = { key: process.env.ZIFFR_SECRETS_KEY, hosts: process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS };
const cleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  if (!openssl) return;
  const dir = mkdtempSync(join(tmpdir(), "ziffr-hear-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const cert = readFileSync(join(dir, "cert.pem"), "utf8");
  const server = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => { seen.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") }); answer(req, res); });
  });
  await new Promise<void>((r) => server.listen(0, "localhost", () => r()));
  port = (server.address() as AddressInfo).port;
  outboundTls.ca = cert;
  close = () => server.close();
});
afterAll(() => { outboundTls.ca = undefined; close(); });
beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 84).toString("base64");
  process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = "localhost";
  seen.length = 0;
  answer = (_q, res) => { res.statusCode = 200; res.end("ok"); };
});
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved.key === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved.key;
  if (saved.hosts === undefined) delete process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS; else process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = saved.hosts;
});


const PERIOD = "2026-10-01";
type W = Awaited<ReturnType<typeof workspace>>;
/** A Workspace with an Owner, Ana and Bo and Cy (Members), the switch on, and a Metric of the Owner's. */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const owner = await w.person("owner"); const ana = await w.person("member", { email: `ana-${w.id}@own.example.test` }); const bo = await w.person("member", { email: `bo-${w.id}@team.example.test` }); const cy = await w.person("member");
  await setPersonalWebhooksAllowed(w.actor(owner), true);
  const metric = await w.metric(owner, { name: "Churn" });
  return { w, owner, ana, bo, cy, metric, A: w.actor(ana, "member") };
}
const value = (w: W, person: string, metricId: number, period = PERIOD) => personalWebhookMayHear(w.actor(person, "member"), { type: "value.recorded", metricId, period });
const group = async (w: W, members: string[]) => {
  const { data } = await db().from("groups").insert({ workspace_id: w.id, name: `G${Math.random().toString(36).slice(2, 6)}` }).select("id").single();
  for (const u of members) await db().from("group_members").insert({ workspace_id: w.id, group_id: data!.id, user_id: u });
  return data!.id as number;
};
const shareGroup = async (w: W, metricId: number, groupId: number) => { await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: metricId, group_id: groupId, role: "viewer" }); };

describe("personalWebhookMayHear: a value event", () => {
  it("is not for a Metric private to someone else, and is for one shared with the person only", async () => {
    const { w, ana, bo, metric } = await setup();
    expect(await value(w, ana, metric.id)).toBeNull();
    await w.share(metric.id, ana);
    expect(await value(w, ana, metric.id)).toMatchObject({ kind: "value" });
    // Shared with Ana only: Bo hears nothing of it.
    expect(await value(w, bo, metric.id)).toBeNull();
  });

  it("follows a Group: for a member of the Group a Metric is shared with, not for someone outside it", async () => {
    const { w, ana, bo, metric } = await setup();
    await shareGroup(w, metric.id, await group(w, [ana]));
    expect(await value(w, ana, metric.id)).toMatchObject({ kind: "value" });
    expect(await value(w, bo, metric.id)).toBeNull();
  });

  it("is not heard once the Metric is made private between the event and the send, nor by a person who is demoted", async () => {
    const { w, ana, metric } = await setup();
    await w.share(metric.id, ana);
    expect(await value(w, ana, metric.id)).not.toBeNull();
    await w.unshare(metric.id, ana);
    expect(await value(w, ana, metric.id)).toBeNull();
    await w.share(metric.id, ana);
    await w.setRole(ana, "guest");
    expect(await value(w, ana, metric.id)).toBeNull();
  });

  it("is not for an archived or Derived Metric, a Metric of another Workspace, or a malformed event", async () => {
    const { w, ana, owner, metric } = await setup();
    await w.share(metric.id, ana);
    const derived = await w.metric(owner, { name: "Ratio", formula: "{churn} / 2" });
    await w.share(derived.id, ana);
    expect(await value(w, ana, derived.id)).toBeNull();
    const other = await setup();
    expect(await value(w, ana, other.metric.id)).toBeNull();
    expect(await value(w, ana, metric.id, "yesterday")).toBeNull();
    expect(await value(w, ana, 1.5)).toBeNull();
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", metric.id);
    expect(await value(w, ana, metric.id)).toBeNull();
  });

  it("lets only the Metric's Owner, its Approver and the submitter peek at a value waiting for Approval", async () => {
    const { w, owner, ana, bo, cy, metric } = await setup();
    for (const p of [ana, bo, cy]) await w.share(metric.id, p);
    const task = await w.action({ metric_id: metric.id, period_start: PERIOD, asker_id: bo, assignee_id: cy, purpose: "approval", kind: "task" });
    await db().from("period_states").insert({ workspace_id: w.id, metric_id: metric.id, period_start: PERIOD, state: "approval", approval_action_id: task, approval_for: bo });
    const peek = (p: string) => mayPeekWaitingValue(w.id, p, metric as never, PERIOD);
    expect(await peek(owner)).toBe(true);
    expect(await peek(cy)).toBe(true);
    expect(await peek(bo)).toBe(true);
    expect(await peek(ana)).toBe(false);
  });
});

describe("personalWebhookMayHear: an Action event", () => {
  const action = (w: W, metricId: number, asker: string, assignee: string, over: Record<string, unknown> = {}) => w.action({ metric_id: metricId, period_start: PERIOD, asker_id: asker, assignee_id: assignee, kind: "task", ...over });
  const hear = (w: W, person: string, actionId: number) => personalWebhookMayHear(w.actor(person, "member"), { type: "action.created", actionId });

  it("is for an Action given to the person or asked by them, not for one given to a teammate", async () => {
    const { w, owner, ana, bo, metric } = await setup();
    await w.share(metric.id, ana);
    const mine = await action(w, metric.id, owner, ana);
    const asked = await action(w, metric.id, ana, bo);
    const theirs = await action(w, metric.id, owner, bo);
    expect(await hear(w, ana, mine)).toMatchObject({ kind: "action" });
    expect(await hear(w, ana, asked)).toMatchObject({ kind: "action" });
    // Ana sees the Metric and could read this Thread; it is still not hers.
    expect(await hear(w, ana, theirs)).toBeNull();
  });

  it("is not for an Action of another Workspace, a missing one or a person who is demoted", async () => {
    const { w, owner, ana, metric } = await setup();
    const mine = await action(w, metric.id, owner, ana);
    expect(await hear(w, ana, mine)).not.toBeNull();
    expect(await hear(w, ana, 999_999_999)).toBeNull();
    expect(await personalWebhookMayHear((await setup()).A, { type: "action.created", actionId: mine })).toBeNull();
    await w.setRole(ana, "guest");
    expect(await hear(w, ana, mine)).toBeNull();
  });

  it("keeps a Thread kept to a Group from someone outside it, though they see the Metric", async () => {
    const { w, owner, ana, bo, cy, metric } = await setup();
    await w.share(metric.id, ana);
    const inside = await group(w, [bo]);
    const kept = await action(w, metric.id, owner, bo, { read_group_id: inside });
    expect(await hear(w, bo, kept)).not.toBeNull();
    // Ana is on neither side of it: the Thread is the Group's.
    expect(await hear(w, ana, kept)).toBeNull();
    expect(await hear(w, cy, kept)).toBeNull();
  });
});

describe.skipIf(!openssl)("what a Personal Webhook is sent", () => {
  const run = async (w: W) => { await sendWaitingWebhooks(50, w.id); };
  const hook = async (A: ReturnType<W["actor"]>, events: string[], metricIds?: number[]) => (await createPersonalWebhook(A, { name: "Mine", url: `https://localhost:${port}/mine`, events, metricIds })).id;
  const log = async (id: string) => ((await db().from("webhook_sends").select("type, state").eq("webhook_id", id)).data ?? []);

  it("gets an Action given to it in full, with its own email and no one else's", async () => {
    const { w, owner, ana, A, metric } = await setup();
    const ownerMail = `owner-${w.id}@team.example.test`;
    await db().from("profiles").update({ email: ownerMail }).eq("id", owner);
    const id = await hook(A, ["action.created"]);
    const task = await w.action({ metric_id: metric.id, period_start: PERIOD, asker_id: owner, assignee_id: ana, kind: "task", question: "Call the three churned accounts" });
    expect(await queueWebhookEvent(w.id, "action.created", { type: "app" }, { actionId: task, metricId: metric.id, period: PERIOD })).toBe(1);
    await run(w);
    expect(seen).toHaveLength(1);
    const { data } = JSON.parse(seen[0].body);
    expect(data).toMatchObject({ title: "Call the three churned accounts", metric: { id: metric.id, name: "Churn" }, period: PERIOD, kind: "task", asker: { name: expect.stringContaining("owner") }, assignee: { id: ana, email: `ana-${w.id}@own.example.test` } });
    expect(data.redacted).toBeUndefined();
    expect(seen[0].body).not.toContain(ownerMail);
    expect(await log(id)).toEqual([{ type: "action.created", state: "delivered" }]);
  });

  it("queues nothing for an Action given to a teammate, and nothing for a Metric it did not pick", async () => {
    const { w, owner, ana, bo, A, metric } = await setup();
    await w.share(metric.id, ana);
    const id = await hook(A, ["action.created", "value.recorded"], []);
    const theirs = await w.action({ metric_id: metric.id, period_start: PERIOD, asker_id: owner, assignee_id: bo, kind: "task" });
    expect(await queueWebhookEvent(w.id, "action.created", { type: "app" }, { actionId: theirs, metricId: metric.id, period: PERIOD })).toBe(0);
    expect(await queueWebhookEvent(w.id, "value.recorded", { type: "app" }, { metricId: metric.id, period: PERIOD })).toBe(0);
    expect(await log(id)).toEqual([]);
  });

  it("sends a picked Metric's value, and nothing, with no row to hint at it, when the Metric turned private before the send", async () => {
    const { w, owner, ana, A, metric } = await setup();
    await w.share(metric.id, ana);
    await w.value(metric.id, PERIOD, 42, owner);
    const id = await hook(A, ["value.recorded"], [metric.id]);
    await queueWebhookEvent(w.id, "value.recorded", { type: "api" }, { metricId: metric.id, period: PERIOD });
    await run(w);
    expect(JSON.parse(seen[0].body)).toMatchObject({ type: "value.recorded", data: { metric: { id: metric.id }, period: PERIOD, value: "42" } });
    seen.length = 0;
    await queueWebhookEvent(w.id, "value.recorded", { type: "api" }, { metricId: metric.id, period: PERIOD });
    await w.unshare(metric.id, ana);
    await run(w);
    expect(seen).toHaveLength(0);
    expect(await log(id)).toEqual([{ type: "value.recorded", state: "delivered" }]);
    expect((await ownPersonalWebhookLog(A, id)).map((e) => e.state)).toEqual(["delivered"]);
  });

  it("sends a value that is unusual with the number only to who may see a waiting value", async () => {
    const { w, owner, ana, bo, A, metric } = await setup();
    await w.share(metric.id, ana);
    await w.value(metric.id, PERIOD, 900, bo);
    await db().from("period_states").insert({ workspace_id: w.id, metric_id: metric.id, period_start: PERIOD, state: "approval", approval_for: bo });
    const plain = await hook(A, ["value.unusual"], [metric.id]);
    const owners = await hook(w.actor(owner), ["value.unusual"], [metric.id]);
    expect(await queueWebhookEvent(w.id, "value.unusual", { type: "workflow" }, { metricId: metric.id, period: PERIOD })).toBe(2);
    await run(w);
    expect(seen).toHaveLength(2);
    const bodies = seen.map((s) => JSON.parse(s.body).data);
    expect(bodies.filter((d) => d.value === "900")).toHaveLength(1);
    expect(bodies.filter((d) => d.value === undefined)).toHaveLength(1);
    expect(plain).not.toBe(owners);
  });

  it("drops the number of an unusual value when a newer value arrives while the check for a waiting value runs", async () => {
    const { w, owner, bo, metric } = await setup();
    await w.value(metric.id, PERIOD, 900, bo);
    await hook(w.actor(owner), ["value.unusual"], [metric.id]);
    // The Owner may see a waiting value, so the number would go out; a newer value lands in between, so it must not.
    const real = hearing.mayPeekWaitingValue;
    const spy = vi.spyOn(hearing, "mayPeekWaitingValue").mockImplementation(async (...a) => { const r = await real(...a); await w.value(metric.id, PERIOD, 901, bo); return r; });
    try {
      await queueWebhookEvent(w.id, "value.unusual", { type: "workflow" }, { metricId: metric.id, period: PERIOD });
      await run(w);
      expect(spy).toHaveBeenCalled();
    } finally { spy.mockRestore(); }
    expect(seen).toHaveLength(1);
    expect(JSON.parse(seen[0].body).data.value).toBeUndefined();
  });

  it("never sends a plain viewer the number of an unusual value, even if the send runs before the value is marked waiting", async () => {
    const { w, ana, bo, A, metric } = await setup();
    await w.share(metric.id, ana);
    await w.value(metric.id, PERIOD, 900, bo);
    await hook(A, ["value.unusual"], [metric.id]);
    await queueWebhookEvent(w.id, "value.unusual", { type: "workflow" }, { metricId: metric.id, period: PERIOD });
    await run(w);
    expect(seen).toHaveLength(1);
    expect(JSON.parse(seen[0].body).data.value).toBeUndefined();
  });

  it("does not send value.recorded for a value that waits for Approval", async () => {
    const { w, owner, ana, A, metric } = await setup();
    await w.share(metric.id, ana);
    await w.value(metric.id, PERIOD, 900, owner);
    await db().from("period_states").insert({ workspace_id: w.id, metric_id: metric.id, period_start: PERIOD, state: "approval", approval_for: owner });
    await hook(A, ["value.recorded"], [metric.id]);
    await queueWebhookEvent(w.id, "value.recorded", { type: "api" }, { metricId: metric.id, period: PERIOD });
    await run(w);
    expect(seen).toHaveLength(0);
  });

  it("is sent no Action of a person who was demoted between the event and the send", async () => {
    const { w, owner, ana, A, metric } = await setup();
    await hook(A, ["action.created"]);
    const task = await w.action({ metric_id: metric.id, period_start: PERIOD, asker_id: owner, assignee_id: ana, kind: "task" });
    await queueWebhookEvent(w.id, "action.created", { type: "app" }, { actionId: task, metricId: metric.id, period: PERIOD });
    await w.setRole(ana, "guest");
    await run(w);
    expect(seen).toHaveLength(0);
  });
});

describe.skipIf(!openssl)("what the person's log keeps", () => {
  it("shows nothing about a Metric the person no longer sees, neither queued nor sent as about", async () => {
    const { w, owner, ana, A, metric } = await setup();
    await w.share(metric.id, ana);
    await w.value(metric.id, PERIOD, 5, owner);
    const { id } = await createPersonalWebhook(A, { name: "Mine", url: `https://localhost:${port}/mine`, events: ["value.recorded"], metricIds: [metric.id] });
    await queueWebhookEvent(w.id, "value.recorded", { type: "api" }, { metricId: metric.id, period: PERIOD });
    await sendWaitingWebhooks(50, w.id);
    await queueWebhookEvent(w.id, "value.recorded", { type: "api" }, { metricId: metric.id, period: PERIOD });
    expect((await ownPersonalWebhookLog(A, id)).map((e) => e.about)).toEqual([`Metric ${metric.id}`, `Metric ${metric.id}`]);
    await w.unshare(metric.id, ana);
    const after = await ownPersonalWebhookLog(A, id);
    expect(after.map((e) => e.state)).toEqual(["delivered"]);
    expect(after[0].about).toBeNull();
  });
});

describe("the Metrics a Personal Webhook picks", () => {
  it("are stored when they are the person's to see, in the Workspace, whole and no more than 50", async () => {
    const { w, owner, ana, A, metric } = await setup();
    const refused = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);
    const url = `https://localhost:${port || 1}/hook`;
    // Private to the Owner, and not there: the same refusal.
    expect(await refused(createPersonalWebhook(A, { name: "X", url, events: ["value.recorded"], metricIds: [metric.id] }))).toBeInstanceOf(Forbidden);
    expect(await refused(createPersonalWebhook(A, { name: "X", url, metricIds: [999_999_999] }))).toBeInstanceOf(Forbidden);
    for (const bad of [[1.5], ["1"], [0], "1", null, Array.from({ length: 51 }, (_, i) => i + 1)]) expect(await refused(createPersonalWebhook(A, { name: "X", url, metricIds: bad as never }))).toBeInstanceOf(Error);
    expect((await db().from("webhooks").select("id").eq("workspace_id", w.id).eq("owner_id", ana)).data).toEqual([]);
    await w.share(metric.id, ana);
    const derived = await w.metric(owner, { name: "Ratio", formula: "{churn} / 2" });
    await w.share(derived.id, ana);
    expect(await refused(createPersonalWebhook(A, { name: "X", url, metricIds: [derived.id] }))).toBeInstanceOf(Forbidden);
    const { id } = await createPersonalWebhook(A, { name: "X", url, events: ["value.recorded"], metricIds: [metric.id, metric.id] });
    expect((await db().from("webhooks").select("metric_ids").eq("id", id).single()).data?.metric_ids).toEqual([metric.id]);
    // A Metric of another Workspace is no Metric here.
    const other = await setup();
    expect(await refused(updatePersonalWebhook(A, id, { metricIds: [metric.id, other.metric.id] }))).toBeInstanceOf(Forbidden);
    await w.unshare(metric.id, ana);
    // One already picked stays when the person no longer sees it; a new one must be seen.
    await updatePersonalWebhook(A, id, { metricIds: [metric.id] });
    expect(await refused(updatePersonalWebhook(A, id, { metricIds: [] }))).toBeNull();
    // The page gets a count, never the id of a Metric the person lost sight of, and saving keeps that pick.
    const own = (await listOwnPersonalWebhooks(A)).webhooks.find((h) => h.id === id);
    expect(own?.metricIds).toEqual([]);
    expect(own?.hiddenMetrics).toBe(1);
    expect((await db().from("webhooks").select("metric_ids").eq("id", id).single()).data?.metric_ids).toEqual([metric.id]);
    // The person can drop them on purpose: the server does it, and they do not come back if sight returns.
    expect(await forgetHiddenPersonalMetrics(A, id)).toBe(1);
    expect(await forgetHiddenPersonalMetrics(A, id)).toBe(0);
    await w.share(metric.id, ana);
    expect((await db().from("webhooks").select("metric_ids").eq("id", id).single()).data?.metric_ids).toEqual([]);
    expect(owner).toBeTruthy();
  });

  it("are never kept on a Workspace Webhook", async () => {
    const { w } = await setup();
    const { error } = await db().from("webhooks").insert({ id: crypto.randomUUID(), workspace_id: w.id, name: "W", url: "x", secret: "y", metric_ids: [1] });
    expect(error).not.toBeNull();
  });
});
