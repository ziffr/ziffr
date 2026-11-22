// What a Trial Workspace really sends, against the real database and the local Mailpit (spec 0021, ticket 3, ADR
// 0010): only to people who accepted (never a Contact), nothing once it has ended, at most 100 a day over all Connectors, and at most 25 Metrics.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { deliverNotice, deliverPrompt } from "./deliveries";
import { sendDelivery } from "./mail";
import { createMetric } from "./metrics";
import { sendSlackDelivery } from "./slack-send";
import { sendTelegramDelivery } from "./telegram-send";
import { claimTrialSend, TRIAL_HOLDS_BACK, trialHoldsBack } from "./trials";
import { trialLimitOf } from "./trial-limits";
import { receiveEmail } from "./inbound-email";
import { workspace } from "./test/db-fixtures";

const TRIAL_METRICS_MAX = trialLimitOf("metrics").default;
const TRIAL_DELIVERIES_PER_DAY = trialLimitOf("messagesPerDay").default;

const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } delete process.env.ZIFFR_INBOUND_DOMAIN; });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;

/** A Trial Workspace with its Owner, ending in `days` (a negative number: ended). */
async function trial(days = 7) {
  const w = await workspace("Trial");
  cleanups.push(w.cleanup);
  await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + days * 86_400_000).toISOString() }).eq("id", w.id);
  const owner = await w.person("owner", { email: address("owner") });
  return { ...w, owner };
}
const latest = async (wsId: string, recipient: string) =>
  (await db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", recipient).order("id", { ascending: false }).limit(1).single()).data;
async function queued(wsId: string, recipient: string, connector: string) {
  const { data } = await db().from("deliveries").insert({ connector, recipient_id: recipient, kind: "notice", workspace_id: wsId, subject: "s", body: "b", mail_state: "queued" }).select("id").single();
  return data!.id as number;
}

describe("a Trial Workspace sends only to people who accepted", () => {
  it("emails a Prompt to its Owner for real", async () => {
    const t = await trial();
    const m = await t.metric(t.owner, { sources: ["web_form", "mail"] });
    await t.token(m.id, t.owner);
    expect(await deliverPrompt({ metricId: m.id, submitterId: t.owner, via: "email" })).toBeTruthy();
    expect(await latest(t.id, t.owner)).toMatchObject({ mail_state: "sent" });
  });

  it("keeps a Prompt to a Contact in the Outbox, even one with an address", async () => {
    const t = await trial();
    const dana = await t.contact({ email: address("dana") });
    const m = await t.metric(t.owner, { sources: ["web_form", "mail"] });
    await t.token(m.id, dana);
    expect(await deliverPrompt({ metricId: m.id, submitterId: dana, senderId: t.owner, via: "email" })).toBeTruthy();
    expect(await latest(t.id, dana)).toMatchObject({ mail_state: "outbox" });
  });

  it("emails a Prompt to a Member, an Admin and a Guest who accepted, for real", async () => {
    const t = await trial();
    const m = await t.metric(t.owner, { sources: ["web_form", "mail"] });
    for (const role of ["member", "admin", "guest"] as const) {
      const who = await t.person(role, { email: address(role) });
      await t.token(m.id, who);
      expect(await deliverPrompt({ metricId: m.id, submitterId: who, senderId: t.owner, via: "email" })).toBeTruthy();
      expect(await latest(t.id, who)).toMatchObject({ mail_state: "sent" });
    }
  });

  it("keeps a Delivery to someone with no membership (an open invitation) in the Outbox", async () => {
    const t = await trial();
    const stranger = `t-${randomUUID()}`;
    await db().from("profiles").insert({ id: stranger, name: "Invited", role: "", color: "#000", email: address("invited") });
    cleanups.push(async () => { await db().from("profiles").delete().eq("id", stranger); });
    expect(await trialHoldsBack(t.id, stranger)).toBe(TRIAL_HOLDS_BACK.notAccepted);
    const id = await queued(t.id, stranger, "email");
    expect(await sendDelivery(id)).toBe("skipped");
    expect((await db().from("deliveries").select("mail_state, last_error").eq("id", id).single()).data).toEqual({ mail_state: "outbox", last_error: TRIAL_HOLDS_BACK.notAccepted });
  });

  it("keeps a Contact in the Outbox even when the same person is also a member", async () => {
    const t = await trial();
    const both = await t.person("member", { email: address("both") });
    await db().from("contacts").insert({ workspace_id: t.id, person_id: both, email: address("typed") });
    expect(await trialHoldsBack(t.id, both)).toBe(TRIAL_HOLDS_BACK.contact);
    const id = await queued(t.id, both, "email");
    expect(await sendDelivery(id)).toBe("skipped");
  });

  it("takes a Member's Delivery into the day's limit with the Owner's and every other's", async () => {
    const t = await trial();
    const ben = await t.person("member", { email: address("ben") });
    const ids: number[] = [];
    for (let i = 0; i < TRIAL_DELIVERIES_PER_DAY + 4; i++) ids.push(await queued(t.id, i % 2 ? ben : t.owner, ["email", "slack", "telegram"][i % 3]));
    const answers = await Promise.all(ids.map((id) => claimTrialSend(id)));
    expect(answers.filter((a) => a === "ok")).toHaveLength(TRIAL_DELIVERIES_PER_DAY);
    expect(answers.filter((a) => a === "wait")).toHaveLength(4);
  });

  it("holds back a queued Delivery to a Contact on every Connector, whatever is set up", async () => {
    const t = await trial();
    const dana = await t.contact({ email: address("dana"), slack_handle: "dana" });
    for (const [connector, send] of [["email", sendDelivery], ["slack", sendSlackDelivery], ["telegram", sendTelegramDelivery]] as const) {
      const id = await queued(t.id, dana, connector);
      expect(await send(id)).toBe("skipped");
      expect((await db().from("deliveries").select("mail_state, last_error").eq("id", id).single()).data).toEqual({ mail_state: "outbox", last_error: TRIAL_HOLDS_BACK.contact });
    }
  });

  it("sends nothing once it has ended, also to its Owner", async () => {
    const t = await trial(-1);
    await deliverNotice(t.id, { recipientId: t.owner, senderId: null, subject: "Ready", text: "Your Snapshot is ready.", link: "/" });
    expect(await latest(t.id, t.owner)).toMatchObject({ mail_state: "outbox" });
    const id = await queued(t.id, t.owner, "email");
    expect(await sendDelivery(id)).toBe("skipped");
    expect((await db().from("deliveries").select("mail_state, last_error").eq("id", id).single()).data).toEqual({ mail_state: "outbox", last_error: TRIAL_HOLDS_BACK.ended });
  });

  it("takes no reply once it has ended, and answers none", async () => {
    const t = await trial(-1);
    const from = (await db().from("profiles").select("email").eq("id", t.owner).single()).data!.email as string;
    const token = randomUUID().replace(/-/g, "");
    await db().from("deliveries").insert({ connector: "email", recipient_id: t.owner, kind: "notice", workspace_id: t.id, subject: "s", body: "b", mail_state: "sent", reply_token: token });
    const sent: unknown[] = [];
    const transport = async (m: unknown) => { sent.push(m); return { messageId: "id" }; };
    const outcome = await receiveEmail({ tokens: [token], from, text: "42", messageId: `<${randomUUID()}@example.test>`, verified: true, automatic: false }, { transport });
    expect(outcome).toBe("expired");
    expect(sent).toHaveLength(0);
  });

  it("changes nothing outside a trial: a Contact is emailed as before", async () => {
    const w = await workspace();
    cleanups.push(w.cleanup);
    const sara = await w.person("owner", { email: address("sara") });
    const dana = await w.contact({ email: address("dana") });
    const m = await w.metric(sara, { sources: ["web_form", "mail"] });
    await w.token(m.id, dana);
    await deliverPrompt({ metricId: m.id, submitterId: dana, senderId: sara, via: "email" });
    expect(await latest(w.id, dana)).toMatchObject({ mail_state: "sent" });
  });
});

describe("a Trial Workspace's limits", () => {
  it(`takes at most ${TRIAL_DELIVERIES_PER_DAY} real sends a day over all Connectors, also when they race`, async () => {
    const t = await trial();
    const ids: number[] = [];
    for (let i = 0; i < TRIAL_DELIVERIES_PER_DAY + 5; i++) ids.push(await queued(t.id, t.owner, ["email", "slack", "telegram"][i % 3]));
    const answers = await Promise.all(ids.map((id) => claimTrialSend(id)));
    expect(answers.filter((a) => a === "ok")).toHaveLength(TRIAL_DELIVERIES_PER_DAY);
    expect(answers.filter((a) => a === "wait")).toHaveLength(5);
    // One that waits is tried again in an hour; one that took its slot keeps it when its Connector makes it wait.
    const waiting = ids[answers.indexOf("wait")];
    const { data } = await db().from("deliveries").select("not_before").eq("id", waiting).single();
    expect(new Date(data!.not_before).getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
    expect(await claimTrialSend(ids[answers.indexOf("ok")])).toBe("ok");
  });

  it("counts nothing outside a trial", async () => {
    const w = await workspace();
    cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const ids = await Promise.all(Array.from({ length: TRIAL_DELIVERIES_PER_DAY + 1 }, () => queued(w.id, sara, "email")));
    expect((await Promise.all(ids.map((id) => claimTrialSend(id)))).every((a) => a === "ok")).toBe(true);
    const { count } = await db().from("trial_sends").select("delivery_id", { count: "exact", head: true }).eq("workspace_id", w.id);
    expect(count).toBe(0);
  });

  it(`holds at most ${TRIAL_METRICS_MAX} Metrics, also when they are made at once, as the database counts them`, async () => {
    const t = await trial();
    const actor = t.actor(t.owner);
    const made = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => createMetric(actor, { name: `Metric ${i}` })));
    expect(made.filter((r) => r.status === "fulfilled")).toHaveLength(TRIAL_METRICS_MAX);
    expect((made.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.message).toMatch(/at most 25 Metrics/);
  });
});
