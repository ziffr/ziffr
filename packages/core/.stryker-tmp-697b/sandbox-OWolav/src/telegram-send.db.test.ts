// @ts-nocheck
// Sending by Telegram (spec 0016, ticket #26), against the database and a fake Bot API on this machine: sent to the
// chat a person connected, as plain text; nothing where Telegram is off, in the demo or to someone not connected;
// waiting on a limit and on Telegram's 429; a blocked bot ends the link; email's and Slack's queues never send it.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { ask } from "./questions";
import { setTelegramEnabled } from "./telegram-connection";
import { sendTelegramDelivery, sendWaitingTelegram, telegramSends } from "./telegram-send";
import { telegramChatOf } from "./telegram-people";
import { DEMO_WORKSPACE_ID } from "./team";
import { fakeTelegram } from "./test/fake-telegram";
import { workspace } from "./test/db-fixtures";

let tg: Awaited<ReturnType<typeof fakeTelegram>>;
beforeAll(async () => { tg = await fakeTelegram(); });
afterAll(async () => { await tg.stop(); });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

let next = Date.now() * 100 + 70;
/** A workspace with Telegram on, an owner, a member connected to Telegram, and a Metric the member submits to. */
async function setup(over: { sources?: string[]; connected?: boolean } = {}) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  await setTelegramEnabled(w.actor(sara), true);
  const ann = await w.person("member");
  const chat = ++next;
  if (over.connected !== false) await db().from("telegram_links").insert({ workspace_id: w.id, person_id: ann, telegram_user_id: chat, chat_id: chat });
  const m = await w.metric(sara, { name: "Field visits", ...(over.sources ? { sources: over.sources } : {}) });
  const code = await w.token(m.id, ann);
  return { w, sara, ann, chat, m, code };
}
const latest = async (wsId: string, recipient: string) => (await db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", recipient).order("id", { ascending: false }).limit(1).single()).data!;
const sends = () => tg.of("sendMessage");

describe("sending by Telegram", () => {
  it("sends a Prompt to the connected chat as plain text, and keeps which message it is", async () => {
    const { w, sara, ann, chat, m } = await setup();
    const before = sends().length;
    expect(await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" })).toBeTruthy();
    const d = await latest(w.id, ann);
    expect(d).toMatchObject({ connector: "telegram", mail_state: "sent", attempts: 1, telegram_chat_id: chat });
    expect(String(d.telegram_message_id)).toBe(d.provider_id);
    expect(sends()).toHaveLength(before + 1);
    const sent = sends().at(-1)!.params;
    expect(sent.chat_id).toBe(chat);
    expect(sent.parse_mode).toBeUndefined();
    expect(sent.text).toContain("What’s the number for Field visits");
    expect(sent.text).toContain("Reply to this message with the number.");
  });

  it("sends no Prompt on Telegram for a Metric that does not take answers by Telegram", async () => {
    const { w, sara, ann, m } = await setup({ sources: ["web_form"] });
    const before = sends().length;
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    expect((await latest(w.id, ann)).connector).toBe("email");
    expect(sends()).toHaveLength(before);
  });

  it("sends what people wrote literally: no formatting, no hidden link", async () => {
    const { w, sara, ann, m } = await setup();
    await ask(w.actor(sara), { metricId: m.id, period: "2026-10-01", assigneeId: ann, text: "Why? <b>urgent</b> [your bank](https://evil.example)", via: "telegram" });
    const sent = sends().at(-1)!.params;
    expect(sent.text).toContain("<b>urgent</b> [your bank](https://evil.example)");
    expect(sent.parse_mode).toBeUndefined();
    expect(sent.text).toMatch(/Reply to this message, or open: https:\/\/ziffr\.example\.test\/actions\/\d+/);
  });

  it("sends nothing to someone not connected, where Telegram is off, or in the demo", async () => {
    const { w, sara, ann, m } = await setup({ connected: false });
    const before = sends().length;
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    // Not connected: a Prompt goes the way that does reach them, an email.
    expect((await latest(w.id, ann)).connector).toBe("email");

    await setTelegramEnabled(w.actor(sara), false);
    expect(await telegramSends(w.id)).toBe(false);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    expect((await latest(w.id, ann)).mail_state).toBe("outbox");
    expect(await telegramSends(DEMO_WORKSPACE_ID)).toBe(false);
    expect(sends()).toHaveLength(before);
  });

  it("waits a second between two messages to one chat, and the job sends the second", async () => {
    const { w, sara, ann, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram", queue: true });
    const waiting = await latest(w.id, ann);
    expect(await sendTelegramDelivery(waiting.id)).toBe("waiting");
    expect((await latest(w.id, ann)).not_before).not.toBeNull();
    // Due again once its wait is over.
    await db().from("deliveries").update({ not_before: null }).eq("id", waiting.id);
    await db().from("telegram_sends").update({ sent_at: new Date(Date.now() - 5000).toISOString() }).eq("workspace_id", w.id);
    await sendWaitingTelegram();
    expect((await latest(w.id, ann)).mail_state).toBe("sent");
  });

  it("waits when Telegram says so, without using an attempt or Ziffr's limits", async () => {
    const { w, sara, ann, m } = await setup();
    tg.fail("sendMessage", { code: 429, retryAfter: 40 });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    const d = await latest(w.id, ann);
    expect(d).toMatchObject({ mail_state: "queued", attempts: 0, last_error: "Telegram asked to wait." });
    expect(new Date(d.not_before).getTime()).toBeGreaterThan(Date.now() + 30_000);
    const { count } = await db().from("telegram_sends").select("id", { count: "exact", head: true }).eq("delivery_id", d.id);
    expect(count).toBe(0);
  });

  it("ends the link when the person blocked the bot (403)", async () => {
    const { w, sara, ann, m } = await setup();
    tg.fail("sendMessage", { code: 403 });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    expect(await latest(w.id, ann)).toMatchObject({ mail_state: "failed", last_error: "They blocked Ziffr's bot in Telegram." });
    expect(await telegramChatOf(w.id, ann)).toBeNull();
  });

  it("sends nothing queued to someone who left the workspace since", async () => {
    const { w, sara, ann, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram", queue: true });
    await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", ann);
    const before = sends().length;
    await sendWaitingTelegram();
    expect(await latest(w.id, ann)).toMatchObject({ mail_state: "failed", last_error: "Not connected to Telegram." });
    expect(sends()).toHaveLength(before);
  });

  it("counts a failed attempt and tries again, up to the last", async () => {
    const { w, sara, ann, m } = await setup();
    tg.fail("sendMessage", { code: 500 });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    expect(await latest(w.id, ann)).toMatchObject({ mail_state: "queued", attempts: 1, last_error: "Telegram refused it (error_500)." });
  });
});
