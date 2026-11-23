// @ts-nocheck
// The Approve and Stop buttons on Telegram (spec 0016, ticket #28), against the database and a fake Bot API: an
// approval task carries Approve, a Prompt carries Stop; a press counts only from the recipient's account, on that very
// message, once; Approve takes the Approval as Ziffr would, Stop ends Prompts on Telegram and tells the owners.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { submitValue } from "./submissions";
import { setTelegramEnabled } from "./telegram-connection";
import { receiveTelegramUpdate } from "./telegram-inbound";
import { telegramOptBackIn, telegramOptedOut } from "./telegram-people";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import { fakeTelegram } from "./test/fake-telegram";
import { workspace, opened } from "./test/db-fixtures";

let tg: Awaited<ReturnType<typeof fakeTelegram>>;
beforeAll(async () => { tg = await fakeTelegram(); });
afterAll(async () => { await tg.stop(); });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

let next = Date.now() * 100 + 95;
const id = () => ++next;
const latest = async (wsId: string, recipient: string) => (await db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", recipient).order("id", { ascending: false }).limit(1).single()).data!;
/** Someone connected to Telegram in the workspace; returns their Telegram account (and chat) id. */
async function connect(wsId: string, personId: string) {
  const user = id();
  await db().from("telegram_links").insert({ workspace_id: wsId, person_id: personId, telegram_user_id: user, chat_id: user });
  return user;
}
/** A press of a button by `user`, on the message a Delivery was sent as (or another message id). */
const press = (user: number, d: { id: number; telegram_chat_id: number; telegram_message_id: number }, action: "a" | "s", messageId = d.telegram_message_id) => ({
  update_id: id(),
  callback_query: { id: `cq${id()}`, from: { id: user, is_bot: false, first_name: "Ben" }, message: { message_id: messageId, chat: { id: d.telegram_chat_id, type: "private" }, date: 0 }, chat_instance: "1", data: `${action}:${d.id}` },
});
const markupOf = (chatId: number) => tg.of("sendMessage").filter((c) => c.params.chat_id === chatId).at(-1)!.params.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] } | undefined;

describe("buttons on Telegram", () => {
  it("approves an Unusual Value with the button, only for the approver, once", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    await setTelegramEnabled(w.actor(sara), true);
    const ann = await w.person("member");
    const ben = await w.person("member");
    const annUser = await connect(w.id, ann);
    const benUser = await connect(w.id, ben);
    const m = await w.metric(sara, { name: "Field visits", target_max: 10 });
    const code = await w.token(m.id, ann);
    await db().from("delivery_preferences").insert({ workspace_id: w.id, user_id: ben, kind: "task", connector: "telegram" });
    const wf = await saveWorkflow(w.actor(sara), null, "Check", { dueWorkingDays: 2, steps: [{ type: "check", changePct: 50, outsideTarget: true }, { type: "approve", approvers: [ben] }, { type: "publish", lock: true }] });
    await setMetricWorkflow(w.actor(sara), m.id, wf);
    expect((await submitValue({ source: "web_form", sender: code, text: "500" })).detail).toMatch(/approval asked/);
    const task = await latest(w.id, ben);
    expect(task.mail_state).toBe("sent");
    expect(markupOf(benUser)?.inline_keyboard[0]).toEqual([{ text: "Approve", callback_data: `a:${task.id}` }]);

    expect(await receiveTelegramUpdate(press(annUser, task, "a"))).toBe("wrong_user");
    expect(await receiveTelegramUpdate(press(benUser, task, "a", 999_999))).toBe("unknown_message");
    // A double tap: two presses (two updates) at once approve once.
    const [one, two] = await Promise.all([receiveTelegramUpdate(press(benUser, task, "a")), receiveTelegramUpdate(press(benUser, task, "a"))]);
    expect([one, two].sort()).toEqual(["approved", "refused"]);
    const { count: approvals } = await db().from("audit_events").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("kind", "approval.given");
    expect(approvals).toBe(1);
    const { data: action } = await db().from("actions").select("period_start").eq("id", task.action_id).single();
    const { data: state } = await db().from("period_states").select("state").eq("metric_id", m.id).eq("period_start", action!.period_start).single();
    expect(state!.state).toBe("locked");
    expect(await receiveTelegramUpdate(press(benUser, task, "a"))).toBe("refused");
    // Every press is answered, so Telegram stops showing it as pending.
    expect(tg.of("answerCallbackQuery").length).toBeGreaterThanOrEqual(4);
  });

  it("stops Prompts on Telegram with the button, tells the owner, and starts them again on the Connectors page", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    await setTelegramEnabled(w.actor(sara), true);
    const ann = await w.person("member");
    const annUser = await connect(w.id, ann);
    const m = await w.metric(sara, { name: "Field visits" });
    await w.token(m.id, ann);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    const prompt = await latest(w.id, ann);
    expect(markupOf(annUser)?.inline_keyboard[0]).toEqual([{ text: "Stop these on Telegram", callback_data: `s:${prompt.id}` }]);

    expect(await receiveTelegramUpdate(press(annUser, prompt, "s"))).toBe("stopped");
    expect(await telegramOptedOut(w.actor(ann, "member"))).toBe(true);
    const notice = await opened("deliveries", w.id, (await db().from("deliveries").select("id, subject").eq("workspace_id", w.id).eq("recipient_id", sara).eq("kind", "notice")).data, { dropId: true });
    expect(notice?.[0]?.subject).toMatch(/stopped reminders on Telegram/);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    expect(await latest(w.id, ann)).toMatchObject({ mail_state: "failed", last_error: "They stopped reminders on Telegram." });

    await telegramOptBackIn(w.actor(ann, "member"));
    // A second later, as one chat gets at most one message a second.
    await db().from("telegram_sends").update({ sent_at: new Date(Date.now() - 5000).toISOString() }).eq("workspace_id", w.id);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    expect((await latest(w.id, ann)).mail_state).toBe("sent");
  });

  it("ignores a press where Telegram is off, and data that is not Ziffr's", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    await setTelegramEnabled(w.actor(sara), true);
    const ann = await w.person("member");
    const annUser = await connect(w.id, ann);
    const m = await w.metric(sara);
    await w.token(m.id, ann);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    const prompt = await latest(w.id, ann);
    const odd = press(annUser, prompt, "s");
    odd.callback_query.data = "x:1; drop table deliveries";
    expect(await receiveTelegramUpdate(odd)).toBe("ignored");
    await setTelegramEnabled(w.actor(sara), false);
    expect(await receiveTelegramUpdate(press(annUser, prompt, "s"))).toBe("ignored");
    expect(await telegramOptedOut(w.actor(ann, "member"))).toBe(false);
  });
});
