// @ts-nocheck
// Firing Alerts against the real database (spec 0032, ticket #374; GLOSSARY: Alert, Import, Delivery): once per crossing,
// re-armed when false again, approved-only against including values not approved yet, silent Imports, a person who
// lost sight, "not in by its Due Date" on the day after, the daily limits also under parallel values, a Derived Metric,
// and a reply to an Alert message, which records nothing.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ALERT_MESSAGES_PER_PERSON_PER_DAY } from "./alert-limits";
import { checkAlerts, ALERT_LIMIT_NOTE } from "./alert-firing";
import type { AlertCondition } from "./alert-rules";
import { createAlert, listMyAlerts, refreshAlertSight } from "./alerts";
import { sendWaiting } from "./mail";
import { deliverPrompt } from "./deliveries";
import { optOutByToken, unsubscribeIsAlert } from "./email-opt-out";
import { db } from "./db";
import { connectorsView } from "./page-data";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { routeReply, type ReplyChannel } from "./reply-routing";
import { workspace, opened } from "./test/db-fixtures";
import { dueDate, workingPeriod } from "./workflow-rules";
import { approve, onValue, runWorkflows } from "./workflow-engine";
import { saveWorkflow, setMetricWorkflow } from "./workflows";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
type W = Awaited<ReturnType<typeof ws>>;
const above = (value: string): AlertCondition => ({ kind: "at_or_above", value });
const P = (n: number) => `2026-${String(n).padStart(2, "0")}-01`;
const share = async (w: W, metricId: number, userId: string) => { await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: metricId, user_id: userId, role: "viewer" }); };
/** A value as the core takes it: recorded, then handed to onValue as the submit path does. */
const put = async (w: W, metricId: number, period: string, v: number, by: string, opts: { imported?: boolean } = {}) => { await w.value(metricId, period, v, by); await onValue(metricId, period, by, opts); };
/** The Alert messages a person was sent, oldest first, as the Outbox holds them (opened). */
async function messages(w: W, person: string) {
  const { data } = await db().from("deliveries").select("id, kind, subject, body, connector, sender_id, action_id, prompt_id, reply_token, workspace_id, recipient_id, mail_state").eq("workspace_id", w.id).eq("recipient_id", person).eq("kind", "alert").order("id");
  return opened("deliveries", w.id, data);
}
/** Sara owns "Sales" and submits; Ann sees it through a Share. */
async function setup(over: Record<string, unknown> = {}) {
  const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
  const m = await w.metric(sara, { name: "Sales", ...over }); await share(w, m.id, ann);
  return { w, sara, ann, m, a: w.actor(ann, "member") };
}

