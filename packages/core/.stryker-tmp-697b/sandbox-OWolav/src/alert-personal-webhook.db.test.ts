// @ts-nocheck
// An Alert that also sends to a Personal Webhook (spec 0037, ticket #644; GLOSSARY: Alert, Personal Webhook): `alert.fired`
// once per crossing, to the person's own Webhook only, judged at send time (the person's sight, the Alert still naming the
// Webhook, the value still meeting its condition), through the real send to a TLS server of the test's own.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type KeyActor } from "./actor";
import { createAlertWithKey, updateAlertWithKey } from "./api-alerts";
import { AlertRefused, alertWebhookChoices, createAlert, listMyAlerts, updateAlert } from "./alerts";
import { db } from "./db";
import { createPersonalWebhook, deletePersonalWebhook, setPersonalWebhooksAllowed } from "./personal-webhooks";
import { hasOpenssl, startReceiver } from "./test/tls-receiver";
import { workspace } from "./test/db-fixtures";
import { JANUARY, periodStart } from "./periods";
import { onValue } from "./workflow-engine";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import { sendWaitingWebhooks } from "./webhook-send";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });
const saved = { key: process.env.ZIFFR_SECRETS_KEY, hosts: process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS };
const cleanups: (() => Promise<void>)[] = [];
let rx: Awaited<ReturnType<typeof startReceiver>>;
beforeAll(async () => { if (hasOpenssl) rx = await startReceiver(); });
afterAll(() => rx?.stop());
beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 85).toString("base64");
  process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = "localhost";
  if (rx) rx.seen.length = 0;
});
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved.key === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved.key;
  if (saved.hosts === undefined) delete process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS; else process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = saved.hosts;
});

const P = (n: number) => `2026-${String(n).padStart(2, "0")}-01`;
const above = (value: string) => ({ kind: "at_or_above" as const, value });
/** Sara owns "Sales" and shares it with Ann, who has a Personal Webhook that hears Alerts. */
async function setup(events: string[] = ["alert.fired"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ann = await w.person("member");
  const m = await w.metric(sara, { name: "Sales" });
  await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: m.id, user_id: ann, role: "viewer" });
  await setPersonalWebhooksAllowed(w.actor(sara), true);
  const A = w.actor(ann, "member");
  const hook = await createPersonalWebhook(A, { name: "Ann's", url: `https://localhost:${rx?.port ?? 1}/mine`, events });
  const put = async (period: string, v: number) => { await w.value(m.id, period, v, sara); await onValue(m.id, period, sara, {}); };
  const sends = async () => ((await db().from("webhook_sends").select("type, state, alert_id, webhook_id").eq("webhook_id", hook.id).order("created_at")).data ?? []);
  return { w, sara, ann, m, A, hook, put, sends };
}

