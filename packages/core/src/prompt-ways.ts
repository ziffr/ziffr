// A Prompt on several ways at once (#613; GLOSSARY: Prompt, Delivery, Delivery Preference). One Prompt, one Delivery per
// way, all with the same prompt_id. The first accepted value closes the Prompt; the other Deliveries are told where it was
// answered, where the way allows (Slack and Telegram messages are edited, an email cannot be: its form link says so).
// Internal to the core: the caller has read the Prompt and the value was accepted for its Submitter.
import { db } from "./db";
import { CONNECTORS } from "./connectors/index";
import { slackEscape } from "./connectors/slack";
import { callSlack } from "./slack-api";
import { slackBot } from "./slack-connection";
import { callTelegram } from "./telegram-api";
import { telegramOnIn } from "./telegram-connection";
import { SOURCE_LABEL } from "./format";
import type { SourceId } from "./types";
import { isPracticeWorkspace } from "./practice";
import { combinedAsItStands, combinedListing } from "./internal/combined-delivery";

/** What a reply on this Delivery may answer: the Source it was offered on, or `web_form` when only a form link answers.
 * Deliveries made before several ways existed hold none and answer where their Prompt does. */
export async function answerSourceOf(d: { id: number; workspace_id: string }, promptSource: string): Promise<string> {
  const { data } = await db().from("deliveries").select("answer_source").eq("id", d.id).eq("workspace_id", d.workspace_id).maybeSingle();
  return (data?.answer_source as string | null | undefined) ?? promptSource;
}

/** The first accepted value closes a Prompt: claimed in one write, so two answers at once never both count as first.
 * Returns whether this one was first. Only then are the Prompt's other Deliveries marked answered and, where the way
 * allows, edited to say where and what ("Answered on Telegram: 3"). `said` holds only the person's own value and the
 * Metric they were asked about, and goes only to their own chats. */
export async function closePrompt(ws: string, promptId: number, source: SourceId, said: string): Promise<boolean> {
  const { data: claimed } = await db().from("prompts").update({ answered_at: new Date().toISOString(), answered_source: source }).eq("id", promptId).eq("workspace_id", ws).is("answered_at", null).select("id");
  if (!claimed?.length) return false;
  const { data: siblings } = await db().from("deliveries").select("id, connector, mail_state, status, slack_channel, slack_ts, telegram_chat_id, telegram_message_id")
    .eq("workspace_id", ws).eq("prompt_id", promptId).eq("kind", "prompt");
  const text = `Answered on ${SOURCE_LABEL[source]}: ${said}`;
  for (const d of siblings ?? []) {
    await db().from("deliveries").update({ status: "answered" }).eq("id", d.id).eq("workspace_id", ws).eq("status", "sent");
    // The Delivery the answer came on is told in the reply itself.
    if (CONNECTORS[d.connector as keyof typeof CONNECTORS].sourceId === source || d.mail_state !== "sent") continue;
    // An edit that fails changes nothing about the answer: the old message stays, and the form says it is answered.
    try {
      if (d.connector === "slack" && d.slack_channel && d.slack_ts) await editSlack(ws, d.slack_channel, d.slack_ts, text);
      else if (d.connector === "telegram" && d.telegram_chat_id && d.telegram_message_id) await editTelegram(ws, Number(d.telegram_chat_id), Number(d.telegram_message_id), text);
    } catch {
      // Nothing more to do here.
    }
  }
  for (const l of await combinedListing(ws, [promptId])) await markCombined(ws, l.deliveryId, (_, own) => source !== own);
  return true;
}

/** A Combined Prompt after one of its figures was answered: the Delivery counts as answered once every figure in it is,
 * and a sent chat message is edited, where `tell` says so, to mark each figure that needs nothing more. The message is
 * never replaced as a whole, and no value is put in it. */
async function markCombined(ws: string, deliveryId: number, tell: (answeredOn: (string | null)[], own: string | undefined) => boolean): Promise<void> {
  const { data: d } = await db().from("deliveries").select("id, connector, mail_state, slack_channel, slack_ts, telegram_chat_id, telegram_message_id").eq("id", deliveryId).eq("workspace_id", ws).maybeSingle();
  if (!d) return;
  // An edit that fails changes nothing about the answer: the old message stays, and the form says what is answered.
  try {
    const now = await combinedAsItStands(ws, deliveryId, (s) => (s && s in SOURCE_LABEL ? SOURCE_LABEL[s as SourceId] : "another way"));
    if (!now) return;
    if (now.allAnswered) await db().from("deliveries").update({ status: "answered" }).eq("id", d.id).eq("workspace_id", ws).eq("status", "sent");
    if (d.mail_state !== "sent" || !tell(now.answeredOn, CONNECTORS[d.connector as keyof typeof CONNECTORS].sourceId)) return;
    if (d.connector === "slack" && d.slack_channel && d.slack_ts) await editSlack(ws, d.slack_channel, d.slack_ts, now.text);
    else if (d.connector === "telegram" && d.telegram_chat_id && d.telegram_message_id) await editTelegram(ws, Number(d.telegram_chat_id), Number(d.telegram_message_id), now.text);
  } catch {
    // Nothing more to do here.
  }
}