describe("once per crossing", () => {
  it("tells once when the level is reached, stays quiet while it holds, and again after it was false", async () => {
    const { w, sara, ann, m, a } = await setup();
    const other = await w.metric(sara, { name: "Secret" }); await w.value(other.id, P(2), 777, sara);
    await createAlert(a, { metricId: m.id, condition: above("100") });
    await put(w, m.id, P(1), 90, sara);
    expect(await messages(w, ann)).toHaveLength(0);
    await put(w, m.id, P(2), 120, sara);
    const first = await messages(w, ann);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ sender_id: null, action_id: null, prompt_id: null });
    // Name, value, period and a link to the Metric's page: nothing of another Metric.
    expect(first[0].body).toContain("Sales reached 100");
    expect(first[0].body).toContain("120");
    expect(first[0].body).toMatch(/\/metrics\/m-/);
    expect(first[0].body).not.toMatch(/\b777\b/);
    expect(await listMyAlerts(a)).toEqual([expect.objectContaining({ state: "fired" })]);
    await put(w, m.id, P(3), 130, sara);
    expect(await messages(w, ann)).toHaveLength(1);
    // Below again re-arms without a message; the next crossing tells again.
    await put(w, m.id, P(4), 80, sara);
    expect(await messages(w, ann)).toHaveLength(1);
    expect(await listMyAlerts(a)).toEqual([expect.objectContaining({ state: "armed" })]);
    await put(w, m.id, P(5), 150, sara);
    expect(await messages(w, ann)).toHaveLength(2);
  });

  it("sends one message when two values arrive at once", async () => {
    const { w, sara, ann, m, a } = await setup();
    await createAlert(a, { metricId: m.id, condition: above("100") });
    await w.value(m.id, P(3), 200, sara);
    await Promise.all([checkAlerts(m.id), checkAlerts(m.id), checkAlerts(m.id)]);
    expect(await messages(w, ann)).toHaveLength(1);
  });

  it("looks only at the latest period: a value for an older one fires nothing", async () => {
    const { w, sara, ann, m, a } = await setup();
    await put(w, m.id, P(5), 10, sara);
    await createAlert(a, { metricId: m.id, condition: above("100") });
    await put(w, m.id, P(2), 500, sara);
    expect(await messages(w, ann)).toHaveLength(0);
  });

  it("fires a per-period change once per period and tells the change", async () => {
    const { w, sara, ann, m, a } = await setup();
    await createAlert(a, { metricId: m.id, condition: { kind: "changed_more", share: "20" } });
    await put(w, m.id, P(1), 100, sara);
    await put(w, m.id, P(2), 130, sara);
    const [msg] = await messages(w, ann);
    expect(msg.body).toMatch(/Sales changed more than 20[.,0]* %: up 30[.,0]* % on /);
    // A Correction in the same period that is still beyond does not tell again; the next period may.
    await put(w, m.id, P(2), 150, sara);
    expect(await messages(w, ann)).toHaveLength(1);
    await put(w, m.id, P(3), 300, sara);
    expect(await messages(w, ann)).toHaveLength(2);
  });

  it("tells a share of target in the Metric's own words", async () => {
    const { w, sara, ann, m, a } = await setup({ target_min: 50000 });
    await createAlert(a, { metricId: m.id, condition: { kind: "share_of_target", share: "80" } });
    await put(w, m.id, P(1), 41000, sara);
    const [msg] = await messages(w, ann);
    expect(msg.body).toMatch(/Sales reached 82[.,0]* % of its target: 41,000 of 50,000 for /);
  });

  it("fires a Derived Metric's Alert when an input changes it", async () => {
    const { w, sara, ann, m } = await setup();
    const d = await w.metric(sara, { name: "Double", formula: `{${m.slug}} * 2` }); await share(w, d.id, ann);
    await createAlert(w.actor(ann, "member"), { metricId: d.id, condition: above("100") });
    await put(w, m.id, P(1), 60, sara);
    const [msg] = await messages(w, ann);
    expect(msg.body).toContain("Double reached 100");
    expect(msg.body).toContain("120");
  });
});

describe("approved values only, unless asked", () => {
  it("waits for Approval for an Alert and tells an Alert that includes values not approved yet at once", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ada = await w.person("admin"); const ann = await w.person("member");
    const flow = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ada], values: "every" }, { type: "publish", lock: false }] });
    const m = await w.metric(sara, { name: "Revenue" }); await setMetricWorkflow(w.actor(sara), m.id, flow); await share(w, m.id, ann);
    const a = w.actor(ann, "member");
    await createAlert(a, { metricId: m.id, condition: above("100") });
    const eager = w.actor(ann, "member");
    await createAlert(eager, { metricId: m.id, condition: above("100"), includeUnapproved: true });
    const period = periodStart(new Date(), "month", JANUARY);
    await put(w, m.id, period, 500, sara);
    // Only the Alert that asked for it has been told, and the message says so.
    const early = await messages(w, ann);
    expect(early).toHaveLength(1);
    expect(early[0].body).toContain("Not approved yet");
    const task = (await db().from("actions").select("id").eq("metric_id", m.id).eq("purpose", "approval").eq("status", "open").single()).data!;
    await approve(w.id, task.id as number, ada);
    const after = await messages(w, ann);
    expect(after).toHaveLength(2);
    expect(after[1].body).not.toContain("Not approved yet");
    const states = (await listMyAlerts(a)).map((x) => x.state);
    expect(states).toEqual(["fired", "fired"]);
  });
});

describe("Imports are silent", () => {
  it("fires nothing for an Import and lets the next real value behave", async () => {
    const { w, sara, ann, m, a } = await setup();
    await createAlert(a, { metricId: m.id, condition: above("100") });
    await put(w, m.id, P(1), 500, sara, { imported: true });
    expect(await messages(w, ann)).toHaveLength(0);
    // The Alert was brought up to date: the level holds, so it is fired and quiet until it was false again.
    expect(await listMyAlerts(a)).toEqual([expect.objectContaining({ state: "fired" })]);
    await put(w, m.id, P(2), 600, sara);
    expect(await messages(w, ann)).toHaveLength(0);
    await put(w, m.id, P(3), 50, sara);
    await put(w, m.id, P(4), 120, sara);
    expect(await messages(w, ann)).toHaveLength(1);
  });

  it("is the same through a Feed's history", async () => {
    const { w, sara, ann, m, a } = await setup();
    await createAlert(a, { metricId: m.id, condition: above("100") });
    for (const [i, v] of [10, 200, 300].entries()) await put(w, m.id, P(i + 1), v, sara, { imported: true });
    expect(await messages(w, ann)).toHaveLength(0);
  });
});