describe("naming a Personal Webhook on an Alert", () => {
  it("takes only the person's own Webhooks, in the same words for another's and one that is not there", async () => {
    const x = await setup();
    const bob = await x.w.person("member");
    await db().from("shares").insert({ workspace_id: x.w.id, object_type: "metric", object_id: x.m.id, user_id: bob, role: "viewer" });
    const B = x.w.actor(bob, "member");
    const theirs = await createPersonalWebhook(B, { name: "Bob's", url: "https://localhost:1/b", events: ["alert.fired"] });
    const err = async (f: () => Promise<unknown>) => (await f().then(() => null, (e: Error) => e));
    const other = await err(() => createAlert(x.A, { metricId: x.m.id, condition: above("100"), webhookIds: [theirs.id] }));
    const none = await err(() => createAlert(x.A, { metricId: x.m.id, condition: above("100"), webhookIds: ["00000000-0000-4000-8000-000000000000"] }));
    expect(other).toBeInstanceOf(Forbidden);
    expect(other?.message).toBe(none?.message);
    expect(await listMyAlerts(x.A)).toEqual([]);
    const id = await createAlert(x.A, { metricId: x.m.id, condition: above("100"), webhookIds: [x.hook.id] });
    expect(await listMyAlerts(x.A)).toEqual([expect.objectContaining({ id, webhookIds: [x.hook.id] })]);
    expect(await err(() => updateAlert(x.A, id, { webhookIds: [theirs.id] }))).toBeInstanceOf(Forbidden);
    expect(await err(() => updateAlert(x.A, id, { webhookIds: [x.hook.id, x.hook.id, x.hook.id, x.hook.id] }))).toBeInstanceOf(AlertRefused);
  });

  it("is never done by a key, and is not offered while the Workspace does not allow Personal Webhooks", async () => {
    const x = await setup();
    const key = { ...x.A, key: { id: "k", scopes: ["alerts:write"] } } as unknown as typeof x.A;
    await expect(createAlert(key, { metricId: x.m.id, condition: above("100"), webhookIds: [x.hook.id] })).rejects.toBeInstanceOf(Forbidden);
    expect(await alertWebhookChoices(x.A)).toEqual([{ id: x.hook.id, name: "Ann's", hearsAlerts: true }]);
    await setPersonalWebhooksAllowed(x.w.actor(x.sara), false);
    expect(await alertWebhookChoices(x.A)).toEqual([]);
  });

  it("cannot be set through a key: the API's closed field list drops it, so a key's Alert names none", async () => {
    const x = await setup();
    const key: KeyActor = { personId: x.ann, workspaceId: x.w.id, role: "member", key: { id: "k", scopes: ["alerts:write", "metrics:read"] } };
    const made = await createAlertWithKey(key, { metric: x.m.slug, condition: above("100"), webhookIds: [x.hook.id] } as never);
    await updateAlertWithKey(key, made.id, { paused: false, webhookIds: [x.hook.id] } as never);
    expect((await listMyAlerts(x.A))[0].webhookIds).toEqual([]);
  });

  it("refuses an Alert on a missing value, which has no value to send", async () => {
    const x = await setup();
    await expect(createAlert(x.A, { metricId: x.m.id, condition: { kind: "missing_after_due" }, webhookIds: [x.hook.id] })).rejects.toBeInstanceOf(AlertRefused);
    const id = await createAlert(x.A, { metricId: x.m.id, condition: above("100"), webhookIds: [x.hook.id] });
    await expect(updateAlert(x.A, id, { condition: { kind: "missing_after_due" } })).rejects.toBeInstanceOf(AlertRefused);
  });

  it("stops naming a Webhook that was deleted", async () => {
    const x = await setup();
    await createAlert(x.A, { metricId: x.m.id, condition: above("100"), webhookIds: [x.hook.id] });
    await deletePersonalWebhook(x.A, x.hook.id);
    expect((await listMyAlerts(x.A))[0].webhookIds).toEqual([]);
  });
});

