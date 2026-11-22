// Status back into Ziffr (spec 0034, ticket #402), against the database: the request judged from outside (id, signature,
// age, replay, rate, an off Webhook), `link` with several external ids, `done`, `reply`, `answer` and `reopen` with their
// refusals, a call repeated, the echo marked and sent to every Webhook, what is sealed, and the external ids in the next
// message to the Webhook that linked them (and to no other).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { changeActionState, closeActions } from "./action-state";
import { db } from "./db";
import { outboundTls } from "./outbound-request";
import { createPersonalWebhook, setPersonalWebhookEnabled, setPersonalWebhooksAllowed } from "./personal-webhooks";
import { ask } from "./questions";
import { openRows } from "./sealed-columns";
import { workspace } from "./test/db-fixtures";
import { applyWebhookAction, authenticateWebhookRequest, WebhookRequestError, type InboundRequest } from "./webhook-inbound";
import { WEBHOOK_INBOUND_PER_MINUTE } from "./webhook-limits";
import { sendWaitingWebhooks, signWebhookBody } from "./webhook-send";
import { createWebhook, replaceWebhookSecret, setWebhookEnabled } from "./webhooks";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const openssl = (() => { try { execFileSync("openssl", ["version"]); return true; } catch { return false; } })();
const saved = { key: process.env.ZIFFR_SECRETS_KEY, hosts: process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS };
const cleanups: (() => Promise<void>)[] = [];
const seen: { path: string; body: string }[] = [];
let port = 1;
let close = () => {};

