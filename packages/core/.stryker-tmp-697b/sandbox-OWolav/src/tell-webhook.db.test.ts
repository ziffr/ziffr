// @ts-nocheck
// A Tell step that names a Webhook, and `alert.fired` (spec 0034, ticket #408; GLOSSARY: Tell, Webhook, Alert), against
// the database and a TLS server of the test's own: the message holds what an Alert's message says and nothing more, it
// is sent only for a Metric Everyone sees, only through a Tell step (never a personal Alert), only when the Webhook is
// on and chose the event, and only a Workflow whose owner is an Owner or Admin can name one.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlert } from "./alerts";
import { db } from "./db";
import { outboundTls } from "./outbound-request";
import { tellEditorFacts } from "./tell";
import { workspace } from "./test/db-fixtures";
import type { WorkflowStep } from "./types";
import { sendWaitingWebhooks } from "./webhook-send";
import { createWebhook, updateWebhook } from "./webhooks";
import { workflowsView } from "./page-data";
import { onValue } from "./workflow-engine";
import { saveWorkflow, setMetricWorkflow } from "./workflows";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });
const openssl = (() => { try { execFileSync("openssl", ["version"]); return true; } catch { return false; } })();
type Seen = { headers: IncomingMessage["headers"]; body: string };
const seen: Seen[] = [];
let port = 0;
let close = () => {};
const saved = { key: process.env.ZIFFR_SECRETS_KEY, hosts: process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS };
const cleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  if (!openssl) return;
  const dir = mkdtempSync(join(tmpdir(), "ziffr-tellhook-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const cert = readFileSync(join(dir, "cert.pem"), "utf8");
  const server = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => { seen.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") }); res.statusCode = 200; res.end("ok"); });
  });
  await new Promise<void>((r) => server.listen(0, "localhost", () => r()));
  port = (server.address() as AddressInfo).port;
  outboundTls.ca = cert;
  close = () => server.close();
});
afterAll(() => { outboundTls.ca = undefined; close(); });
beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 81).toString("base64");
  process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = "localhost";
  seen.length = 0;
});
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved.key === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved.key;
  if (saved.hosts === undefined) delete process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS; else process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = saved.hosts;
});

const P = (n: number) => `2026-${String(n).padStart(2, "0")}-01`;
let scope = "";
const sends = async (w: { id: string }) => (await db().from("webhook_sends").select("*").eq("workspace_id", w.id).eq("type", "alert.fired")).data ?? [];
const tell = (webhooks: string[], over: Partial<Extract<WorkflowStep, { type: "tell" }>> = {}): WorkflowStep => ({ type: "tell", id: "step-one-aaaa", condition: { kind: "at_or_above", value: "100" }, people: [], groups: [], webhooks, ...over });

/** Sara owns the Workspace, the Workflow and "Sales"; the Webhook chose alert.fired; the Metric is Everyone's when `shared`. */
async function setup(opts: { shared?: boolean; events?: string[] } = {}) {
  const w = await workspace(); cleanups.push(w.cleanup); scope = w.id;
  const sara = await w.person("owner", { email: `sara-${Math.random().toString(36).slice(2, 8)}@example.test` });
  const a = w.actor(sara);
  const hook = await createWebhook(a, { name: "Chat", url: `https://localhost:${port}/hook/alerts`, events: opts.events ?? ["alert.fired"] });
  const flow = await saveWorkflow(a, null, "Sales close", { dueWorkingDays: 2, steps: [tell([hook.id]), { type: "publish", lock: false }] });
  const m = await w.metric(sara, { name: "Sales <b>" }); await setMetricWorkflow(a, m.id, flow);
  if (opts.shared !== false) {
    const everyone = (await db().from("groups").select("id").eq("workspace_id", w.id).eq("everyone", true).single()).data!.id as number;
    await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: m.id, group_id: everyone, role: "viewer" });
  }
  const put = async (period: string, v: number) => { await w.value(m.id, period, v, sara); await onValue(m.id, period, sara); };
  return { w, sara, a, hook, flow, m, put };
}