describe.skipIf(!hasOpenssl)("alert.fired to a Personal Webhook", () => {
  it("sends once per crossing, in full, as the person, and not again while the condition holds", async () => {
    const x = await setup();
    await createAlert(x.A, { metricId: x.m.id, condition: above("100"), webhookIds: [x.hook.id] });
    await x.put(P(1), 90);
    expect(await x.sends()).toEqual([]);
    await x.put(P(2), 120);
    await sendWaitingWebhooks(50, x.w.id);
    expect(rx.seen).toHaveLength(1);
    const body = JSON.parse(rx.seen[0].body);
    expect(body).toMatchObject({ type: "alert.fired", data: { metric: { id: x.m.id, name: "Sales" }, period: P(2), condition: { kind: "at_or_above" } } });
    expect(body.data.value).toContain("120");
    await x.put(P(3), 130);
    await sendWaitingWebhooks(50, x.w.id);
    expect(rx.seen).toHaveLength(1);
    await x.put(P(4), 80);
    await x.put(P(5), 150);
    await sendWaitingWebhooks(50, x.w.id);
    expect(rx.seen).toHaveLength(2);
  });

  it("sends nothing for an Alert that does not name the Webhook, or to a Webhook that did not choose the event", async () => {
    const x = await setup();
    await createAlert(x.A, { metricId: x.m.id, condition: above("100") });
    await x.put(P(2), 120);
    expect(await x.sends()).toEqual([]);
    const y = await setup(["action.created"]);
    await createAlert(y.A, { metricId: y.m.id, condition: above("100"), webhookIds: [y.hook.id] });
    await y.put(P(2), 120);
    expect(await y.sends()).toEqual([]);
  });

  it("leaves a teammate's Webhook out: only the Alert's own person's Webhook is written to, even if its id is forced in", async () => {
    const x = await setup();
    const bob = await x.w.person("member");
    await db().from("shares").insert({ workspace_id: x.w.id, object_type: "metric", object_id: x.m.id, user_id: bob, role: "viewer" });
    const theirs = await createPersonalWebhook(x.w.actor(bob, "member"), { name: "Bob's", url: `https://localhost:${rx.port}/b`, events: ["alert.fired"] });
    const id = await createAlert(x.A, { metricId: x.m.id, condition: above("100") });
    // Forced in past the core, as a faulty write would.
    await db().from("alerts").update({ webhook_ids: [theirs.id] }).eq("id", id);
    await x.put(P(2), 120);
    await sendWaitingWebhooks(50, x.w.id);
    expect(rx.seen).toHaveLength(0);
    expect((await db().from("webhook_sends").select("id").eq("webhook_id", theirs.id)).data).toEqual([]);
  });

  it("drops a queued send when the person lost sight of the Metric, the Alert was paused or no longer names it, or the value no longer meets it", async () => {
    const x = await setup();
    const id = await createAlert(x.A, { metricId: x.m.id, condition: above("100"), webhookIds: [x.hook.id] });
    const fire = async () => { await db().from("webhook_sends").delete().eq("webhook_id", x.hook.id); await db().from("alerts").update({ state: "armed", fired_period: null }).eq("id", id); await x.put(P(2), 120); };
    // Sight lost between the crossing and the send.
    await fire();
    expect(await x.sends()).toHaveLength(1);
    await db().from("shares").delete().eq("workspace_id", x.w.id).eq("object_id", x.m.id).eq("user_id", x.ann);
    await sendWaitingWebhooks(50, x.w.id);
    expect(rx.seen).toHaveLength(0);
    expect(await x.sends()).toEqual([]);
    await db().from("shares").insert({ workspace_id: x.w.id, object_type: "metric", object_id: x.m.id, user_id: x.ann, role: "viewer" });
    await db().from("alerts").update({ paused: null, no_access_since: null }).eq("id", id);
    // Paused by the person between the crossing and the send.
    await fire();
    await db().from("alerts").update({ paused_by_person: true }).eq("id", id);
    await sendWaitingWebhooks(50, x.w.id);
    expect(rx.seen).toHaveLength(0);
    await db().from("alerts").update({ paused_by_person: false }).eq("id", id);
    // No longer naming it.
    await fire();
    await db().from("alerts").update({ webhook_ids: [] }).eq("id", id);
    await sendWaitingWebhooks(50, x.w.id);
    expect(rx.seen).toHaveLength(0);
    await db().from("alerts").update({ webhook_ids: [x.hook.id] }).eq("id", id);
    // The value corrected below the level meanwhile.
    await fire();
    await x.w.value(x.m.id, P(2), 50, x.sara);
    await sendWaitingWebhooks(50, x.w.id);
    expect(rx.seen).toHaveLength(0);
  });

  it("never sends the waiting value of a Derived Metric, not even to its owner who asked for such values", async () => {
    const x = await setup();
    const ada = await x.w.person("admin");
    const flow = await saveWorkflow(x.w.actor(x.sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ada], values: "every" }, { type: "publish", lock: false }] });
    const input = await x.w.metric(x.sara, { name: "Input" });
    await setMetricWorkflow(x.w.actor(x.sara), input.id, flow);
    await db().from("shares").insert({ workspace_id: x.w.id, object_type: "metric", object_id: input.id, user_id: x.ann, role: "viewer" });
    // Ann owns the Derived Metric but neither owns nor approves its waiting input.
    const derived = await x.w.metric(x.ann, { name: "Doubled", formula: `{${input.slug}} * 2` });
    await createAlert(x.A, { metricId: derived.id, condition: above("10"), includeUnapproved: true, webhookIds: [x.hook.id] });
    const period = periodStart(new Date(), "month", JANUARY);
    await x.w.value(input.id, period, 50, x.sara);
    await onValue(input.id, period, x.sara, {});
    await sendWaitingWebhooks(50, x.w.id);
    expect(rx.seen).toHaveLength(0);
  });

  it("does not announce a crossing the Alert no longer holds: an edited condition arms it again", async () => {
    const x = await setup();
    const id = await createAlert(x.A, { metricId: x.m.id, condition: above("100"), webhookIds: [x.hook.id] });
    await x.put(P(2), 120);
    await updateAlert(x.A, id, { condition: above("110") });
    await sendWaitingWebhooks(50, x.w.id);
    expect(rx.seen).toHaveLength(0);
  });

  it("sends only while the Workspace allows Personal Webhooks", async () => {
    const x = await setup();
    await createAlert(x.A, { metricId: x.m.id, condition: above("100"), webhookIds: [x.hook.id] });
    await setPersonalWebhooksAllowed(x.w.actor(x.sara), false);
    await x.put(P(2), 120);
    expect(await x.sends()).toEqual([]);
  });
});
