// Updates from Telegram (spec 0016, tickets #25 and #27; GLOSSARY: Connector, Delivery). Telegram sends every update
// to the webhook with the secret only it and Ziffr know (or polling fetches them on a laptop). Each update is claimed
// by its update_id before anything else, so a retry changes nothing. Here: linking with /start, /stop, the bot being
// blocked, and replies: a reply to a sent Delivery, from the Telegram account that Delivery's recipient connected,
// within 30 days, goes the way an email or Slack reply goes (reply-routing.ts). Button presses follow in their ticket.
import { timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { routeReply, type RepliedDelivery } from "./reply-routing";
import type { SubmissionEffects } from "./submissions";
import { callTelegram, telegramEnabled, telegramPolling, telegramWebhookSecret } from "./telegram-api";
import { telegramOnIn } from "./telegram-connection";
import { forgetTelegramUser, isTelegramId, linkTelegramByCode, personOfTelegramUser } from "./telegram-people";

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
  | "linked" | "refused" | "unlinked" | "blocked" | "hint" | "duplicate" | "too_many" | "ignored"
  | "recorded" | "form_link" | "replied" | "corrected" | "empty" | "unknown_message" | "expired" | "wrong_user";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Whether a webhook request carries the secret this Ziffr registered, compared in constant time. */
export function telegramSecretOk(given: string | null): boolean {
  const wanted = telegramWebhookSecret();
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

/** Whether the bot already answered this account ten times in the last minute. */
async function quiet(userId: number): Promise<boolean> {
  const { count } = await db().from("telegram_updates").select("update_id", { count: "exact", head: true })
    .eq("telegram_user_id", userId).in("outcome", ["hint", "linked", "refused", "unlinked"]).gt("received_at", new Date(Date.now() - 60_000).toISOString());
  return (count ?? 0) >= MAX_ANSWERS_PER_MINUTE;
}

/** Takes one update, already known to come from Telegram (the webhook's secret, or polling with the bot token). */
export async function receiveTelegramUpdate(update: unknown, effects: { submission?: SubmissionEffects } = {}): Promise<TelegramOutcome> {
  if (!telegramEnabled()) return "ignored";
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
    // A code still links when the bot keeps quiet: a flood by others must not stop someone linking.
    const result = await linkTelegramByCode({ code: start[1], userId, chatId, chatType: chat.type });
    if (!silent) {
      await telegramSay(chatId, result.linked
        ? `Connected: you get Ziffr messages for ${result.workspace} here. To answer one, reply to it. Send /stop to stop all of them.`
        : result.why === "expired" ? "That link has run out. Choose “Connect Telegram” in Ziffr again." : "That link does not work. Choose “Connect Telegram” in Ziffr again.");
    }
    return none(result.linked ? "linked" : "refused");
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
  return reply(userId, chatId, repliedTo, Number(msg.message_id) || undefined, text, effects);
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
  if (Date.now() - new Date(d.created_at).getTime() > REPLY_DAYS * 86_400_000) return at("expired");
  // Only the person it went to, as linked now: a chat that changed hands answers nothing.
  if ((await personOfTelegramUser(d.workspace_id, userId)) !== d.recipient_id) return at("wrong_user");
  const { count } = await db().from("telegram_updates").select("update_id", { count: "exact", head: true }).eq("delivery_id", d.id).not("outcome", "in", "(expired,wrong_user,too_many)");
  if ((count ?? 0) >= MAX_TELEGRAM_REPLIES_PER_DELIVERY) return at("too_many");
  if (!text) return at("empty");
  const outcome = await routeReply(d as RepliedDelivery, text.slice(0, 5000), {
    source: "telegram", sender: `telegram:${userId}`, provenPersonId: d.recipient_id,
    answer: (subject, detail) => telegramSay(chatId, `${subject}: ${detail}`, messageId),
  }, effects.submission);
  return at(outcome === "unknown_token" ? "unknown_message" : outcome);
}

const from = (msg: Obj) => obj(msg.from);

/** One round of polling (ZIFFR_TELEGRAM_POLLING=1, for a laptop): asks Telegram for what came after the last update
 * handled, and handles it. Telegram allows polling only without a webhook, so the first round takes it away. */
export async function pollTelegramOnce(waitSeconds = 0): Promise<{ handled: number }> {
  if (!telegramEnabled() || !telegramPolling()) return { handled: 0 };
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