/** The message as Slack shows it after the Prompt is answered: its text, no buttons, no attachment. */
async function editSlack(ws: string, channel: string, ts: string, text: string): Promise<void> {
  // Never from a Practice Workspace (spec 0063): the account it went to may no longer be the one switched on.
  if (await isPracticeWorkspace(ws)) return;
  const bot = await slackBot(ws);
  if (!bot) return;
  const plain = slackEscape(text).slice(0, 2900);
  await callSlack("chat.update", { channel, ts, text: plain, blocks: [{ type: "section", text: { type: "mrkdwn", text: plain } }], attachments: [] }, bot.token);
}

/** The message as Telegram shows it after the Prompt is answered: plain text, and no keyboard (none is sent with it). */
async function editTelegram(ws: string, chatId: number, messageId: number, text: string): Promise<void> {
  if (!(await telegramOnIn(ws)) || (await isPracticeWorkspace(ws))) return;
  await callTelegram("editMessageText", { chat_id: chatId, message_id: messageId, text: text.slice(0, 4000), link_preview_options: { is_disabled: true } });
}

/** A value that came without naming a Prompt (typed on the form link, which belongs to no message) answers the
 * Submitter's open Prompts for that Metric and period too, so the first answer by any way counts. */
export async function closeOpenPrompts(ws: string, metricId: number, personId: string, period: string, source: SourceId, said: string): Promise<void> {
  const { data: open } = await db().from("prompts").select("id").eq("workspace_id", ws).eq("metric_id", metricId).eq("submitter_id", personId).eq("period_start", period).is("answered_at", null);
  for (const p of open ?? []) await closePrompt(ws, p.id as number, source, said);
}

/** What an accepted value does to the Prompts it answers. One that names its Prompt closes it, and when that Prompt was
 * already answered on another way the value is still taken by the Metric's rule as any other, and the words say it came
 * second: never dropped without a word (returned to append to what the sender is told, empty when nothing is to add). A
 * value typed on the form link names no Prompt and answers the Submitter's open ones for that Metric and period. */
export async function settlePrompts(i: { ws: string; prompt: { id: number; answered_source: string | null } | null; metricId: number; senderId: string | null; source: SourceId; period: string; said: string }): Promise<string> {
  if (i.prompt) {
    if (await closePrompt(i.ws, i.prompt.id, i.source, i.said)) return "";
    const where = i.prompt.answered_source && i.prompt.answered_source in SOURCE_LABEL ? ` on ${SOURCE_LABEL[i.prompt.answered_source as SourceId]}` : "";
    return ` The request was already answered${where}; the Metric’s rule decided what this value did.`;
  }
  if (i.senderId && i.source === "web_form") await closeOpenPrompts(i.ws, i.metricId, i.senderId, i.period, i.source, i.said);
  return "";
}

/** A message sent after its Prompt was answered on another way (it waited for quiet hours or a retry, and the answer came
 * in between the check before sending and the send) is edited at once, as the others were. Best effort, like closePrompt. */
export async function tellIfAnswered(ws: string, deliveryId: number): Promise<void> {
  const { data: d } = await db().from("deliveries").select("id, connector, kind, prompt_id, slack_channel, slack_ts, telegram_chat_id, telegram_message_id").eq("id", deliveryId).eq("workspace_id", ws).maybeSingle();
  if (!d || d.kind !== "prompt") return;
  // A Combined Prompt names no single Prompt.
  if (!d.prompt_id) return markCombined(ws, deliveryId, (answeredOn, own) => answeredOn.some((s) => s !== own));
  const { data: p } = await db().from("prompts").select("answered_source").eq("id", d.prompt_id).eq("workspace_id", ws).not("answered_at", "is", null).maybeSingle();
  if (!p?.answered_source || CONNECTORS[d.connector as keyof typeof CONNECTORS].sourceId === p.answered_source) return;
  const text = `Answered on ${SOURCE_LABEL[p.answered_source as SourceId] ?? "another way"}.`;
  try {
    if (d.connector === "slack" && d.slack_channel && d.slack_ts) await editSlack(ws, d.slack_channel, d.slack_ts, text);
    else if (d.connector === "telegram" && d.telegram_chat_id && d.telegram_message_id) await editTelegram(ws, Number(d.telegram_chat_id), Number(d.telegram_message_id), text);
  } catch {
    // The message stays as it was.
  }
}