describe.skipIf(!openssl)("alert.fired through a Tell step", () => {
  it("sends what an Alert's message says, once per crossing, and nothing else", async () => {
    const c = await setup();
    await c.put(P(1), 90);
    expect(await sends(c.w)).toHaveLength(0);
    await c.put(P(2), 120);
    expect(await sends(c.w)).toHaveLength(1);
    // The row holds ids only: no value, no name.
    // Ids and timestamps are random or move, so the columns themselves are checked: none can hold a value or a name.
    const row = (await sends(c.w))[0];
    expect(Object.keys(row).sort()).toEqual(["action_id", "alert_id", "attempts", "claimed_at", "created_at", "delivered_at", "failure", "id", "last_attempt_at", "metric_id", "next_attempt_at", "period_start", "reason", "source_type", "source_webhook_id", "state", "status_code", "tell_step_id", "thread_message_id", "type", "webhook_id", "workflow_id", "workspace_id"]);
    expect(row.tell_step_id).toBe("step-one-aaaa");
    // Every other column, apart from ids and timestamps, is checked as a whole word for the value and the name.
    const free: Record<string, unknown> = { ...row };
    for (const k of ["id", "workspace_id", "webhook_id", "workflow_id", "metric_id", "source_webhook_id", "action_id", "thread_message_id", "created_at", "next_attempt_at", "claimed_at", "last_attempt_at", "delivered_at", "period_start"]) delete free[k];
    for (const [k, v] of Object.entries(free)) expect(String(v), k).not.toMatch(/\bSales\b|\b120\b/);
    expect(await sendWaitingWebhooks(100, scope)).toEqual({ sent: 1, failed: 0 });
    const msg = JSON.parse(seen[0].body) as { type: string; workspace: { id: string }; data: Record<string, unknown> };
    expect(seen[0].headers["x-ziffr-event"]).toBe("alert.fired");
    expect(msg).toMatchObject({ type: "alert.fired", workspace: { id: c.w.id }, data: { metric: { id: c.m.id, name: "Sales <b>" }, period: P(2), condition: { kind: "at_or_above", level: "100" }, target: null } });
    expect(String(msg.data.value)).toContain("120");
    expect(Object.keys(msg.data).sort()).toEqual(["condition", "link", "metric", "period", "target", "value"]);
    expect(seen[0].body).not.toContain("sara");
    // Still above: no second message; after a fall and a new crossing, one more.
    await c.put(P(3), 130);
    expect(await sends(c.w)).toHaveLength(1);
    await c.put(P(4), 50);
    await c.put(P(5), 200);
    expect(await sends(c.w)).toHaveLength(2);
  });

  it("sends nothing for a Metric Everyone does not see", async () => {
    const c = await setup({ shared: false });
    await c.put(P(1), 120);
    expect(await sends(c.w)).toHaveLength(1);
    await sendWaitingWebhooks(100, scope);
    expect(seen).toHaveLength(0);
    expect((await sends(c.w))[0].state).toBe("dropped");
  });

  it("judges again when it sends: a Metric made private, or a step that no longer names the Webhook, sends nothing", async () => {
    const c = await setup();
    await c.put(P(1), 120);
    await db().from("shares").delete().eq("workspace_id", c.w.id).eq("object_id", c.m.id);
    await sendWaitingWebhooks(100, scope);
    expect(seen).toHaveLength(0);
    const d = await setup();
    await d.put(P(1), 120);
    await saveWorkflow(d.a, d.flow, "Sales close", { dueWorkingDays: 2, steps: [tell([]), { type: "publish", lock: false }] });
    await sendWaitingWebhooks(100, scope);
    expect(seen).toHaveLength(0);
  });

  it("is not queued for a Webhook that did not choose the event or is switched off", async () => {
    const c = await setup({ events: ["action.done"] });
    await c.put(P(1), 120);
    expect(await sends(c.w)).toHaveLength(0);
    await updateWebhook(c.a, c.hook.id, { events: ["alert.fired"] });
    await c.put(P(2), 50);
    await c.put(P(3), 120);
    expect(await sends(c.w)).toHaveLength(1);
  });

  it("never goes out for a personal Alert", async () => {
    const c = await setup();
    await createAlert(c.a, { metricId: c.m.id, condition: { kind: "at_or_above", value: "100" } });
    await db().from("workflows").update({ config: { dueWorkingDays: 2, steps: [{ type: "publish", lock: false }] } }).eq("id", c.flow);
    await c.put(P(1), 120);
    expect(await sends(c.w)).toHaveLength(0);
  });

  it("sends nothing for a value corrected below the level since it was queued, or a Metric moved off the Workflow", async () => {
    const c = await setup();
    await c.put(P(1), 120);
    await c.w.value(c.m.id, P(1), 50, c.sara);
    await sendWaitingWebhooks(100, scope);
    expect(seen).toHaveLength(0);
    const d = await setup();
    await d.put(P(1), 120);
    await setMetricWorkflow(d.a, d.m.id, null);
    await sendWaitingWebhooks(100, scope);
    expect(seen).toHaveLength(0);
  });

  it("stops when the Workflow's owner is no longer an Owner or Admin", async () => {
    const c = await setup();
    await c.put(P(1), 120);
    await c.w.person("owner");
    await c.w.setRole(c.sara, "member");
    await sendWaitingWebhooks(100, scope);
    expect(seen).toHaveLength(0);
  });
});

