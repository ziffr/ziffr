// Sending by Telegram (spec 0016, ticket #26; GLOSSARY: Delivery, Connector, Prompt). The Telegram Connector words each
// Delivery (connectors/telegram.ts); this sends it from the Installation's bot to the private chat the person
// connected themselves, through the queue every real Connector uses: queued, claimed in the database within limits,
// retried by the job. Never in the demo, never where the workspace has Telegram off, never to someone not connected.
import { db } from "./db";
import { archivedMetricHolds, failForGood, withFormLink } from "./internal/delivery-send";
import { openRows } from "./sealed-columns";
import { giveUpAfter, OPT_OUT_KINDS, type SendResult } from "./mail";
import { sendingLimit } from "./sending-limit";
import { sendingLimitDefault } from "./sending-limits";
import { forgetStaleTelegramTests } from "./installation-telegram-test";
import { callTelegram, TelegramError } from "./telegram-api";
import { telegramOnIn } from "./telegram-connection";
import { forgetTelegramUser, telegramChatOf } from "./telegram-people";
import { tellIfAnswered } from "./prompt-ways";
import { DEMO_WORKSPACE_ID } from "./team";
import { claimTrialSend, keepInOutbox, trialHoldsBack } from "./trials";

/** Telegram messages one workspace may send in 24 hours, unless ZIFFR_LIMIT_CHAT_MESSAGES_PER_WORKSPACE_PER_DAY says otherwise (the default); the rest wait in the queue. */
export const TELEGRAM_PER_WORKSPACE_PER_DAY = sendingLimitDefault("chatPerWorkspace");
/** Telegram messages one chat may get in an hour; the rest wait. */
export const TELEGRAM_PER_RECIPIENT_PER_HOUR = 20;
/** Telegram messages one person may cause in 24 hours (as the sender of Prompts, questions, notices). */
export const TELEGRAM_PER_SENDER_PER_DAY = 300;
/** Messages the bot sends in a second across every workspace, below Telegram's thirty. One a second per chat is in
 * the claim itself. */
export const TELEGRAM_PER_BOT_PER_SECOND = 25;
/** The longest message Telegram takes. */
const MAX_TEXT = 4096;

/** What a button's callback_data says: its action and the Delivery, nothing of the workspace (at most 64 bytes). */
export const TELEGRAM_BUTTONS = { approve: "a", stop: "s" } as const;

/** A Prompt's or reminder's button, and an approval task's: what the recipient can do without opening Ziffr. */
async function buttons(d: { id: number; workspace_id: string; kind: string; action_id: number | null }) {
  const row: { text: string; callback_data: string }[] = [];
  if (d.action_id && d.kind === "task") {
    const { data: a } = await db().from("actions").select("purpose, status").eq("id", d.action_id).eq("workspace_id", d.workspace_id).maybeSingle();
    if (a?.purpose === "approval" && a.status === "open") row.push({ text: "Approve", callback_data: `${TELEGRAM_BUTTONS.approve}:${d.id}` });
  }
  if (OPT_OUT_KINDS.includes(d.kind)) row.push({ text: "Stop these on Telegram", callback_data: `${TELEGRAM_BUTTONS.stop}:${d.id}` });
  return row.length ? { inline_keyboard: [row] } : undefined;
}

/** Whether a new Telegram Delivery in this workspace is really sent: Telegram is on there (never in the demo). */
export async function telegramSends(workspaceId: string): Promise<boolean> {
  return telegramOnIn(workspaceId);
}

