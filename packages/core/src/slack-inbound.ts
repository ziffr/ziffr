// Answers by Slack (spec 0007, ticket #104; GLOSSARY: Delivery, Thread, Prompt, Correction, Approval). Slack signs
// every event and button press with the app's signing secret and names the Slack user who wrote or pressed. A reply
// is taken only in the thread of a Delivery that was sent, from the Slack user that Delivery's recipient is matched
// to now, within 30 days, once per event; then it goes the way an email reply goes (reply-routing.ts). The same checks
// stand before a window opens (**Add a note**, **Enter all**) and before what was typed into it is taken
// (slack-window.ts).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { tellOwnersOfStop } from "./email-opt-out";
import { OPT_OUT_KINDS } from "./mail";
import { routeReply, type RepliedDelivery } from "./reply-routing";
import { repliesAllowed } from "./prompt-reply";
import { callSlack, slackOn } from "./slack-api";
import { noteSlackEventsChecked } from "./slack-setup";
import { slackBotOfTeam, slackConnectionEnded, type SlackBot } from "./slack-connection";
import { isSlackId, linkSlackByCode, personOfSlackUser } from "./slack-people";
import { SLACK_BUTTONS } from "./slack-send";
import type { SubmissionEffects } from "./submissions";
import { approve } from "./workflow-engine";
import { trialEnded } from "./trials";
import { mayAnswer } from "./practice";
import { closeQuestions, questionsIn } from "./note-question";
import { SLACK_ANSWER_BUTTONS } from "./slack-buttons";
import { openEntryWindow, openNotesWindow, SLACK_WINDOWS, slackSay, takeWindow } from "./slack-window";
import { personBlocked } from "./user-block";

/** Largest event taken from Slack, in bytes; they are far smaller. */
export const MAX_SLACK_BYTES = 64 * 1024;
/** Largest interactivity request, in bytes: a submitted **Enter all** window carries its own fields and up to 40 notes
 * of 1,000 characters, form-encoded. */
export const MAX_SLACK_INTERACTION_BYTES = 640 * 1024;
/** Replies taken for one Delivery (2 more for each figure of a Combined Prompt, at most 60); more are ignored. */
export const MAX_SLACK_REPLIES_PER_DELIVERY = 20;
/** Answers the bot gives in a minute to messages outside a thread (hints, link codes), per workspace. */
const MAX_ANSWERS_PER_MINUTE = 10;
/** How long a Delivery takes replies in its thread. */
const REPLY_DAYS = 30;

/** Whether a request was signed by Slack with this signing secret (the one in effect) a moment ago: `v0=` and the hex
 * HMAC-SHA256 of "v0:<timestamp>:<raw body>", compared in constant time, the timestamp within five minutes. */