describe("sight", () => {
  it("sends nothing, and says nothing, to a person who lost sight; sight returning resumes it silently", async () => {
    const { w, sara, ann, m, a } = await setup();
    await createAlert(a, { metricId: m.id, condition: above("100") });
    await db().from("shares").delete().eq("workspace_id", w.id).eq("user_id", ann);
    await put(w, m.id, P(1), 120, sara);
    expect(await messages(w, ann)).toHaveLength(0);
    expect(await listMyAlerts(a)).toEqual([]);
    expect((await db().from("alerts").select("paused").eq("metric_id", m.id).single()).data?.paused).toBe("no_access");
    // Sight returns: brought up to date without a message (the level holds now), then it behaves.
    await share(w, m.id, ann);
    expect(await refreshAlertSight(w.id)).toMatchObject({ resumed: 1 });
    expect(await messages(w, ann)).toHaveLength(0);
    expect(await listMyAlerts(a)).toEqual([expect.objectContaining({ state: "fired", paused: null })]);
    await put(w, m.id, P(2), 80, sara);
    await put(w, m.id, P(3), 150, sara);
    expect(await messages(w, ann)).toHaveLength(1);
  });

  it("takes an Alert message from the Outbox, with any reason it was held, once the person lost sight", async () => {
    const { w, sara, ann, m, a } = await setup();
    await createAlert(a, { metricId: m.id, condition: above("100") });
    await put(w, m.id, P(1), 120, sara);
    expect((await connectorsView(a)).deliveries.filter((d) => d.kind === "alert")).toHaveLength(1);
    await db().from("deliveries").update({ status: "failed", last_error: "Not sent." }).eq("workspace_id", w.id).eq("recipient_id", ann);
    await db().from("shares").delete().eq("workspace_id", w.id).eq("user_id", ann);
    expect((await connectorsView(a)).deliveries.filter((d) => d.kind === "alert")).toHaveLength(0);
  });

  it("is quiet for a Metric made private for the person", async () => {
    const { w, sara, ann, m, a } = await setup();
    await createAlert(a, { metricId: m.id, condition: above("100") });
    await db().from("shares").delete().eq("workspace_id", w.id).eq("object_id", m.id);
    await put(w, m.id, P(1), 120, sara);
    expect(await messages(w, ann)).toHaveLength(0);
  });
});

describe("not in by its Due Date", () => {
  it("fires once on the day after the Due Date, however often the job runs, and not when the value came", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const config = { dueWorkingDays: 2, steps: [] };
    const flow = await saveWorkflow(w.actor(sara), null, "Close", config);
    const missing = await w.metric(sara, { name: "Missing" }); const there = await w.metric(sara, { name: "There" });
    for (const m of [missing, there]) { await setMetricWorkflow(w.actor(sara), m.id, flow); await share(w, m.id, ann); }
    const a = w.actor(ann, "member");
    await createAlert(a, { metricId: missing.id, condition: { kind: "missing_after_due" } });
    await createAlert(a, { metricId: there.id, condition: { kind: "missing_after_due" } });
    const period = workingPeriod("2026-11-20", "month", JANUARY);
    const due = dueDate(period, "month", config as never);
    await w.value(there.id, period, 5, sara);
    await runWorkflows(w.id, due, sara);
    expect(await messages(w, ann)).toHaveLength(0);
    const day = shiftPeriod(due, "day", 1);
    await runWorkflows(w.id, day, sara);
    await runWorkflows(w.id, day, sara);
    await runWorkflows(w.id, shiftPeriod(day, "day", 1), sara);
    const got = await messages(w, ann);
    expect(got).toHaveLength(1);
    expect(got[0].body).toMatch(/^No value yet for Missing, .*It was due on /);
  });
});

