// Updates from Telegram (spec 0016, tickets #25 and #27; GLOSSARY: Connector, Delivery). Telegram sends every update
// to the webhook with the secret only it and Ziffr know (or polling fetches them on a laptop). Each update is claimed
// by its update_id before anything else, so a retry changes nothing. Here: linking with /start, /stop, the bot being
// blocked, and replies: a reply to a sent Delivery, from the Telegram account that Delivery's recipient connected,
// within 30 days, goes the way an email or Slack reply goes (reply-routing.ts); and the Approve and Stop buttons, taken
// only from that recipient on that very message.
import { timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { tellOwnersOfStop } from "./email-opt-out";
import { OPT_OUT_KINDS } from "./mail";
import { routeReply, type RepliedDelivery } from "./reply-routing";
import type { SubmissionEffects } from "./submissions";
import { TELEGRAM_BUTTONS } from "./telegram-send";
import { approve } from "./workflow-engine";
import { settingsInEffect } from "./settings-in-effect";
import { callTelegram, telegramEnabled, telegramOn, telegramPolling, telegramWebhookSecret } from "./telegram-api";
import { telegramOnIn } from "./telegram-connection";
import { forgetTelegramUser, isTelegramId, linkTelegramByCode, personOfTelegramUser, type TelegramLinkOutcome } from "./telegram-people";
import { isTelegramTestCode, takeTelegramTestAnswer, takeTelegramTestStart } from "./installation-telegram-test";
import { trialEnded } from "./trials";
import { mayAnswer } from "./practice";

/** Largest update taken, in bytes; real ones are far smaller. */
export const MAX_TELEGRAM_BYTES = 64 * 1024;
/** Answers the bot gives one Telegram account in a minute (hints, link results), so a flood costs nothing. */
const MAX_ANSWERS_PER_MINUTE = 10;
/** Replies taken for one Delivery; more are ignored. */
export const MAX_TELEGRAM_REPLIES_PER_DELIVERY = 20;
/** How long a Delivery takes replies. */
const REPLY_DAYS = 30;

/** What became of an update; only this name is kept. */
export type TelegramOutcome =
  | "linked" | "confirm_sent" | "refused" | "unlinked" | "blocked" | "hint" | "duplicate" | "too_many" | "ignored"
  | "recorded" | "form_link" | "replied" | "corrected" | "empty" | "unknown_message" | "expired" | "wrong_user"
  | "approved" | "stopped" | "test_started" | "test_refused" | "test_answered" | "test_hint";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Whether a webhook request carries the secret this Ziffr registered (from the bot token in effect), compared in
 * constant time. */
export async function telegramSecretOk(given: string | null): Promise<boolean> {
  const wanted = telegramWebhookSecret(await settingsInEffect());
  if (!wanted || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(wanted);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Says something in a private chat, as plain text; a lost answer is not worth failing the update for. */
export async function telegramSay(chatId: number, text: string, replyTo?: number): Promise<void> {
  try {
    await callTelegram("sendMessage", { chat_id: chatId, text: text.slice(0, 4096), ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}), link_preview_options: { is_disabled: true } });
  } catch {
    // The update itself was handled.
  }
}

/** Answers the bot gives everyone together in a second, so a flood from many accounts leaves Telegram's limit to
 * real Deliveries. */
const MAX_ANSWERS_PER_SECOND = 5;

/** Whether the bot already answered this account ten times in the last minute, or everyone five times this second. */
async function quiet(userId: number): Promise<boolean> {
  // Every outcome the bot answers counts, the Installation's test included: a flood of wrong test codes must not
  // make it talk without limit.
  const answered = ["hint", "linked", "confirm_sent", "refused", "unlinked", "test_started", "test_refused", "test_hint", "test_answered"];
  const [{ count: mine }, { count: all }] = await Promise.all([
    db().from("telegram_updates").select("update_id", { count: "exact", head: true }).eq("telegram_user_id", userId).in("outcome", answered).gt("received_at", new Date(Date.now() - 60_000).toISOString()),
    db().from("telegram_updates").select("update_id", { count: "exact", head: true }).in("outcome", answered).gt("received_at", new Date(Date.now() - 1000).toISOString()),
  ]);
  return (mine ?? 0) >= MAX_ANSWERS_PER_MINUTE || (all ?? 0) >= MAX_ANSWERS_PER_SECOND;
}

/** Takes one update, already known to come from Telegram (the webhook's secret, or polling with the bot token). */
export async function receiveTelegramUpdate(update: unknown, effects: { submission?: SubmissionEffects } = {}): Promise<TelegramOutcome> {
  if (!(await telegramOn())) return "ignored";
  const u = obj(update);
  const updateId = u.update_id;
  if (typeof updateId !== "number" || !Number.isSafeInteger(updateId) || updateId < 0) return "ignored";
  const from = obj(obj(u.message).from ?? obj(u.callback_query).from ?? obj(u.my_chat_member).from);
  const userId = isTelegramId(from.id) ? from.id : null;
  const { error } = await db().from("telegram_updates").insert({ update_id: updateId, telegram_user_id: userId, outcome: "taken" });
  if (error?.code === "23505") return "duplicate";
  if (error) throw new Error("The Telegram update could not be recorded.");
  const { outcome, workspaceId, deliveryId } = await handle(u, userId, effects);
  await db().from("telegram_updates").update({ outcome, workspace_id: workspaceId, delivery_id: deliveryId }).eq("update_id", updateId);
  return outcome;
}

type Handled = { outcome: TelegramOutcome; workspaceId: string | null; deliveryId: number | null };
const none = (outcome: TelegramOutcome): Handled => ({ outcome, workspaceId: null, deliveryId: null });

async function handle(u: Obj, userId: number | null, effects: { submission?: SubmissionEffects }): Promise<Handled> {
  if (!userId) return none("ignored");
  if (u.callback_query) return pressed(obj(u.callback_query), userId);
  // Blocked (or unblocked) in a private chat: blocking ends every link of that account.
  if (u.my_chat_member) {
    const m = obj(u.my_chat_member);
    if (obj(m.chat).type === "private" && obj(m.new_chat_member).status === "kicked") {
      await forgetTelegramUser(userId);
      return none("blocked");
    }
    return none("ignored");
  }
  const msg = obj(u.message);
  const chat = obj(msg.chat);
  const chatId = chat.id;
  // Only a person's own message in a private chat with the bot; nothing from groups, channels or other bots.
  if (!u.message || chat.type !== "private" || from(msg).is_bot === true || !isTelegramId(chatId)) return none("ignored");
  const text = str(msg.text).trim();
  const start = /^\/start(?:@\w+)?(?:\s+(\S+))?$/.exec(text);
  if (start) {
    const silent = await quiet(userId);
    if (!start[1]) {
      if (!silent) await telegramSay(chatId, "Hello! To get Ziffr messages here, choose “Connect Telegram” in Ziffr: on the Connectors page, or on your personal form.");
      return none("hint");
    }
    // The Installation Settings page's round trip test: a code of its own shape, never a Workspace link. It is
    // handled here and goes no further, so a test code can never connect anyone.
    if (isTelegramTestCode(start[1])) {
      const started = await takeTelegramTestStart({ code: start[1], userId, chatId, say: (t) => (silent ? Promise.resolve() : telegramSay(chatId, t)) });
      return none(started ? "test_started" : "test_refused");
    }
    // A code still links when the bot keeps quiet: a flood by others must not stop someone linking.
    const result = await linkTelegramByCode({ code: start[1], userId, chatId, chatType: chat.type, from: msg.from });
    // The number to compare with the email is said even then: the database limits how often that happens.
    if ((!silent || (!result.linked && result.why === "confirm")) && !(result.linked && result.silent)) await telegramSay(chatId, startAnswer(result));
    return none(result.linked ? "linked" : result.why === "confirm" ? "confirm_sent" : "refused");
  }
  if (/^\/stop(?:@\w+)?$/.test(text)) {
    const n = await forgetTelegramUser(userId);
    if (!(await quiet(userId))) await telegramSay(chatId, n ? "Stopped: Ziffr does not send you anything here any more. Connect again in Ziffr whenever you like." : "You are not connected to Ziffr here.");
    return none("unlinked");
  }
  const repliedTo = obj(msg.reply_to_message).message_id;
  if (typeof repliedTo !== "number" || !Number.isSafeInteger(repliedTo) || repliedTo <= 0) {
    // Not a reply: guessing which message it answers could record a number for the wrong Metric.
    if (await quiet(userId)) return none("too_many");
    await telegramSay(chatId, "To answer, reply to the message you are answering: swipe it to the left, or press and hold it and choose Reply.", Number(msg.message_id) || undefined);
    return none("hint");
  }
  // A reply to the round trip test's message is the test's answer, never a Delivery's.
  const test = await takeTelegramTestAnswer({ userId, chatId, repliedTo, text, say: async (t) => { if (!(await quiet(userId))) await telegramSay(chatId, t, Number(msg.message_id) || undefined); } });
  if (test) return none(test === "answered" ? "test_answered" : "test_hint");
  return reply(userId, chatId, repliedTo, Number(msg.message_id) || undefined, text, effects);
}

/** Answers about a Workspace's message in a chat: in a Practice Workspace (spec 0063) only in its person's recorded chat. */
async function answerIn(workspaceId: string, chatId: number, text: string, replyTo?: number): Promise<void> {
  if (await mayAnswer(workspaceId, "telegram", String(chatId))) await telegramSay(chatId, text, replyTo);
}

/** What the bot says to a /start with a Workspace's code. */
function startAnswer(r: TelegramLinkOutcome): string {
  if (r.linked) return `Connected as ${r.person} in ${r.workspace}: you get their Ziffr messages here. If that is not you, send /stop. To answer a message, reply to it.`;
  switch (r.why) {
    case "confirm": {
      const email = r.sent
        ? `Ziffr emailed the address it keeps for you in ${r.workspace}.`
        : `Ziffr could not send the email to the address it keeps for you in ${r.workspace} yet, and tries again. If none arrives, ask an Owner or Admin of the workspace, or the person who asks you for numbers, for help.`;
      return `Almost done. Your number is ${r.check}. ${email} Open the link in that email, type this number and press Confirm within ${r.minutes} minutes. Give the number to nobody. Until then nothing is connected.`;
    }
    case "no_email": return "Nothing is connected: Ziffr cannot send you the email that confirms it. Ask an Owner or Admin of the workspace, or the person who asks you for numbers, for help.";
    case "limited": return "Nothing is connected: Ziffr has sent several emails to confirm already and sends no more for now. Try again later.";
    case "connected": return "Telegram is connected already, so nothing changed. To use another account, first send /stop from the one connected now.";
    case "expired": return "That link has run out. Choose “Connect Telegram” in Ziffr again.";
    default: return "That link does not work. Choose “Connect Telegram” in Ziffr again.";
  }
}

/** A reply to a message: taken only for a sent Delivery in this chat, from the person it went to as linked now,
 * within 30 days and at most twenty times; then routed as an email or Slack reply is. */
async function reply(userId: number, chatId: number, repliedTo: number, messageId: number | undefined, text: string, effects: { submission?: SubmissionEffects }): Promise<Handled> {
  const { data: d } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, prompt_id, created_at")
    .eq("connector", "telegram").eq("telegram_chat_id", chatId).eq("telegram_message_id", repliedTo).maybeSingle();
  if (!d) return none("unknown_message");
  const at = (outcome: TelegramOutcome): Handled => ({ outcome, workspaceId: d.workspace_id as string, deliveryId: d.id as number });
  // A workspace that turned Telegram off takes nothing by it any more, also replies to what it sent before.
  if (!(await telegramOnIn(d.workspace_id))) return at("ignored");
  // An ended trial takes no reply and answers none, as if the message were too old (spec 0021).
  if (Date.now() - new Date(d.created_at).getTime() > REPLY_DAYS * 86_400_000 || (await trialEnded(d.workspace_id))) return at("expired");
  // Only the person it went to, as linked now: a chat that changed hands answers nothing.
  if ((await personOfTelegramUser(d.workspace_id, userId)) !== d.recipient_id) return at("wrong_user");
  const { count } = await db().from("telegram_updates").select("update_id", { count: "exact", head: true }).eq("delivery_id", d.id).not("outcome", "in", "(expired,wrong_user,too_many)");
  if ((count ?? 0) >= MAX_TELEGRAM_REPLIES_PER_DELIVERY) return at("too_many");
  if (!text) return at("empty");
  const outcome = await routeReply(d as RepliedDelivery, text.slice(0, 5000), {
    source: "telegram", sender: `telegram:${userId}`, provenPersonId: d.recipient_id,
    answer: (subject, detail) => answerIn(d.workspace_id as string, chatId, `${subject}: ${detail}`, messageId),
  }, effects.submission);
  return at(outcome === "unknown_token" ? "unknown_message" : outcome);
}

const from = (msg: Obj) => obj(msg.from);

/** Answers a button press, so Telegram stops showing it as pending; the text shows as a short notice. */
async function answerPress(id: string, text?: string) {
  try {
    await callTelegram("answerCallbackQuery", { callback_query_id: id, ...(text ? { text: text.slice(0, 200) } : {}) });
  } catch {
    // The press was handled; only its notice is lost.
  }
}

/** A button press: taken only for a Ziffr button, on the very message a Delivery was sent as, pressed by the
 * account that Delivery's recipient connected (still a member or Contact there), while the workspace has Telegram
 * on and within 30 days. Telegram vouches for who pressed it, as Slack does: an Approval is taken here. */
async function pressed(cq: Obj, userId: number): Promise<Handled> {
  const pressId = str(cq.id);
  if (!pressId || pressId.length > 100) return none("ignored");
  const m = /^([as]):(\d{1,15})$/.exec(str(cq.data));
  const message = obj(cq.message);
  const chatId = obj(message.chat).id;
  const messageId = message.message_id;
  if (!m || !isTelegramId(chatId) || typeof messageId !== "number" || !Number.isSafeInteger(messageId)) {
    await answerPress(pressId);
    return none("ignored");
  }
  const { data: d } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, created_at")
    .eq("id", Number(m[2])).eq("connector", "telegram").eq("telegram_chat_id", chatId).eq("telegram_message_id", messageId).maybeSingle();
  if (!d) {
    await answerPress(pressId);
    return none("unknown_message");
  }
  const at = async (outcome: TelegramOutcome, notice?: string): Promise<Handled> => {
    await answerPress(pressId, notice && (await mayAnswer(d.workspace_id as string, "telegram", String(chatId))) ? notice : undefined);
    return { outcome, workspaceId: d.workspace_id as string, deliveryId: d.id as number };
  };
  if (!(await telegramOnIn(d.workspace_id))) return at("ignored");
  if ((await personOfTelegramUser(d.workspace_id, userId)) !== d.recipient_id) return at("wrong_user");
  // An ended trial takes no reply and answers none, as if the message were too old (spec 0021).
  if (Date.now() - new Date(d.created_at).getTime() > REPLY_DAYS * 86_400_000 || (await trialEnded(d.workspace_id))) return at("expired", "This message is too old to act on.");
  if (m[1] === TELEGRAM_BUTTONS.approve && d.action_id) {
    // The same path as in Ziffr, which checks the person is this approval's approver and it is still open.
    try {
      await approve(d.workspace_id, d.action_id, d.recipient_id, { type: "telegram" });
      await answerIn(d.workspace_id as string, chatId, "Approved.", messageId);
      return at("approved", "Approved.");
    } catch {
      return at("refused", "This approval is done already.");
    }
  }
  if (m[1] === TELEGRAM_BUTTONS.stop && OPT_OUT_KINDS.includes(d.kind)) {
    const { data: added } = await db().from("telegram_opt_outs").upsert({ workspace_id: d.workspace_id, person_id: d.recipient_id }, { onConflict: "workspace_id,person_id", ignoreDuplicates: true }).select("person_id");
    if (added?.length) await tellOwnersOfStop(d.workspace_id, d.recipient_id, "on Telegram");
    await answerIn(d.workspace_id as string, chatId, "Stopped: no more requests for numbers or reminders on Telegram from this workspace. Turn them on again on the Connectors page in Ziffr.", messageId);
    return at("stopped", "Stopped.");
  }
  return at("ignored");
}

/** One round of polling (ZIFFR_TELEGRAM_POLLING=1, for a laptop): asks Telegram for what came after the last update
 * handled, and handles it. Telegram allows polling only without a webhook, so the first round takes it away. */
export async function pollTelegramOnce(waitSeconds = 0): Promise<{ handled: number }> {
  const settings = await settingsInEffect();
  if (!telegramEnabled(settings) || !telegramPolling(settings)) return { handled: 0 };
  const { data: last } = await db().from("telegram_updates").select("update_id").order("update_id", { ascending: false }).limit(1).maybeSingle();
  const offset = last ? Number(last.update_id) + 1 : undefined;
  let updates: unknown[];
  try {
    updates = await callTelegram<unknown[]>("getUpdates", { offset, timeout: waitSeconds, allowed_updates: ["message", "callback_query", "my_chat_member"] }, waitSeconds);
  } catch (e) {
    // A webhook is still set (409): take it away, as polling needs, and try next round.
    if (e instanceof Error && /error_409/.test(e.message)) await callTelegram("deleteWebhook", { drop_pending_updates: false });
    return { handled: 0 };
  }
  let handled = 0;
  for (const update of Array.isArray(updates) ? updates : []) {
    await receiveTelegramUpdate(update);
    handled++;
  }
  return { handled };
}