beforeAll(async () => {
  if (!openssl) return;
  const dir = mkdtempSync(join(tmpdir(), "ziffr-webhook-in-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const cert = readFileSync(join(dir, "cert.pem"), "utf8");
  const server = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => { seen.push({ path: req.url ?? "", body: Buffer.concat(chunks).toString("utf8") }); res.statusCode = 200; res.end("ok"); });
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

const used = new Set<string>();
/** A request as a recipe would sign it: a timestamp of its own each time (within the five minutes), since a request is taken once. */
function signed(secret: string, payload: unknown, over: Partial<InboundRequest> & { at?: number } = {}): InboundRequest {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  let at = over.at ?? Math.floor(Date.now() / 1000);
  while (over.at === undefined && used.has(`${body}.${at}`)) at--;
  used.add(`${body}.${at}`);
  return { timestamp: String(at), signature: signWebhookBody([secret], at, body), body, ...over };
}

/** The Workspace of the running test: only its sends are taken, so files running at once do not take each other's. */
let scope = "";

/** A Workspace with an owner, an assignee who sees the Metric, and two Webhooks (To Do and Planner). */
async function setup(events: string[] = ["action.created", "action.updated", "action.answered", "action.done"]) {
  const w = await workspace(); cleanups.push(w.cleanup); scope = w.id;
  const sara = await w.person("owner", { email: `sara-${Math.random().toString(36).slice(2, 8)}@example.test` });
  const ann = await w.person("member", { email: `ann-${Math.random().toString(36).slice(2, 8)}@example.test` });
  const m = await w.metric(sara, { name: "Revenue" });
  await w.share(m.id, ann);
  const a = w.actor(sara);
  const url = (p: string) => `https://localhost:${port}${p}`;
  const todo = await createWebhook(a, { name: "To Do", url: url("/todo"), events });
  const planner = await createWebhook(a, { name: "Planner", url: url("/planner"), events });
  const task = (kind: "task" | "question" = "task") => ask(a, { metricId: m.id, period: "2026-10-01", assigneeId: ann, text: "Send the report", kind });
  /** The Webhooks were sent this Action (as the job does), so they may answer for it. */
  const sent = async (id: number, ...hooks: { id: string }[]) => {
    for (const h of hooks) await db().from("webhook_sends").insert({ workspace_id: w.id, webhook_id: h.id, type: "action.created", action_id: id, metric_id: m.id, period_start: "2026-10-01", source_type: "app", state: "delivered" });
  };
  /** One call as a recipe makes it. */
  const call = async (hook: { id: string; secret: string }, payload: unknown) => {
    const who = await authenticateWebhookRequest(hook.id, signed(hook.secret, payload));
    if (!who.ok) throw new Error(`refused: ${who.why}`);
    return applyWebhookAction(who.actor, payload);
  };
  const refused = async (p: Promise<unknown>) => p.then(() => null, (e) => (e instanceof WebhookRequestError ? e.code : `other: ${(e as Error).message}`));
  const status = async (id: number) => (await db().from("actions").select("status").eq("id", id).single()).data!.status as string;
  const rows = async (id: number, type?: string) => (await db().from("webhook_sends").select("webhook_id, type, source_type, source_webhook_id, reason, state").eq("action_id", id).neq("type", "action.created").order("created_at")).data!.filter((r) => !type || r.type === type);
  return { w, sara, ann, m, a, todo, planner, task, sent, call, refused, status, rows };
}

describe("a request judged from outside", () => {
  it("answers alike, and does nothing, for an unknown id, no signature, a wrong secret, an old timestamp, a changed body and an off Webhook", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo);
    const p = { op: "done", ref: `ZIF-${id}` };
    const no = { ok: false, why: "not_found" };
    const noSuch = { ok: false, why: "no_such" };
    expect(await authenticateWebhookRequest("00000000-0000-4000-8000-000000000000", signed(c.todo.secret, p))).toEqual(noSuch);
    expect(await authenticateWebhookRequest("not-an-id", signed(c.todo.secret, p))).toEqual(noSuch);
    expect(await authenticateWebhookRequest(c.todo.id, { ...signed(c.todo.secret, p), signature: null })).toEqual(no);
    expect(await authenticateWebhookRequest(c.todo.id, { ...signed(c.todo.secret, p), timestamp: null })).toEqual(no);
    expect(await authenticateWebhookRequest(c.todo.id, signed(`whsec_${"x".repeat(43)}`, p))).toEqual(no);
    // Another Webhook's secret signs for that one only.
    expect(await authenticateWebhookRequest(c.todo.id, signed(c.planner.secret, p))).toEqual(no);
    expect(await authenticateWebhookRequest(c.todo.id, signed(c.todo.secret, p, { at: Math.floor(Date.now() / 1000) - 600 }))).toEqual(no);
    expect(await authenticateWebhookRequest(c.todo.id, { ...signed(c.todo.secret, p), body: JSON.stringify({ ...p, ref: "ZIF-999999999" }) })).toEqual(no);
    expect(await authenticateWebhookRequest(c.todo.id.toUpperCase(), signed(c.todo.secret, p))).toMatchObject({ ok: true });
    await setWebhookEnabled(c.a, c.todo.id, false);
    expect(await authenticateWebhookRequest(c.todo.id, signed(c.todo.secret, p))).toEqual(noSuch);
    expect(await c.status(id)).toBe("open");
  });

  it("takes a signed request once: a replay is refused like an unsigned one, whatever else it carries", async () => {
    const c = await setup();
    const req = signed(c.todo.secret, { op: "done", ref: "ZIF-1" });
    expect(await authenticateWebhookRequest(c.todo.id, req)).toMatchObject({ ok: true });
    expect(await authenticateWebhookRequest(c.todo.id, { ...req })).toEqual({ ok: false, why: "not_found" });
    // Each retry is signed anew, with a timestamp of its own.
    expect(await authenticateWebhookRequest(c.todo.id, signed(c.todo.secret, { op: "done", ref: "ZIF-1" }))).toMatchObject({ ok: true });
  });

  it("refuses a captured request replayed with a padded, reordered or extended signature header", async () => {
    const c = await setup();
    const req = signed(c.todo.secret, { op: "done", ref: "ZIF-1" });
    expect(await authenticateWebhookRequest(c.todo.id, req)).toMatchObject({ ok: true });
    const no = { ok: false, why: "not_found" };
    expect(await authenticateWebhookRequest(c.todo.id, { ...req, signature: ` ${req.signature} ` })).toEqual(no);
    expect(await authenticateWebhookRequest(c.todo.id, { ...req, signature: `${req.signature}, x` })).toEqual(no);
    expect(await authenticateWebhookRequest(c.todo.id, { ...req, signature: `${req.signature},${req.signature}` })).toEqual(no);
    // Junk in the header is refused even on a request never seen before.
    const fresh = signed(c.todo.secret, { op: "done", ref: "ZIF-2" });
    expect(await authenticateWebhookRequest(c.todo.id, { ...fresh, signature: `${fresh.signature}, x` })).toEqual(no);
    expect(await authenticateWebhookRequest(c.todo.id, fresh)).toMatchObject({ ok: true });
  });

  it("does not let a captured request act again: the same signature cannot be replayed for the same change", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo);
    const payload = { op: "done", ref: `ZIF-${id}` };
    const captured = signed(c.todo.secret, payload);
    const who = await authenticateWebhookRequest(c.todo.id, captured);
    if (!who.ok) throw new Error("refused");
    expect(await applyWebhookAction(who.actor, payload)).toMatchObject({ changed: true });
    await c.call(c.todo, { op: "reopen", ref: `ZIF-${id}` });
    expect(await authenticateWebhookRequest(c.todo.id, captured)).toEqual({ ok: false, why: "not_found" });
    expect(await c.status(id)).toBe("open");
  });

  it("answers 'limit' after 60 requests in a minute, to the one Webhook that made them", async () => {
    const c = await setup();
    for (let i = 0; i < WEBHOOK_INBOUND_PER_MINUTE; i++) expect(await authenticateWebhookRequest(c.todo.id, signed(c.todo.secret, {}))).toMatchObject({ ok: true });
    expect(await authenticateWebhookRequest(c.todo.id, signed(c.todo.secret, {}))).toEqual({ ok: false, why: "limit" });
    // Not signed: still 404, so the limit says nothing to someone without the secret.
    expect(await authenticateWebhookRequest(c.todo.id, signed(`whsec_${"y".repeat(43)}`, {}))).toEqual({ ok: false, why: "not_found" });
    expect(await authenticateWebhookRequest(c.planner.id, signed(c.planner.secret, {}))).toMatchObject({ ok: true });
  });

  it("accepts the old secret for 24 hours after a replacement, beside the new one", async () => {
    const c = await setup();
    const fresh = await replaceWebhookSecret(c.a, c.todo.id);
    expect(await authenticateWebhookRequest(c.todo.id, signed(c.todo.secret, {}))).toMatchObject({ ok: true });
    expect(await authenticateWebhookRequest(c.todo.id, signed(fresh.secret, {}))).toMatchObject({ ok: true });
    await db().from("webhooks").update({ secret_previous_until: new Date(Date.now() - 1000).toISOString() }).eq("id", c.todo.id);
    expect(await authenticateWebhookRequest(c.todo.id, signed(c.todo.secret, {}))).toEqual({ ok: false, why: "not_found" });
  });
});