describe("limits", () => {
  it("claims the day's messages atomically: the limit, one note, then nothing, also when claimed at once", async () => {
    const w = await ws(); const ann = await w.person("member");
    const day = new Date().toISOString().slice(0, 10);
    const claim = async (person: string, perPerson: number, perWorkspace: number) => (await db().rpc("claim_alert_message", { p_ws: w.id, p_person: person, p_day: day, p_per_person: perPerson, p_per_workspace: perWorkspace })).data as string;
    const got = await Promise.all(Array.from({ length: 26 }, () => claim(ann, ALERT_MESSAGES_PER_PERSON_PER_DAY, 2000)));
    expect(got.filter((x) => x === "send")).toHaveLength(ALERT_MESSAGES_PER_PERSON_PER_DAY);
    expect(got.filter((x) => x === "note")).toHaveLength(1);
    expect(got.filter((x) => x === "none")).toHaveLength(26 - ALERT_MESSAGES_PER_PERSON_PER_DAY - 1);
    // The Workspace's own limit holds across people, with counts only.
    const [b, c, d] = [await w.person("member"), await w.person("member"), await w.person("member")];
    const wide = await Promise.all([b, c, d, b, c, d].map((p) => claim(p, 20, 3 + ALERT_MESSAGES_PER_PERSON_PER_DAY)));
    expect(wide.filter((x) => x === "send")).toHaveLength(3);
    const { data } = await db().from("alert_day_counts").select("sent, over").eq("workspace_id", w.id).eq("person_id", "").single();
    expect(data).toEqual({ sent: ALERT_MESSAGES_PER_PERSON_PER_DAY + 3, over: 3 });
  });

  it("turns the 21st message of a day into one last note and fires the rest into the list only", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member"); const a = w.actor(ann, "member");
    const metrics = [];
    for (let i = 0; i < 4; i++) {
      const m = await w.metric(sara, { name: `M${i}` }); await share(w, m.id, ann); metrics.push(m);
      // Five Alerts at different levels, all true at 1,000 and all false at 1.
      for (let k = 0; k < 5; k++) await createAlert(a, { metricId: m.id, condition: above(String(10 + k)) });
    }
    for (const [period, v] of [[P(1), 1000], [P(2), 1], [P(3), 1000]] as const) for (const m of metrics) await put(w, m.id, period, v, sara);
    const got = await messages(w, ann);
    expect(got).toHaveLength(ALERT_MESSAGES_PER_PERSON_PER_DAY + 1);
    expect(got.slice(0, ALERT_MESSAGES_PER_PERSON_PER_DAY).every((x) => !String(x.body).includes(ALERT_LIMIT_NOTE))).toBe(true);
    expect(got[ALERT_MESSAGES_PER_PERSON_PER_DAY].body).toContain(ALERT_LIMIT_NOTE);
    expect((await listMyAlerts(a)).every((x) => x.state === "fired" && x.firedAt)).toBe(true);
  });
});

