// Answers by Telegram (spec 0016, ticket #27), against the database and a fake Bot API: a reply to a sent Delivery,
// from the account its recipient connected, records a value, replies in a Thread or proposes a Correction; anyone
// else, an old or unknown message, a message that replies to nothing and the 21st reply are refused.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { openRows } from "./sealed-columns";
import { deliverPrompt } from "./deliveries";
import { ask } from "./questions";
import { setTelegramEnabled } from "./telegram-connection";
import { MAX_TELEGRAM_REPLIES_PER_DELIVERY, receiveTelegramUpdate } from "./telegram-inbound";
import { fakeTelegram } from "./test/fake-telegram";
import { rowsOf, valuesOf, workspace } from "./test/db-fixtures";

let tg: Awaited<ReturnType<typeof fakeTelegram>>;
beforeAll(async () => { tg = await fakeTelegram(); });
afterAll(async () => { await tg.stop(); });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

let next = Date.now() * 100 + 90;
const id = () => ++next;
/** A workspace with Telegram on, and Ann connected to it, submitting to a Metric. */
async function setup(sources?: string[]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  await setTelegramEnabled(w.actor(sara), true);
  const ann = await w.person("member");
  const user = id();
  await db().from("telegram_links").insert({ workspace_id: w.id, person_id: ann, telegram_user_id: user, chat_id: user });
  const m = await w.metric(sara, { name: "Field visits", ...(sources ? { sources } : {}) });
  await w.token(m.id, ann);
  return { w, sara, ann, user, m };
}
const latest = async (wsId: string, recipient: string) => (await db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", recipient).order("id", { ascending: false }).limit(1).single()).data!;
/** A text message from `user` in their private chat, replying to message `to` when given. */
const text = (user: number, body: string, to?: number) => ({
  update_id: id(),
  message: { message_id: id() % 1_000_000, from: { id: user, is_bot: false, first_name: "Ann" }, chat: { id: user, type: "private" }, date: 0, text: body, ...(to ? { reply_to_message: { message_id: to, chat: { id: user, type: "private" }, date: 0 } } : {}) },
});
const lastSaid = () => String(tg.of("sendMessage").at(-1)!.params.text);

describe("answers by Telegram", () => {
  it("records a number replied to a Prompt, and says so", async () => {
    const { w, sara, ann, user, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    const d = await latest(w.id, ann);
    expect(await receiveTelegramUpdate(text(user, "42", d.telegram_message_id))).toBe("recorded");
    const obs = (await valuesOf(m.id)).map(({ value, source, submitter_id }) => ({ value, source, submitter_id }));
    expect(obs).toEqual([{ value: 42, source: "telegram", submitter_id: ann }]);
    expect(lastSaid()).toMatch(/^Recorded: /);
    expect((await latest(w.id, ann)).status).toBe("answered");
  });

  it("takes yes as a reply to the message that made the offer, from that chat only (spec 0064)", async () => {
    const { w, sara, ann, user, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    const d = await latest(w.id, ann);
    expect(await receiveTelegramUpdate(text(user, "42", d.telegram_message_id))).toBe("recorded");
    expect(await receiveTelegramUpdate(text(user, "actually 43", d.telegram_message_id))).toBe("noted");
    expect(lastSaid()).toBe("Saved as your note. Your value is still 42. To change it to 43, reply yes.");
    const [offer] = await rowsOf("reply_offers", { delivery_id: d.id });
    const answer = Number(offer!.answer_message_id);
    expect(answer).toBeGreaterThan(0);
    // The same message number in another chat is not this offer.
    expect(await receiveTelegramUpdate(text(id(), "yes", answer))).toBe("unknown_message");
    expect(await receiveTelegramUpdate(text(user, "yes", answer))).toBe("recorded");
    expect((await valuesOf(m.id)).map((o) => o.value)).toEqual([43]);
  });

  it("reads a sentence as the answer, and asks back for several numbers or another period (spec 0022)", async () => {
    const { w, sara, ann, user, m } = await setup();
    // A workspace in Germany reads answers in English and German (its Answer Languages).
    await db().from("workspaces").update({ country: "DE" }).eq("id", w.id);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    const d = await latest(w.id, ann);
    expect(await receiveTelegramUpdate(text(user, "2 Besuche, 1 abgesagt", d.telegram_message_id))).toBe("refused");
    expect(lastSaid()).toContain("Found several numbers: “2” and “1”");
    expect(await receiveTelegramUpdate(text(user, "letzten Monat 4", d.telegram_message_id))).toBe("refused");
    expect(lastSaid()).toMatch(/This Prompt asks for/);
    expect(await receiveTelegramUpdate(text(user, "diesen Monat hatten wir 3 Besuche", d.telegram_message_id))).toBe("recorded");
    expect((await valuesOf(m.id)).map((o) => ({ value: o.value }))).toEqual([{ value: 3 }]);
  });

  it("sends the form link when the Metric does not take values by Telegram", async () => {
    const { w, sara, ann, user, m } = await setup(["web_form", "telegram"]);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    const d = await latest(w.id, ann);
    // A Prompt made before Prompts followed the Metric's Sources (it asked for the form): a reply says to use the form.
    await db().from("prompts").update({ source: "web_form" }).eq("metric_id", m.id);
    await db().from("deliveries").update({ answer_source: null }).eq("id", d.id);
    expect(await receiveTelegramUpdate(text(user, "42", d.telegram_message_id))).toBe("form_link");
    expect(lastSaid()).toContain("/submit/");
    const { count } = await db().from("observations").select("id", { count: "exact", head: true }).eq("metric_id", m.id);
    expect(count).toBe(0);
  });

  it("puts a reply to a question into its Thread, and a Correction line as a Correction", async () => {
    const { w, sara, ann, user, m } = await setup();
    const actionId = await ask(w.actor(sara), { metricId: m.id, period: "2026-10-01", assigneeId: ann, text: "Why so low?", via: "telegram" });
    const d = await latest(w.id, ann);
    expect(await receiveTelegramUpdate(text(user, "Two stores were closed.", d.telegram_message_id))).toBe("replied");
    expect(await receiveTelegramUpdate(text(user, "Correction: 50", d.telegram_message_id))).toBe("corrected");
    const thread = await openRows("thread_messages", w.id, (await db().from("thread_messages").select("id, author_id, body").eq("action_id", actionId).order("id")).data);
    expect(thread!.map((t) => t.author_id)).toContain(ann);
    expect(thread!.map((t) => t.body)).toContain("Two stores were closed.");
  });

  it("refuses another account, an unknown or old message, and a message that replies to nothing", async () => {
    const { w, sara, ann, user, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    const d = await latest(w.id, ann);
    expect(await receiveTelegramUpdate(text(id(), "42", d.telegram_message_id))).toBe("unknown_message");
    expect(await receiveTelegramUpdate(text(user, "42", 999_999_999))).toBe("unknown_message");
    expect(await receiveTelegramUpdate(text(user, "42"))).toBe("hint");
    expect(lastSaid()).toMatch(/^To answer, reply to the message/);
    // The same chat after the link moved to someone else answers nothing for Ann.
    const ben = await w.person("member");
    await db().from("telegram_links").delete().eq("workspace_id", w.id).eq("person_id", ann);
    await db().from("telegram_links").insert({ workspace_id: w.id, person_id: ben, telegram_user_id: user, chat_id: user });
    expect(await receiveTelegramUpdate(text(user, "42", d.telegram_message_id))).toBe("wrong_user");
    await db().from("deliveries").update({ created_at: new Date(Date.now() - 31 * 86_400_000).toISOString() }).eq("id", d.id);
    expect(await receiveTelegramUpdate(text(user, "42", d.telegram_message_id))).toBe("expired");
    const { count } = await db().from("observations").select("id", { count: "exact", head: true }).eq("metric_id", m.id);
    expect(count).toBe(0);
  });

  it("takes no reply once the workspace turned Telegram off, nor from someone who left it", async () => {
    const { w, sara, ann, user, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    const d = await latest(w.id, ann);
    await setTelegramEnabled(w.actor(sara), false);
    expect(await receiveTelegramUpdate(text(user, "42", d.telegram_message_id))).toBe("ignored");
    await setTelegramEnabled(w.actor(sara), true);
    await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", ann);
    expect(await receiveTelegramUpdate(text(user, "42", d.telegram_message_id))).toBe("wrong_user");
    const { count } = await db().from("observations").select("id", { count: "exact", head: true }).eq("metric_id", m.id);
    expect(count).toBe(0);
  });

  it("takes at most twenty replies to one Delivery", async () => {
    const { w, sara, ann, user, m } = await setup();
    await ask(w.actor(sara), { metricId: m.id, period: "2026-10-01", assigneeId: ann, text: "Why?", via: "telegram" });
    const d = await latest(w.id, ann);
    for (let i = 0; i < MAX_TELEGRAM_REPLIES_PER_DELIVERY; i++) expect(await receiveTelegramUpdate(text(user, `Reply ${i}`, d.telegram_message_id))).toBe("replied");
    expect(await receiveTelegramUpdate(text(user, "One more", d.telegram_message_id))).toBe("too_many");
  });
});