describe("link: an Action is an external task, per Webhook and system", () => {
  it("links several systems to one Action, replaces one, refuses the 11th, and says when nothing changed", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo);
    const ref = `ZIF-${id}`;
    expect(await c.call(c.todo, { op: "link", ref, system: "microsoft-todo", external_id: "AAA", url: "https://to-do.live.com/tasks/AAA" })).toEqual({ changed: true, status: "open" });
    expect(await c.call(c.todo, { op: "link", ref, system: "microsoft-todo", external_id: "AAA", url: "https://to-do.live.com/tasks/AAA" })).toEqual({ changed: false, status: "open" });
    expect(await c.call(c.todo, { op: "link", ref, system: "planner", external_id: "P1" })).toMatchObject({ changed: true });
    expect(await c.call(c.todo, { op: "link", ref, system: "microsoft-todo", external_id: "BBB" })).toMatchObject({ changed: true });
    const { data } = await db().from("webhook_external_ids").select("system").eq("action_id", id);
    expect(data!.map((r) => r.system).sort()).toEqual(["microsoft-todo", "planner"]);
    for (let i = 0; i < 8; i++) await c.call(c.todo, { op: "link", ref, system: `sys-${i}`, external_id: `E${i}` });
    expect(await c.refused(c.call(c.todo, { op: "link", ref, system: "one-too-many", external_id: "X" }))).toBe("conflict");
    // Replacing one of the ten is still allowed.
    expect(await c.call(c.todo, { op: "link", ref, system: "sys-3", external_id: "E3b" })).toMatchObject({ changed: true });
  });

  it("counts the links of an Action over all its Webhooks, not per Webhook", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo, c.planner);
    const ref = `ZIF-${id}`;
    for (let i = 0; i < 6; i++) await c.call(c.todo, { op: "link", ref, system: `a-${i}`, external_id: `A${i}` });
    for (let i = 0; i < 4; i++) await c.call(c.planner, { op: "link", ref, system: `b-${i}`, external_id: `B${i}` });
    expect(await c.refused(c.call(c.planner, { op: "link", ref, system: "b-9", external_id: "B9" }))).toBe("conflict");
  });

  it("still answers for an Action it linked after the log of sends was pruned, and for nothing it never linked", async () => {
    const c = await setup();
    const id = await c.task(), other = await c.task(); await c.sent(id, c.todo); await c.sent(other, c.todo);
    await c.call(c.todo, { op: "link", ref: `ZIF-${id}`, system: "microsoft-todo", external_id: "AAA" });
    await db().from("webhook_sends").delete().eq("workspace_id", c.w.id);
    expect(await c.refused(c.call(c.todo, { op: "done", ref: `ZIF-${other}` }))).toBe("not_found");
    expect(await c.call(c.todo, { op: "done", system: "microsoft-todo", external_id: "AAA" })).toEqual({ changed: true, status: "answered" });
  });

  it("drops what waits to be sent when a Webhook is switched off, so switching on resends nothing", async () => {
    const c = await setup();
    const id = await c.task();
    const row = (state: string) => ({ workspace_id: c.w.id, webhook_id: c.todo.id, type: "action.updated", action_id: id, metric_id: c.m.id, period_start: "2026-10-01", source_type: "app", state });
    await db().from("webhook_sends").insert([row("retrying"), row("queued"), row("delivered")]);
    await setWebhookEnabled(c.a, c.todo.id, false);
    await setWebhookEnabled(c.a, c.todo.id, true);
    const { data } = await db().from("webhook_sends").select("state").eq("webhook_id", c.todo.id).eq("type", "action.updated");
    expect(data!.map((r) => r.state).sort()).toEqual(["delivered", "dropped", "dropped"]);
  });

  it("refuses an external task that is already another Action, a shape that is wrong, and an Action never sent to this Webhook", async () => {
    const c = await setup();
    const one = await c.task(), two = await c.task(), three = await c.task();
    await c.sent(one, c.todo); await c.sent(two, c.todo); await c.sent(three, c.planner);
    await c.call(c.todo, { op: "link", ref: `ZIF-${one}`, system: "google-tasks", external_id: "T1" });
    expect(await c.refused(c.call(c.todo, { op: "link", ref: `ZIF-${two}`, system: "google-tasks", external_id: "T1" }))).toBe("conflict");
    // The external id is Webhook-scoped: Planner may use the same id for its own Action.
    expect(await c.call(c.planner, { op: "link", ref: `ZIF-${three}`, system: "google-tasks", external_id: "T1" })).toMatchObject({ changed: true });
    const bad = (extra: Record<string, unknown>) => c.refused(c.call(c.todo, { op: "link", ref: `ZIF-${one}`, system: "x", external_id: "e", ...extra }));
    expect(await bad({ system: "has space" })).toBe("invalid");
    expect(await bad({ system: "a".repeat(41) })).toBe("invalid");
    expect(await bad({ external_id: "e".repeat(201) })).toBe("invalid");
    expect(await bad({ external_id: 12 })).toBe("invalid");
    expect(await bad({ url: "http://insecure.example.test/x" })).toBe("invalid");
    expect(await bad({ url: "https://user:pw@example.test/x" })).toBe("invalid");
    expect(await bad({ url: "javascript:alert(1)" })).toBe("invalid");
    expect(await bad({ ref: "ZIF-0" })).toBe("invalid");
    expect(await bad({ ref: "ZIF-1; drop table actions" })).toBe("invalid");
    // `three` went to Planner only; To Do may not link it.
    expect(await c.refused(c.call(c.todo, { op: "link", ref: `ZIF-${three}`, system: "x", external_id: "z" }))).toBe("not_found");
  });

  it("finds an Action by the system and external id this Webhook linked, never by another Webhook's", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo, c.planner);
    await c.call(c.todo, { op: "link", ref: `ZIF-${id}`, system: "microsoft-todo", external_id: "Case-Sensitive-1" });
    expect(await c.call(c.todo, { op: "done", system: "microsoft-todo", external_id: "Case-Sensitive-1" })).toEqual({ changed: true, status: "answered" });
    // The same words from Planner, which linked nothing, find nothing; nor does another spelling in To Do.
    expect(await c.refused(c.call(c.planner, { op: "done", system: "microsoft-todo", external_id: "Case-Sensitive-1" }))).toBe("not_found");
    expect(await c.refused(c.call(c.todo, { op: "done", system: "microsoft-todo", external_id: "case-sensitive-1" }))).toBe("not_found");
  });

  it("seals the external id and the address: a dump holds neither", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo);
    await c.call(c.todo, { op: "link", ref: `ZIF-${id}`, system: "microsoft-todo", external_id: "visible-marker-777", url: "https://to-do.example.test/visible-marker-777" });
    const { data } = await db().from("webhook_external_ids").select("*").eq("action_id", id).single();
    expect(JSON.stringify(data)).not.toContain("visible-marker-777");
    expect(data!.external_id).toMatch(/^w1\./);
    expect(data!.url).toMatch(/^w1\./);
  });
});