/** Sends one queued Telegram Delivery. It is claimed first, so the immediate send and the retry job never both send it. */
export async function sendTelegramDelivery(id: number): Promise<SendResult> {
  const maxAttempts = await sendingLimit("sendAttempts");
  const { data: found } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, body, attempts, form_token_id, prompt_id, alert_metric_id, heads_up_metric_a, heads_up_metric_b, heads_up_key, heads_up_told_id, tell_workflow_id, snapshot_dashboard_id")
    .eq("id", id).eq("connector", "telegram").eq("mail_state", "queued").lt("attempts", maxAttempts).maybeSingle();
  if (!found) return "skipped";
  const [d] = await openRows("deliveries", found.workspace_id, [found]);
  // What never goes out, whatever the limits: it is marked failed for good, if it is still queued.
  const never = (why: string) => failForGood(id, why);
  // Words that do not open (changed in the database, or under a destroyed key) never go out, not even as "null".
  if (d.body === null) return never("Its text cannot be read any more.");
  // Nothing goes out for an Archived Metric, also when it was archived after this was queued.
  const archived = await archivedMetricHolds(d);
  if (archived) return never(archived);
  // A trial reaches only people who accepted, never a Contact, whatever is set up (ADR 0015).
  const held = await trialHoldsBack(d.workspace_id, d.recipient_id);
  if (held) return keepInOutbox(id, held);
  if (d.workspace_id === DEMO_WORKSPACE_ID || !(await telegramOnIn(d.workspace_id))) return never("Telegram is off in this workspace.");
  // Someone who stopped Prompts and reminders on Telegram gets none, also ones queued before they stopped.
  if (OPT_OUT_KINDS.includes(d.kind)) {
    const { data: out } = await db().from("telegram_opt_outs").select("person_id").eq("workspace_id", d.workspace_id).eq("person_id", d.recipient_id).maybeSingle();
    if (out) return never("They stopped reminders on Telegram.");
  }
  const chat = await telegramChatOf(d.workspace_id, d.recipient_id);
  if (!chat) return never("Not connected to Telegram.");
  // Claimed in the database within the limits, so neither parallel sends nor many Deliveries pass them.
  const trial = await claimTrialSend(id);
  if (trial === "wait") return "waiting";
  if (trial === "gone") return "skipped";
  const { data: claim, error } = await db().rpc("claim_telegram_send", {
    p_id: id, p_chat: chat.chatId, p_per_workspace: await sendingLimit("chatPerWorkspace"), p_per_recipient: TELEGRAM_PER_RECIPIENT_PER_HOUR,
    p_per_sender: TELEGRAM_PER_SENDER_PER_DAY, p_per_bot_second: TELEGRAM_PER_BOT_PER_SECOND, p_max_attempts: maxAttempts,
  });
  if (error) throw new Error("The Telegram message could not be claimed for sending.");
  if (claim === "wait") return "waiting";
  if (claim !== "ok") return "skipped";
  const text = await withFormLink(String(d.body), d, String(process.env.ZIFFR_SITE_URL));
  const markup = await buttons(d);
  try {
    const sent = await callTelegram<{ message_id?: unknown; chat?: { id?: unknown } }>("sendMessage", {
      chat_id: chat.chatId,
      // Plain text, no parse mode: nothing in the workspace's words becomes formatting or a hidden link.
      text: text.slice(0, MAX_TEXT),
      link_preview_options: { is_disabled: true },
      ...(markup ? { reply_markup: markup } : {}),
    });
    const messageId = typeof sent?.message_id === "number" && Number.isSafeInteger(sent.message_id) && sent.message_id > 0 ? sent.message_id : null;
    if (!messageId) throw new TelegramError("no_message_id");
    await db().from("deliveries").update({ mail_state: "sent", attempts: Number(d.attempts) + 1, sent_at: new Date().toISOString(), provider_id: String(messageId), telegram_chat_id: chat.chatId, telegram_message_id: messageId, last_error: null }).eq("id", id);
    await tellIfAnswered(d.workspace_id, id);
    return "sent";
  } catch (e) {
    return trouble(e, id, Number(d.attempts), chat.userId);
  }
}

/** A Telegram call that did not work: a limit waits without using an attempt, a blocked bot (403) ends that person's
 * links, anything else counts as a failed attempt. Only Telegram's error code is kept. */
async function trouble(e: unknown, id: number, attempts: number, userId: number): Promise<SendResult> {
  const code = e instanceof TelegramError ? e.code : "error";
  if (e instanceof TelegramError && e.code === "too_many_requests") {
    // Telegram's wait, not ours: the send it refused does not count against Ziffr's limits either.
    await db().from("telegram_sends").delete().eq("delivery_id", id);
    await db().from("deliveries").update({ mail_state: "queued", not_before: new Date(Date.now() + (e.retryAfter ?? 30) * 1000).toISOString(), last_error: "Telegram asked to wait." }).eq("id", id);
    return "waiting";
  }
  if (code === "error_403") {
    // They blocked the bot: Telegram will refuse every message, so the link ends here as it would by the update.
    await forgetTelegramUser(userId);
    await db().from("deliveries").update({ mail_state: "failed", last_error: "They blocked Ziffr's bot in Telegram." }).eq("id", id);
    return "failed";
  }
  const next = attempts + 1;
  await db().from("deliveries").update({ mail_state: next >= (await sendingLimit("sendAttempts")) ? "failed" : "queued", attempts: next, last_attempt_at: new Date().toISOString(), last_error: `Telegram refused it (${code}).`.slice(0, 200) }).eq("id", id);
  return "failed";
}

/** Sends the Telegram Deliveries that are due (as every Connector's queue chooses them), at most `limit` per run. */
export async function sendWaitingTelegram(limit = 50): Promise<{ sent: number; failed: number }> {
  // Updates and sends are kept only for dedupe, reply counting and limits, which look back 30 days at most.
  const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
  await db().from("telegram_updates").delete().lt("received_at", old);
  await db().from("telegram_sends").delete().lt("sent_at", old);
  // The Installation Settings page's Telegram tests keep a chat only while they wait.
  await forgetStaleTelegramTests();
  const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
  await db().from("deliveries").update({ mail_state: "queued" }).eq("connector", "telegram").eq("mail_state", "sending").lt("last_attempt_at", tenMinutesAgo);
  const maxAttempts = await sendingLimit("sendAttempts");
  await giveUpAfter(maxAttempts, "telegram");
  const { data: ids, error } = await db().rpc("due_deliveries_via", { p_connector: "telegram", p_limit: limit, p_max_attempts: maxAttempts });
  if (error) throw new Error("The waiting Telegram messages could not be read.");
  let sent = 0;
  let failed = 0;
  for (const r of (ids ?? []) as (number | { due_deliveries_via: number })[]) {
    const out = await sendTelegramDelivery(typeof r === "number" ? r : r.due_deliveries_via);
    if (out === "sent") sent++;
    else if (out === "failed") failed++;
  }
  return { sent, failed };
}