describe("never answerable", () => {
  it("records nothing and makes no Thread for a reply on any Connector", async () => {
    const { w, sara, ann, m, a } = await setup({ sources: ["web_form", "slack", "mail", "telegram"] });
    await w.token(m.id, ann);
    await createAlert(a, { metricId: m.id, condition: above("100") });
    await put(w, m.id, P(1), 120, sara);
    const [d] = await messages(w, ann);
    expect(d.reply_token).toBeNull();
    const before = (await db().from("observations").select("id", { count: "exact", head: true }).eq("metric_id", m.id)).count;
    for (const source of ["mail", "slack", "telegram"] as const) {
      const answer = vi.fn(async () => {});
      const via: ReplyChannel = { source, sender: "x", provenPersonId: ann, answer };
      expect(await routeReply({ id: d.id as number, workspace_id: w.id, recipient_id: ann, kind: "alert", action_id: null, prompt_id: null }, "42", via)).toBe("refused");
      expect(answer).toHaveBeenCalledWith("Not recorded", expect.stringMatching(/cannot be answered/));
    }
    expect((await db().from("observations").select("id", { count: "exact", head: true }).eq("metric_id", m.id)).count).toBe(before);
    expect((await db().from("actions").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count).toBe(0);
    expect((await db().from("thread_messages").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count).toBe(0);
  });

  it("keeps other people's Alerts from pushing a person's own messages out of the Outbox", async () => {
    const { w, sara, ann, m, a } = await setup();
    await createAlert(a, { metricId: m.id, condition: above("100") });
    await put(w, m.id, P(1), 120, sara);
    await db().from("deliveries").insert(Array.from({ length: 100 }, (_, i) => ({ workspace_id: w.id, connector: "email", recipient_id: sara, sender_id: null, kind: "alert", subject: `s${i}`, body: "b", mail_state: "outbox" })));
    expect((await connectorsView(a)).deliveries.filter((d) => d.recipient_id === ann)).toHaveLength(1);
  });

  it("is in the Outbox of its recipient only", async () => {
    const { w, sara, m, a } = await setup();
    await createAlert(a, { metricId: m.id, condition: above("100") });
    await put(w, m.id, P(1), 120, sara);
    expect((await connectorsView(a)).deliveries.filter((d) => d.kind === "alert")).toHaveLength(1);
    expect((await connectorsView(w.actor(sara))).deliveries.filter((d) => d.kind === "alert")).toHaveLength(0);
  });
});

describe("mail", () => {
  const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test", ZIFFR_INBOUND_DOMAIN: "in.ziffr.example.test", ZIFFR_INBOUND_SECRET: "i".repeat(40) };
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
  afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });

  it("sends a queued Alert by email with no reply address, and not at all once the person lost sight", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member", { email: `ann-${Math.random().toString(36).slice(2, 8)}@example.test` });
    const m = await w.metric(sara, { name: "Sales" }); await share(w, m.id, ann);
    await createAlert(w.actor(ann, "member"), { metricId: m.id, condition: above("100") });
    await put(w, m.id, P(1), 120, sara);
    const [queued] = await messages(w, ann);
    expect(queued).toMatchObject({ connector: "email", mail_state: "queued" });
    await sendWaiting();
    expect((await messages(w, ann))[0]).toMatchObject({ mail_state: "sent", reply_token: null });
    // A message that waits in the queue is checked again as it leaves.
    await put(w, m.id, P(2), 50, sara);
    await put(w, m.id, P(3), 150, sara);
    expect((await messages(w, ann))[1]).toMatchObject({ mail_state: "queued" });
    await db().from("shares").delete().eq("workspace_id", w.id).eq("user_id", ann);
    await sendWaiting();
    expect((await messages(w, ann))[1]).toMatchObject({ mail_state: "failed" });
  });

  it("sends Prompts before a long queue of Alert mail, and keeps Alert mail to its share of the day", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member", { email: `ann-${Math.random().toString(36).slice(2, 8)}@example.test` });
    const m = await w.metric(sara, { name: "Sales" }); await share(w, m.id, ann); await w.token(m.id, ann);
    const rows = Array.from({ length: 60 }, (_, i) => ({ workspace_id: w.id, connector: "email", recipient_id: ann, sender_id: null, kind: "alert", subject: `a${i}`, body: "b", mail_state: "queued", alert_metric_id: m.id }));
    await db().from("deliveries").insert(rows);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, queue: true });
    await sendWaiting(50);
    const { data: prompt } = await db().from("deliveries").select("mail_state").eq("workspace_id", w.id).eq("kind", "prompt").single();
    expect(prompt?.mail_state).toBe("sent");
    // Past the Alert share a queued Alert waits, while a Prompt still goes.
    const claim = async (kind: string) => {
      const { data: d } = await db().from("deliveries").select("id").eq("workspace_id", w.id).eq("kind", kind).eq("mail_state", "queued").limit(1).single();
      const r = await db().rpc("claim_delivery_send", { p_id: d!.id, p_address_key: "a".repeat(64), p_per_workspace: 500, p_per_address: 500, p_per_sender: 500, p_max_attempts: 5, p_alerts_per_workspace: 0 });
      if (r.error) throw new Error(r.error.message);
      return r.data;
    };
    expect(await claim("alert")).toBe("wait");
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, queue: true });
    expect(await claim("prompt")).toBe("ok");
  });

  it("pauses that Alert only with the one-click link in its email", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member", { email: `ann-${Math.random().toString(36).slice(2, 8)}@example.test` });
    const m = await w.metric(sara, { name: "Sales" }); await share(w, m.id, ann);
    const a = w.actor(ann, "member");
    const one = await createAlert(a, { metricId: m.id, condition: above("100") });
    await createAlert(a, { metricId: m.id, condition: above("200") });
    await put(w, m.id, P(1), 120, sara);
    await sendWaiting();
    const { data: d } = await db().from("deliveries").select("unsubscribe_token, body, alert_id").eq("workspace_id", w.id).eq("kind", "alert").single();
    expect(d).toMatchObject({ alert_id: one, unsubscribe_token: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/) });
    expect(await unsubscribeIsAlert(d!.unsubscribe_token as string)).toBe(true);
    expect(await optOutByToken(d!.unsubscribe_token as string)).toBe(true);
    expect((await listMyAlerts(a)).map((x) => [x.id, x.pausedByPerson]).sort()).toEqual([[one, true], [one + 1, false]].sort());
    expect((await db().from("email_opt_outs").select("person_id").eq("workspace_id", w.id)).data).toEqual([]);
    expect(await optOutByToken("x".repeat(32))).toBe(false);
  });
});