describe("done, reply, answer and reopen", () => {
  it("marks a Task done as its assignee, via the Webhook, once; a repeat is changed:false with no second event", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo);
    const ref = `ZIF-${id}`;
    expect(await c.call(c.todo, { op: "done", ref })).toEqual({ changed: true, status: "answered" });
    expect(await c.call(c.todo, { op: "done", ref })).toEqual({ changed: false, status: "answered" });
    expect(await c.status(id)).toBe("answered");
    const { data: msgs } = await db().from("thread_messages").select("author_id, via").eq("action_id", id);
    expect(msgs).toEqual([{ author_id: c.ann, via: "To Do" }]);
    const { data: log } = await db().from("audit_events").select("kind, actor_name").eq("workspace_id", c.w.id).eq("kind", "webhook.marked_done");
    expect(log).toEqual([{ kind: "webhook.marked_done", actor_name: "Webhook To Do" }]);
    expect((await c.rows(id, "action.done")).filter((r) => r.source_type === "webhook")).toHaveLength(1);
  });

  it("refuses a Question, a Task never sent to this Webhook, an Action of another Workspace, a disabled one and an Approval", async () => {
    const c = await setup();
    const q = await c.task("question"), t = await c.task(), approval = await c.task();
    await c.sent(q, c.todo); await c.sent(approval, c.todo);
    await db().from("actions").update({ purpose: "approval" }).eq("id", approval);
    expect(await c.refused(c.call(c.todo, { op: "done", ref: `ZIF-${q}` }))).toBe("conflict");
    expect(await c.refused(c.call(c.todo, { op: "done", ref: `ZIF-${t}` }))).toBe("not_found");
    expect(await c.refused(c.call(c.todo, { op: "done", ref: `ZIF-${approval}` }))).toBe("conflict");
    expect(await c.refused(c.call(c.todo, { op: "reply", ref: `ZIF-${approval}`, text: "approved" }))).toBe("conflict");
    const o = await setup();
    const foreign = await o.task(); await o.sent(foreign, o.todo);
    expect(await c.refused(c.call(c.todo, { op: "done", ref: `ZIF-${foreign}` }))).toBe("not_found");
    expect(await c.status(q)).toBe("open");
    expect(await c.status(approval)).toBe("open");
    // An Action that was only queued, or dropped, was never sent.
    await db().from("webhook_sends").update({ state: "dropped" }).eq("action_id", approval);
    await db().from("actions").update({ purpose: null }).eq("id", approval);
    expect(await c.refused(c.call(c.todo, { op: "done", ref: `ZIF-${approval}` }))).toBe("not_found");
  });

  it("refuses an Action on a Metric its assignee can no longer see", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo);
    await c.w.unshare(c.m.id, c.ann);
    expect(await c.refused(c.call(c.todo, { op: "done", ref: `ZIF-${id}` }))).toBe("not_found");
    expect(await c.status(id)).toBe("open");
  });

  it("adds nothing to a closed Action, refuses an assignee who left, and stops a flood of changes to one Thread", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo);
    const ref = `ZIF-${id}`;
    for (let i = 0; i < 10; i++) await c.call(c.todo, { op: "reply", ref, text: `note ${i}` });
    expect(await c.refused(c.call(c.todo, { op: "reply", ref, text: "one more" }))).toBe("conflict");
    expect(await c.refused(c.call(c.todo, { op: "done", ref }))).toBe("conflict");
    const closed = await c.task(); await c.sent(closed, c.todo);
    await changeActionState(c.w.id, closed, { to: "closed", from: ["open"], guard: { askerId: c.sara } });
    expect(await c.call(c.todo, { op: "reply", ref: `ZIF-${closed}`, text: "late" })).toEqual({ changed: false, status: "closed" });
    expect((await db().from("thread_messages").select("id").eq("action_id", closed)).data).toEqual([]);
    const gone = await c.task(); await c.sent(gone, c.todo);
    await db().from("memberships").delete().eq("workspace_id", c.w.id).eq("user_id", c.ann);
    expect(await c.refused(c.call(c.todo, { op: "done", ref: `ZIF-${gone}` }))).toBe("not_found");
  });

  it("refuses what is not an operation, and a body that is not an object", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo);
    for (const p of [{ op: "create", ref: `ZIF-${id}` }, { op: "reassign", ref: `ZIF-${id}` }, { ref: `ZIF-${id}` }, { op: "done" }, [], "done", null, 7]) expect(await c.refused(c.call(c.todo, p))).toBe("invalid");
  });

  it("adds a reply as the assignee, via the Webhook, with the words as plain text: never a value, a Correction or a command", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo);
    const ref = `ZIF-${id}`;
    await c.call(c.todo, { op: "reply", ref, text: "Correction: 12" });
    await c.call(c.todo, { op: "reply", ref, text: "42" });
    await c.call(c.todo, { op: "reply", ref, text: "<img src=x onerror=alert(1)>\u0000 and **bold**" });
    const { data: msgs } = await db().from("thread_messages").select("author_id, via, correction_value, correction_status").eq("action_id", id);
    expect(msgs).toEqual(Array(3).fill({ author_id: c.ann, via: "To Do", correction_value: null, correction_status: null }));
    expect((await db().from("observations").select("id").eq("metric_id", c.m.id)).data).toEqual([]);
    // A reply does not finish a Task; only `done` does.
    expect(await c.status(id)).toBe("open");
    const { data: first } = await db().from("thread_messages").select("body").eq("action_id", id).order("id").limit(1).single();
    expect(first!.body).toMatch(/^w1\./);
    expect(await c.call(c.todo, { op: "reply", ref, text: "<img src=x onerror=alert(1)>\u0000 and **bold**" })).toEqual({ changed: false, status: "open" });
    for (const text of ["", "   ", "x".repeat(1001), 5, null, undefined]) expect(await c.refused(c.call(c.todo, { op: "reply", ref, text }))).toBe("invalid");
  });

  it("answers a Question as its assignee, once; a Task is not answered, and an answered Question is changed:false", async () => {
    const c = await setup();
    const q = await c.task("question"), t = await c.task();
    await c.sent(q, c.todo); await c.sent(t, c.todo);
    expect(await c.refused(c.call(c.todo, { op: "answer", ref: `ZIF-${t}`, text: "yes" }))).toBe("conflict");
    expect(await c.call(c.todo, { op: "answer", ref: `ZIF-${q}`, text: "Traffic fell in week 3" })).toEqual({ changed: true, status: "answered" });
    expect(await c.call(c.todo, { op: "answer", ref: `ZIF-${q}`, text: "Traffic fell in week 3" })).toEqual({ changed: false, status: "answered" });
    expect((await c.rows(q, "action.answered")).filter((r) => r.source_webhook_id === c.todo.id)).toHaveLength(1);
    expect((await db().from("thread_messages").select("via").eq("action_id", q)).data).toEqual([{ via: "To Do" }]);
  });

  it("reopens a Task marked done, and sends action.updated to the other Webhooks, marked with the one it came from, and nothing back to it", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo);
    const ref = `ZIF-${id}`;
    expect(await c.call(c.todo, { op: "reopen", ref })).toEqual({ changed: false, status: "open" });
    await changeActionState(c.w.id, id, { to: "answered", from: ["open"], reason: "done", guard: { assigneeId: c.ann } }, { type: "slack" });
    expect(await c.call(c.todo, { op: "reopen", ref })).toEqual({ changed: true, status: "open" });
    expect(await c.call(c.todo, { op: "reopen", ref })).toEqual({ changed: false, status: "open" });
    const updates = await c.rows(id, "action.updated");
    expect(updates.map((r) => [r.webhook_id, r.source_type, r.source_webhook_id])).toEqual([[c.planner.id, "webhook", c.todo.id]]);
  });

  it("does not reopen a Question, a Task closed by the asker, or a Task the system closed", async () => {
    const c = await setup();
    const q = await c.task("question"), byAsker = await c.task(), bySystem = await c.task();
    await c.sent(q, c.todo); await c.sent(byAsker, c.todo); await c.sent(bySystem, c.todo);
    await changeActionState(c.w.id, q, { to: "answered", from: ["open"] }, { type: "slack" });
    expect(await c.refused(c.call(c.todo, { op: "reopen", ref: `ZIF-${q}` }))).toBe("conflict");
    await changeActionState(c.w.id, byAsker, { to: "closed", from: ["open"], guard: { askerId: c.sara } });
    expect(await c.call(c.todo, { op: "reopen", ref: `ZIF-${byAsker}` })).toEqual({ changed: false, status: "closed" });
    await changeActionState(c.w.id, bySystem, { to: "answered", from: ["open"], reason: "metric_archived" }, { type: "system" });
    expect(await c.refused(c.call(c.todo, { op: "reopen", ref: `ZIF-${bySystem}` }))).toBe("conflict");
    expect(await c.status(bySystem)).toBe("answered");
    // A Metric archived since, with nobody listening for the reason, counts too.
    const other = await c.task(); await c.sent(other, c.todo);
    await changeActionState(c.w.id, other, { to: "answered", from: ["open"], reason: "done" }, { type: "app" });
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", c.m.id);
    expect(await c.refused(c.call(c.todo, { op: "reopen", ref: `ZIF-${other}` }))).toBe("conflict");
  });
});