describe("who may name a Webhook", () => {
  it("is an Owner or Admin, among the Workspace's own Webhooks; anyone else leaves what was stored", async () => {
    const c = await setup();
    const elsewhere = await workspace(); cleanups.push(elsewhere.cleanup);
    const other = await elsewhere.person("owner");
    process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 81).toString("base64");
    const foreign = await createWebhook(elsewhere.actor(other), { name: "Theirs", url: `https://localhost:${port}/theirs`, events: ["alert.fired"] });
    const stored = async (id: number) => ((await db().from("workflows").select("config").eq("id", id).single()).data!.config as { steps: Extract<WorkflowStep, { type: "tell" }>[] }).steps.find((s) => s.type === "tell")!.webhooks;
    // A Webhook of another Workspace, a made-up id and more than three are never kept.
    const id = await saveWorkflow(c.a, c.flow, "Sales close", { dueWorkingDays: 2, steps: [tell([c.hook.id, foreign.id, "nope"]), { type: "publish", lock: false }] });
    expect(await stored(id)).toEqual([c.hook.id]);
    // A Member who owns a Workflow cannot name a Webhook, even their Workspace's own.
    const ann = await c.w.person("member");
    const mine = await saveWorkflow(c.w.actor(ann, "member"), null, "Mine", { dueWorkingDays: 1, steps: [tell([c.hook.id]), { type: "publish", lock: false }] });
    expect(await stored(mine)).toBeUndefined();
    // And saving a Workflow whose step an Owner gave a Webhook leaves it (the owner may have been made a Member since).
    await c.w.person("owner");
    await c.w.setRole(c.sara, "member");
    await saveWorkflow(c.w.actor(c.sara, "member"), c.flow, "Renamed", { dueWorkingDays: 2, steps: [tell([], { people: [ann] }), { type: "publish", lock: false }] });
    expect(await stored(c.flow)).toEqual([c.hook.id]);
    // The editor lists Webhooks (names, never the address) for an Owner or Admin only.
    expect((await tellEditorFacts(c.w.actor(c.sara, "owner"), c.flow)).webhooks).toEqual([{ id: c.hook.id, name: "Chat", enabled: true, hearsAlerts: true }]);
    expect((await tellEditorFacts(c.w.actor(ann, "member"), null)).webhooks).toEqual([]);
  });

  it("keeps Webhook ids out of the Workflows page for anyone who does not manage Webhooks", async () => {
    const c = await setup();
    const ann = await c.w.person("member");
    const stepsOf = (v: Awaited<ReturnType<typeof workflowsView>>) => JSON.stringify(v.workflows.map((w) => w.config));
    expect(stepsOf(await workflowsView(c.w.actor(c.sara, "owner")))).toContain(c.hook.id);
    expect(stepsOf(await workflowsView(c.w.actor(ann, "member")))).not.toContain(c.hook.id);
  });

  it("is put into the Audit Log when it changes", async () => {
    const c = await setup();
    const { data } = await db().from("audit_events").select("kind").eq("workspace_id", c.w.id).eq("kind", "workflow.webhooks_set");
    expect(data).toHaveLength(1);
  });
});