export function slackSigned(timestamp: string | null, signature: string | null, body: Uint8Array | string, secret: string | null | undefined, now = Date.now()): boolean {
  if (!secret || !timestamp || !signature || !/^\d{9,11}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const given = /^v0=([0-9a-f]{64})$/.exec(signature)?.[1];
  if (!given) return false;
  const mac = createHmac("sha256", secret).update(`v0:${timestamp}:`).update(body).digest();
  const sent = Buffer.from(given, "hex");
  return sent.length === mac.length && timingSafeEqual(sent, mac);
}

/** What became of an event or a button press, for Slack's logs and ours; never more than the outcome's name. */
export type SlackOutcome =
  | "recorded" | "refused" | "form_link" | "replied" | "corrected" | "noted" | "closed" | "approved" | "stopped" | "linked" | "hint"
  | "opened" | "taken" | "unknown_team" | "unknown_thread" | "expired" | "wrong_user" | "duplicate" | "too_many" | "empty" | "ignored" | "disconnected";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");
const TS = /^[0-9]{1,12}\.[0-9]{1,8}$/;

/** Slack's message text as plain words: mentions dropped, links as their label, its escapes undone. */
export function slackText(text: string): string {
  return String(text).replace(/<[@#!][^>]*>/g, "").replace(/<([^|>]+)\|([^>]+)>/g, "$2").replace(/<([^>]+)>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim().slice(0, 5000);
}

/** Takes one request from the Events API, already checked to be signed. Answers url_verification with its
 * challenge, and notes for the Installation Settings page that Slack reached the events address with the signing
 * secret it was checked with (`signedWith`); everything else is claimed by its event_id first, so a retry from Slack changes nothing. */
export async function receiveSlackEvent(body: unknown, effects: { submission?: SubmissionEffects; signedWith?: string } = {}): Promise<{ challenge?: string; outcome: SlackOutcome }> {
  const b = obj(body);
  if (b.type === "url_verification") {
    const challenge = str(b.challenge);
    // The secret the signature was checked with; without it (a caller that checked none), nothing is noted.
    await noteSlackEventsChecked(effects.signedWith ?? null);
    return /^[A-Za-z0-9_-]{1,200}$/.test(challenge) ? { challenge, outcome: "ignored" } : { outcome: "ignored" };
  }
  if (b.type !== "event_callback" || !(await slackOn())) return { outcome: "ignored" };
  const eventId = str(b.event_id);
  if (!/^[A-Za-z0-9]{3,40}$/.test(eventId)) return { outcome: "ignored" };
  // Only a Slack workspace that is connected, and only for this installation's own app.
  const bot = await slackBotOfTeam(str(b.team_id));
  if (!bot || str(b.api_app_id) !== bot.appId) return { outcome: "unknown_team" };
  const { data: claim, error } = await db().from("slack_events").insert({ event_id: eventId, team_id: bot.teamId, workspace_id: bot.workspaceId, outcome: "taken" }).select("id").single();
  if (error?.code === "23505") return { outcome: "duplicate" };
  if (error || !claim) throw new Error("The Slack event could not be recorded.");
  const { outcome, deliveryId } = await handle(bot, obj(b.event), effects);
  await db().from("slack_events").update({ outcome, delivery_id: deliveryId }).eq("id", claim.id);
  return { outcome };
}

async function handle(bot: SlackBot, e: Obj, effects: { submission?: SubmissionEffects }): Promise<{ outcome: SlackOutcome; deliveryId: number | null }> {
  const none = (outcome: SlackOutcome) => ({ outcome, deliveryId: null });
  if (e.type === "app_uninstalled") { await slackConnectionEnded(bot.teamId); return none("disconnected"); }
  if (e.type === "tokens_revoked") {
    const bots = obj(e.tokens).bot;
    if (Array.isArray(bots) && bots.includes(bot.botUserId)) { await slackConnectionEnded(bot.teamId); return none("disconnected"); }
    return none("ignored");
  }
  // A person's own message in a direct message with the bot: no edits, joins or other bots (their subtype or
  // bot_id), never the bot itself, which would answer its own confirmations.
  const user = str(e.user);
  const channel = str(e.channel);
  if (e.type !== "message" || e.channel_type !== "im" || e.subtype !== undefined || e.bot_id !== undefined || !isSlackId(user) || user === bot.botUserId || !isSlackId(channel)) return none("ignored");
  const text = slackText(str(e.text));
  const threadTs = TS.test(str(e.thread_ts)) ? str(e.thread_ts) : null;
  const ts = TS.test(str(e.ts)) ? str(e.ts) : null;
  if (!threadTs || threadTs === ts) {
    // Outside a thread: a link code, or a hint. Guessing which message it answers could record a number for the
    // wrong Metric. The bot answers these at most ten times a minute per workspace, so a flood of messages cannot use
    // up the Slack workspace's budget for real Deliveries.
    const { count } = await db().from("slack_events").select("id", { count: "exact", head: true }).eq("workspace_id", bot.workspaceId).in("outcome", ["hint", "linked", "refused"]).gt("received_at", new Date(Date.now() - 60_000).toISOString());
    const quiet = (count ?? 0) >= MAX_ANSWERS_PER_MINUTE;
    if (/\bZIF-[A-Z2-7]{16}\b/i.test(text)) {
      // A code still links when the bot keeps quiet: a flood by others must not stop someone linking.
      const name = await linkSlackByCode(bot, user, text);
      if (!quiet) await slackSay(bot, channel, null, user, name ? `Linked: you get Ziffr messages for ${name} here.` : "That code is not known or has run out. Make a new one on the Connectors page in Ziffr.");
      return none(name ? "linked" : "refused");
    }
    if (quiet) return none("too_many");
    await slackSay(bot, channel, null, user, "To answer, reply in the thread of the message you are answering.");
    return none("hint");
  }
  const { data: d } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, prompt_id, combined, created_at")
    .eq("workspace_id", bot.workspaceId).eq("connector", "slack").eq("slack_channel", channel).eq("slack_ts", threadTs).maybeSingle();
  if (!d) return none("unknown_thread");
  const at = (outcome: SlackOutcome) => ({ outcome, deliveryId: d.id as number });
  // An ended trial takes no reply and answers none, as if the message were too old (spec 0021).
  if (Date.now() - new Date(d.created_at).getTime() > REPLY_DAYS * 86_400_000 || (await trialEnded(d.workspace_id))) return at("expired");
  // Only the person it went to, as Slack knows them now: someone else in the thread answers nothing.
  if ((await personOfSlackUser(bot.workspaceId, bot.teamId, user)) !== d.recipient_id) return at("wrong_user");
  const { count } = await db().from("slack_events").select("id", { count: "exact", head: true }).eq("delivery_id", d.id).not("outcome", "in", "(expired,wrong_user,too_many)");
  if ((count ?? 0) >= (await repliesAllowed(d.id as number, MAX_SLACK_REPLIES_PER_DELIVERY))) return at("too_many");
  if (!text) return at("empty");
  const outcome = await routeReply(d as RepliedDelivery, text, {
    source: "slack", sender: `slack:${user}`, provenPersonId: d.recipient_id,
    answer: (subject, detail, _link, how) => slackSay(bot, channel, threadTs, user, how?.bare ? detail : `${subject}: ${detail}`, how?.ask ? (d.id as number) : undefined),
  }, effects.submission);
  return at(outcome === "unknown_token" ? "unknown_thread" : outcome);
}

/** What a press or a window sets off. `later` runs work after Slack was answered, which it expects within three
 * seconds; without it the work runs at once and its outcome is answered. */
export type SlackInteractionEffects = { submission?: SubmissionEffects; later?: (work: () => Promise<void>) => void };

/** Takes one interactivity request, already checked to be signed: a button press or a submitted window. Only a Ziffr
 * button, on a message a Delivery was sent as or on the question answering it, or a window Ziffr opened, from the Slack
 * user that Delivery's recipient is matched to. */
export async function receiveSlackInteraction(payload: unknown, effects: SlackInteractionEffects = {}): Promise<SlackOutcome> {
  const p = obj(payload);
  if (p.type === "view_submission") return submitted(p, effects);
  if (p.type !== "block_actions" || !(await slackOn())) return "ignored";
  const bot = await slackBotOfTeam(str(obj(p.team).id));
  if (!bot || str(p.api_app_id) !== bot.appId) return "unknown_team";
  // A press has no event_id: its trigger_id, unique per press, claims it once, so a replayed request does nothing.
  const trigger = str(p.trigger_id);
  if (!trigger || trigger.length > 200) return "ignored";
  const pressId = `I${createHash("sha256").update(trigger).digest("hex").slice(0, 38)}`;
  const { data: claim, error } = await db().from("slack_events").insert({ event_id: pressId, team_id: bot.teamId, workspace_id: bot.workspaceId, outcome: "taken" }).select("id").single();
  if (error?.code === "23505") return "duplicate";
  if (error || !claim) throw new Error("The Slack button press could not be recorded.");
  const outcome = await pressed(bot, p);
  await db().from("slack_events").update({ outcome }).eq("id", claim.id);
  return outcome;
}

async function pressed(bot: SlackBot, p: Obj): Promise<SlackOutcome> {
  const action = obj(Array.isArray(p.actions) ? p.actions[0] : null);
  const container = obj(p.container);
  const channel = str(container.channel_id);
  const ts = str(container.message_ts);
  const id = Number(str(action.value));
  if (!Number.isSafeInteger(id) || id <= 0 || !isSlackId(channel) || !TS.test(ts)) return "ignored";
  const presser = str(obj(p.user).id);
  // The buttons under a question stand on Ziffr's answer in the thread, not on the message itself.
  if (action.action_id === SLACK_ANSWER_BUTTONS.addNote || action.action_id === SLACK_ANSWER_BUTTONS.noNote) return questionPressed(bot, p, { id, channel, ts, presser, adds: action.action_id === SLACK_ANSWER_BUTTONS.addNote });
  const { data: d } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, prompt_id, combined, created_at")
    .eq("id", id).eq("workspace_id", bot.workspaceId).eq("connector", "slack").eq("slack_channel", channel).eq("slack_ts", ts).maybeSingle();
  if (!d) return "unknown_thread";
  if ((await personOfSlackUser(bot.workspaceId, bot.teamId, presser)) !== d.recipient_id) return "wrong_user";
  // An ended trial takes no reply and answers none, as if the message were too old (spec 0021).
  if (Date.now() - new Date(d.created_at).getTime() > REPLY_DAYS * 86_400_000 || (await trialEnded(d.workspace_id))) return "expired";
  if (action.action_id === SLACK_BUTTONS.approve && d.action_id) {
    // A Blocked User decides nothing (spec 0066).
    if (await personBlocked(d.recipient_id)) return "refused";
    // Slack vouches for who pressed it, unlike an email's From: an Approval is taken here, by the same path as in
    // Ziffr, which checks the person is this approval's approver and it is still open.
    try {
      await approve(d.workspace_id, d.action_id, d.recipient_id, { type: "slack" });
      await slackSay(bot, channel, ts, presser, "Approved.");
      return "approved";
    } catch {
      await slackSay(bot, channel, ts, presser, "This approval is done already.");
      return "refused";
    }
  }
  if (action.action_id === SLACK_ANSWER_BUTTONS.enterAll && d.kind === "prompt" && d.combined) {
    // A Blocked User records nothing (spec 0066), and a Practice Workspace shows its names to its own person only.
    if ((await personBlocked(d.recipient_id)) || !(await mayAnswer(bot.workspaceId, "slack", `${bot.teamId}:${presser}`))) return "refused";
    if (await openEntryWindow(bot, d, str(p.trigger_id))) return "opened";
    await slackSay(bot, channel, ts, presser, "Nothing here can be entered in Slack now. Use the link in the message.");
    return "refused";
  }
  if (action.action_id === SLACK_BUTTONS.stop && OPT_OUT_KINDS.includes(d.kind)) {
    const { data: added } = await db().from("slack_opt_outs").upsert({ workspace_id: d.workspace_id, person_id: d.recipient_id }, { onConflict: "workspace_id,person_id", ignoreDuplicates: true }).select("person_id");
    if (added?.length) await tellOwnersOfStop(d.workspace_id, d.recipient_id, "slack");
    await slackSay(bot, channel, ts, presser, "Stopped: no more requests for numbers or reminders on Slack from this workspace. Turn them on again on the Connectors page in Ziffr.");
    return "stopped";
  }
  return "ignored";
}

// The Delivery of a request in this Slack workspace, when this Slack user is its recipient now and it still takes
// replies; else why not.
async function ownRequest(bot: SlackBot, id: number, user: string) {
  const { data: d } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, prompt_id, combined, created_at, slack_channel, slack_ts")
    .eq("id", id).eq("workspace_id", bot.workspaceId).eq("connector", "slack").eq("kind", "prompt").maybeSingle();
  if (!d?.slack_channel || !d.slack_ts) return { no: "unknown_thread" as const };
  if ((await personOfSlackUser(bot.workspaceId, bot.teamId, user)) !== d.recipient_id) return { no: "wrong_user" as const };
  if (Date.now() - new Date(d.created_at).getTime() > REPLY_DAYS * 86_400_000 || (await trialEnded(d.workspace_id))) return { no: "expired" as const };
  // A Blocked User records nothing (spec 0066), and a Practice Workspace shows its names to its own person only.
  if ((await personBlocked(d.recipient_id)) || !(await mayAnswer(bot.workspaceId, "slack", `${bot.teamId}:${user}`))) return { no: "refused" as const };
  return { d: d as typeof d & { slack_channel: string; slack_ts: string } };
}

// **Add a note** or **No note**: only on the very message that asked, for the Delivery its button names.
async function questionPressed(bot: SlackBot, p: Obj, at: { id: number; channel: string; ts: string; presser: string; adds: boolean }): Promise<SlackOutcome> {
  const found = await ownRequest(bot, at.id, at.presser);
  if ("no" in found) return found.no!;
  const { d } = found;
  if (d.slack_channel !== at.channel) return "unknown_thread";
  const asked = await questionsIn(d.workspace_id, d.id, at.ts);
  if (!asked.length) return "unknown_thread";
  if (at.adds) {
    if (await openNotesWindow(bot, d, at.ts, str(p.trigger_id))) return "opened";
    await slackSay(bot, at.channel, d.slack_ts, at.presser, "No note can be added here now. Reply in the thread, or open Ziffr.");
    return "refused";
  }
  await closeQuestions(d.workspace_id, d.id, asked.map((q) => q.promptId));
  await withoutButtons(bot, at.channel, at.ts, obj(p.message).blocks);
  return "closed";
}

// Takes the buttons off the question once "No note" answered it: its own words stay, as Slack sent them back.
async function withoutButtons(bot: SlackBot, channel: string, ts: string, blocks: unknown) {
  const words = str(obj(obj(Array.isArray(blocks) ? blocks[0] : null).text).text).slice(0, 2900);
  if (!words) return;
  const text = `${words}\nNo note.`;
  try {
    await callSlack("chat.update", { channel, ts, text, blocks: [{ type: "section", text: { type: "mrkdwn", text } }] }, bot.token);
  } catch {
    // The question is closed either way.
  }
}

// A submitted window of Ziffr's. Claimed by the window's id, so it is taken once; Slack is answered at once (`later`)
// and what became of it is posted in the message's thread.
async function submitted(p: Obj, effects: SlackInteractionEffects): Promise<SlackOutcome> {
  const view = obj(p.view);
  const window = str(view.callback_id);
  if ((window !== SLACK_WINDOWS.notes && window !== SLACK_WINDOWS.entries) || !(await slackOn())) return "ignored";
  const bot = await slackBotOfTeam(str(obj(p.team).id));
  if (!bot || str(p.api_app_id) !== bot.appId) return "unknown_team";
  const viewId = str(view.id);
  let meta: Obj = {};
  try {
    meta = obj(JSON.parse(str(view.private_metadata).slice(0, 500)));
  } catch {
    return "ignored";
  }
  const id = meta.d;
  const asked = window === SLACK_WINDOWS.notes ? str(meta.m) : null;
  if (!viewId || viewId.length > 200 || typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || (asked !== null && !TS.test(asked))) return "ignored";
  const claimId = `V${createHash("sha256").update(viewId).digest("hex").slice(0, 38)}`;
  const { data: claim, error } = await db().from("slack_events").insert({ event_id: claimId, team_id: bot.teamId, workspace_id: bot.workspaceId, outcome: "taken" }).select("id").single();
  if (error?.code === "23505") return "duplicate";
  if (error || !claim) throw new Error("The Slack window could not be recorded.");
  const work = async (): Promise<SlackOutcome> => {
    const user = str(obj(p.user).id);
    const found = await ownRequest(bot, id, user);
    let outcome: SlackOutcome;
    let deliveryId: number | null = null;
    if ("no" in found) outcome = found.no!;
    else {
      const { d } = found;
      deliveryId = d.id as number;
      // A window counts as a reply to its message, within the same limit.
      const { count } = await db().from("slack_events").select("id", { count: "exact", head: true }).eq("delivery_id", d.id).not("outcome", "in", "(expired,wrong_user,too_many)");
      outcome = (count ?? 0) >= (await repliesAllowed(d.id as number, MAX_SLACK_REPLIES_PER_DELIVERY)) ? "too_many"
        : await takeWindow(bot, d, user, { values: obj(view.state).values, asked }, effects.submission);
    }
    await db().from("slack_events").update({ outcome, delivery_id: deliveryId }).eq("id", claim.id);
    return outcome;
  };
  if (!effects.later) return work();
  effects.later(async () => { await work(); });
  return "taken";
}