describe("one source of truth: conflicts and echoes", () => {
  it("tells every other Webhook once, marked with the reporting one's id, and the reporting one nothing; the repeat sends nothing", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo, c.planner);
    await c.call(c.todo, { op: "done", ref: `ZIF-${id}` });
    await c.call(c.todo, { op: "done", ref: `ZIF-${id}` });
    const done = await c.rows(id, "action.done");
    expect(done.map((r) => [r.webhook_id, r.source_type, r.source_webhook_id, r.reason])).toEqual([[c.planner.id, "webhook", c.todo.id, "done"]]);
  });

  it("keeps the first of two answers: done in the list, then in Slack, is one event; the other way round too", async () => {
    const c = await setup();
    const a = await c.task(), b = await c.task();
    await c.sent(a, c.todo); await c.sent(b, c.todo);
    await c.call(c.todo, { op: "done", ref: `ZIF-${a}` });
    const slack = await changeActionState(c.w.id, a, { to: "answered", from: ["open"], reason: "done", guard: { assigneeId: c.ann } }, { type: "slack" });
    expect(slack.changed).toBe(false);
    expect((await c.rows(a, "action.done")).every((r) => r.source_type === "webhook")).toBe(true);
    expect((await c.rows(a, "action.done")).map((r) => r.webhook_id)).toEqual([c.planner.id]);
    await changeActionState(c.w.id, b, { to: "answered", from: ["open"], reason: "done", guard: { assigneeId: c.ann } }, { type: "slack" });
    expect(await c.call(c.todo, { op: "done", ref: `ZIF-${b}` })).toEqual({ changed: false, status: "answered" });
    expect((await c.rows(b, "action.done")).every((r) => r.source_type === "slack")).toBe(true);
    expect((await c.rows(b, "action.done")).length).toBe(2);
  });

  it("two identical calls at once change the Action once", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo);
    const results = await Promise.all([1, 2, 3, 4].map(() => c.call(c.todo, { op: "done", ref: `ZIF-${id}` })));
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(await c.rows(id, "action.done")).toHaveLength(1);
  });

  it("closes through closeActions without letting a Webhook undo it", async () => {
    const c = await setup();
    const id = await c.task(); await c.sent(id, c.todo);
    expect(await closeActions(c.w.id, { metricId: c.m.id }, { type: "system" }, "metric_archived")).toBe(1);
    expect(await c.call(c.todo, { op: "done", ref: `ZIF-${id}` })).toEqual({ changed: false, status: "closed" });
    expect(await c.refused(c.call(c.todo, { op: "reopen", ref: `ZIF-${id}` }))).toBe(null);
    expect(await c.status(id)).toBe("closed");
  });
});

describe.skipIf(!openssl)("the next message carries only the links its own Webhook made", () => {
  it("returns external_ids to the Webhook that linked them, and none of another's", async () => {
    const c = await setup(["action.done"]);
    const id = await c.task(); await c.sent(id, c.todo, c.planner);
    const ref = `ZIF-${id}`;
    await c.call(c.todo, { op: "link", ref, system: "microsoft-todo", external_id: "TODO-1", url: "https://to-do.example.test/1" });
    await c.call(c.todo, { op: "link", ref, system: "planner", external_id: "TODO-PL" });
    await c.call(c.planner, { op: "link", ref, system: "planner", external_id: "PLAN-9" });
    await changeActionState(c.w.id, id, { to: "answered", from: ["open"], reason: "done", guard: { assigneeId: c.ann } }, { type: "slack" });
    await sendWaitingWebhooks(100, scope);
    const to = (path: string) => JSON.parse(seen.find((s) => s.path === path)!.body).data as { external_ids: { system: string; external_id: string; url: string | null }[]; source: unknown };
    expect(to("/todo").external_ids).toEqual([{ system: "microsoft-todo", external_id: "TODO-1", url: "https://to-do.example.test/1" }, { system: "planner", external_id: "TODO-PL", url: null }]);
    expect(to("/planner").external_ids).toEqual([{ system: "planner", external_id: "PLAN-9", url: null }]);
    expect(seen.find((s) => s.path === "/planner")!.body).not.toContain("TODO-1");
  });

  it("sends the Webhook's own change to the other Webhook, marked with its id, and nothing back to itself", async () => {
    const c = await setup(["action.done"]);
    const id = await c.task(); await c.sent(id, c.todo, c.planner);
    await c.call(c.todo, { op: "link", ref: `ZIF-${id}`, system: "microsoft-todo", external_id: "T-1" });
    await c.call(c.planner, { op: "link", ref: `ZIF-${id}`, system: "planner", external_id: "P-1" });
    await c.call(c.todo, { op: "done", ref: `ZIF-${id}` });
    await sendWaitingWebhooks(100, scope);
    expect(seen.map((s) => s.path)).toEqual(["/planner"]);
    const msg = JSON.parse(seen[0].body).data;
    expect(msg.source).toEqual({ type: "webhook", webhook_id: c.todo.id });
    expect(msg.external_ids).toEqual([{ system: "planner", external_id: "P-1", url: null }]);
  });
});

describe("a Personal Webhook's status back, as its person", () => {
  /** The Workspace of `setup` with the switch on and Ann's own Webhook; Bo is another Member who sees the Metric. */
  async function personal() {
    const c = await setup();
    const bo = await c.w.person("member"); await c.w.share(c.m.id, bo);
    await setPersonalWebhooksAllowed(c.a, true);
    const A = c.w.actor(c.ann, "member");
    const mine = await createPersonalWebhook(A, { name: "My Tasks", url: `https://localhost:${port}/mine`, events: ["action.created"] });
    const theirs = await createPersonalWebhook(c.w.actor(bo, "member"), { name: "Bo's", url: `https://localhost:${port}/bo`, events: ["action.created"] });
    const forBo = () => ask(c.a, { metricId: c.m.id, period: "2026-10-01", assigneeId: bo, text: "Bo's report", kind: "task" });
    return { ...c, bo, A, mine, theirs, forBo };
  }
  const authors = async (id: number) => openRows("thread_messages", scope, ((await db().from("thread_messages").select("id, author_id, via, body").eq("action_id", id).order("id")).data ?? []) as Record<string, unknown>[]);

  it("marks a task done as the person, with the Webhook named in the Thread and the Audit Log, and the event marked as its", async () => {
    const c = await personal();
    const id = await c.task(); await c.sent(id, c.mine);
    expect(await c.call(c.mine, { op: "done", ref: `ZIF-${id}` })).toEqual({ changed: true, status: "answered" });
    expect(await c.call(c.mine, { op: "done", ref: `ZIF-${id}` })).toEqual({ changed: false, status: "answered" });
    expect(await authors(id)).toMatchObject([{ author_id: c.ann, via: "My Tasks", body: "Marked done in My Tasks" }]);
    expect((await c.rows(id, "action.done")).map((r) => [r.source_type, r.source_webhook_id])).toContainEqual(["webhook", c.mine.id]);
    const { data: log } = await db().from("audit_events").select("object_id, actor_name").eq("workspace_id", c.w.id).eq("kind", "webhook.marked_done");
    expect(log).toEqual([{ object_id: c.mine.id, actor_name: "Webhook My Tasks" }]);
  });

  it("links, replies, answers and reopens for the person's own Actions sent to it", async () => {
    const c = await personal();
    const id = await c.task(); await c.sent(id, c.mine);
    expect(await c.call(c.mine, { op: "link", ref: `ZIF-${id}`, system: "todo", external_id: "T-1" })).toMatchObject({ changed: true });
    expect(await c.call(c.mine, { op: "reply", system: "todo", external_id: "T-1", text: "Working on it" })).toMatchObject({ changed: true, status: "open" });
    await c.call(c.mine, { op: "done", ref: `ZIF-${id}` });
    expect(await c.call(c.mine, { op: "reopen", ref: `ZIF-${id}` })).toEqual({ changed: true, status: "open" });
    const q = await c.task("question"); await c.sent(q, c.mine);
    expect(await c.call(c.mine, { op: "answer", ref: `ZIF-${q}`, text: "Yes" })).toMatchObject({ changed: true });
    expect((await authors(q)).every((m) => m.author_id === c.ann)).toBe(true);
  });

  it("answers another person's Action, and one that was never sent to this Webhook, like an unknown one", async () => {
    const c = await personal();
    const bos = await c.forBo(); await c.sent(bos, c.mine, c.theirs);
    expect(await c.refused(c.call(c.mine, { op: "done", ref: `ZIF-${bos}` }))).toBe("not_found");
    expect(await c.refused(c.call(c.mine, { op: "reply", ref: `ZIF-${bos}`, text: "hi" }))).toBe("not_found");
    expect(await c.refused(c.call(c.mine, { op: "link", ref: `ZIF-${bos}`, system: "todo", external_id: "B-1" }))).toBe("not_found");
    const unsent = await c.task();
    expect(await c.refused(c.call(c.mine, { op: "done", ref: `ZIF-${unsent}` }))).toBe("not_found");
    // Sent to the person's Workspace Webhook only, not to this one.
    await c.sent(unsent, c.todo);
    expect(await c.refused(c.call(c.mine, { op: "done", ref: `ZIF-${unsent}` }))).toBe("not_found");
    expect(await c.status(bos)).toBe("open"); expect(await c.status(unsent)).toBe("open");
  });

  it("lets the person who only asked reply, but not finish or answer for the assignee", async () => {
    const c = await personal();
    const id = await ask(c.w.actor(c.ann, "member"), { metricId: c.m.id, period: "2026-10-01", assigneeId: c.bo, text: "Please", kind: "task" });
    await c.sent(id, c.mine);
    expect(await c.call(c.mine, { op: "reply", ref: `ZIF-${id}`, text: "Thanks" })).toMatchObject({ changed: true });
    expect(await c.refused(c.call(c.mine, { op: "done", ref: `ZIF-${id}` }))).toBe("not_found");
    expect(await c.status(id)).toBe("open");
  });

  it("stops at once for a person demoted to Guest, a Metric they no longer see, and the switch off", async () => {
    const c = await personal();
    const id = await c.task(); await c.sent(id, c.mine);
    await c.w.unshare(c.m.id, c.ann);
    expect(await c.refused(c.call(c.mine, { op: "done", ref: `ZIF-${id}` }))).toBe("not_found");
    await c.w.share(c.m.id, c.ann);
    const p = { op: "done", ref: `ZIF-${id}` };
    expect(await c.call(c.mine, p)).toMatchObject({ changed: true });
    // The switch off: nothing is taken, even with a good signature.
    await setPersonalWebhooksAllowed(c.a, false);
    expect(await authenticateWebhookRequest(c.mine.id, signed(c.mine.secret, { op: "reopen", ref: `ZIF-${id}` }))).toEqual({ ok: false, why: "no_such" });
    await setPersonalWebhooksAllowed(c.a, true);
    // A person made a Guest has no Personal Webhook any more (and the role is judged again at every request besides).
    await c.w.setRole(c.ann, "guest");
    expect(await authenticateWebhookRequest(c.mine.id, signed(c.mine.secret, { op: "reopen", ref: `ZIF-${id}` }))).toEqual({ ok: false, why: "no_such" });
    expect(await c.status(id)).toBe("answered");
  });

  it("answers the Webhook switched off like an unknown id, and takes a request once", async () => {
    const c = await personal();
    const id = await c.task(); await c.sent(id, c.mine);
    const req = signed(c.mine.secret, { op: "done", ref: `ZIF-${id}` });
    expect(await authenticateWebhookRequest(c.mine.id, req)).toMatchObject({ ok: true });
    expect(await authenticateWebhookRequest(c.mine.id, { ...req })).toEqual({ ok: false, why: "not_found" });
    // Bo's secret never signs for Ann's Webhook.
    expect(await authenticateWebhookRequest(c.mine.id, signed(c.theirs.secret, { op: "done", ref: `ZIF-${id}` }))).toEqual({ ok: false, why: "not_found" });
    await setPersonalWebhookEnabled(c.A, c.mine.id, false);
    expect(await authenticateWebhookRequest(c.mine.id, signed(c.mine.secret, { op: "done", ref: `ZIF-${id}` }))).toEqual({ ok: false, why: "no_such" });
  });

  it("keeps markup in a reply as plain text and refuses what only a person's own words decide", async () => {
    const c = await personal();
    const id = await c.task(); await c.sent(id, c.mine);
    const text = `<script>alert(1)</script> <b>hi</b>\u0007`;
    await c.call(c.mine, { op: "reply", ref: `ZIF-${id}`, text });
    expect((await authors(id)).map((m) => m.body)).toEqual(["<script>alert(1)</script> <b>hi</b>"]);
    const approval = await c.w.action({ metric_id: c.m.id, period_start: "2026-10-01", asker_id: c.sara, assignee_id: c.ann, kind: "task", purpose: "approval" });
    await c.sent(approval, c.mine);
    expect(await c.refused(c.call(c.mine, { op: "reply", ref: `ZIF-${approval}`, text: "approved" }))).toBe("conflict");
    expect(await c.refused(c.call(c.mine, { op: "done", ref: `ZIF-${approval}` }))).toBe("conflict");
  });
});
