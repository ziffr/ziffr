// Sending by Slack (spec 0007, ticket #103; GLOSSARY: Delivery, Connector, Prompt). The Slack Connector has always
// worded each Delivery; this sends it as a direct message from the workspace's bot, through the queue email uses:
// queued, claimed in the database within limits, retried by the job. Only to the Slack user a member or Contact of
// the Delivery's workspace was found as (slack-people.ts), never in the demo, and nothing without a connection.
import { db } from "./db";
import { FORM_LINK, MAX_ATTEMPTS, OPT_OUT_KINDS, type SendResult } from "./mail";
import { callSlack, slackOn, SlackError, TOKEN_GONE } from "./slack-api";
import { slackBot, slackConnectionEnded, type SlackBot } from "./slack-connection";
import { slackUserFor } from "./slack-people";
import { DEMO_WORKSPACE_ID } from "./team";
import { claimTrialSend, keepInOutbox, trialHoldsBack } from "./trials";

/** Slack messages one workspace may send in 24 hours; the rest wait in the queue. */
export const SLACK_PER_WORKSPACE_PER_DAY = 500;
/** Slack messages one person may get in an hour from one Slack workspace; the rest wait. */
export const SLACK_PER_RECIPIENT_PER_HOUR = 20;
/** Slack messages one person may cause in 24 hours (as the sender of Prompts, questions, notices). */
export const SLACK_PER_SENDER_PER_DAY = 300;
/** Messages to one Slack workspace in a minute, below chat.postMessage's own limit for a workspace. */
export const SLACK_PER_TEAM_PER_MINUTE = 40;

/** The action ids of the buttons Ziffr puts on a message; the interactions endpoint takes only these. */
export const SLACK_BUTTONS = { approve: "ziffr_approve", stop: "ziffr_stop" } as const;

/** Whether a new Slack Delivery in this workspace is really sent: Slack is set up and the workspace connected. */
export async function slackSends(workspaceId: string): Promise<boolean> {
  if (workspaceId === DEMO_WORKSPACE_ID || !(await slackOn())) return false;
  const { data } = await db().from("slack_installations").select("workspace_id").eq("workspace_id", workspaceId).is("revoked_at", null).maybeSingle();
  return Boolean(data);
}

/** A Prompt's or reminder's buttons, and an approval task's: what the recipient can do without opening Ziffr. */
async function buttons(d: { id: number; workspace_id: string; kind: string; action_id: number | null }) {
  const out: Record<string, unknown>[] = [];
  if (d.action_id && d.kind === "task") {
    const { data: a } = await db().from("actions").select("purpose, status").eq("id", d.action_id).eq("workspace_id", d.workspace_id).maybeSingle();
    if (a?.purpose === "approval" && a.status === "open") out.push({ type: "button", action_id: SLACK_BUTTONS.approve, text: { type: "plain_text", text: "Approve" }, style: "primary", value: String(d.id) });
  }
  if (OPT_OUT_KINDS.includes(d.kind)) out.push({ type: "button", action_id: SLACK_BUTTONS.stop, text: { type: "plain_text", text: "Stop these on Slack" }, value: String(d.id) });
  return out;
}

/** Sends one queued Slack Delivery. It is claimed first, so the immediate send and the retry job never both send it. */
export async function sendSlackDelivery(id: number): Promise<SendResult> {
  const { data: d } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, body, attempts, form_token_id")
    .eq("id", id).eq("connector", "slack").eq("mail_state", "queued").lt("attempts", MAX_ATTEMPTS).maybeSingle();
  if (!d) return "skipped";
  // What never goes out, whatever the limits: it is marked failed for good, if it is still queued.
  const never = async (why: string) => {
    await db().from("deliveries").update({ mail_state: "failed", last_error: why }).eq("id", id).eq("mail_state", "queued");
    return "failed" as const;
  };
  // A trial reaches only its Owner, whatever is set up (ADR 0010).
  const held = await trialHoldsBack(d.workspace_id, d.recipient_id);
  if (held) return keepInOutbox(id, held);
  if (d.workspace_id === DEMO_WORKSPACE_ID || !(await slackOn())) return never("Slack is not set up.");
  const bot = await slackBot(d.workspace_id);
  if (!bot) return never("Slack is not connected.");
  // Someone who stopped Prompts and reminders on Slack gets none, also ones queued before they stopped.
  if (OPT_OUT_KINDS.includes(d.kind)) {
    const { data: out } = await db().from("slack_opt_outs").select("person_id").eq("workspace_id", d.workspace_id).eq("person_id", d.recipient_id).maybeSingle();
    if (out) return never("They stopped reminders on Slack.");
  }
  let user: string | null;
  try {
    const match = await slackUserFor(bot, d.recipient_id);
    if ("why" in match) return never(match.why);
    user = match.userId;
  } catch (e) {
    return trouble(e, bot, id, Number(d.attempts), false);
  }
  // Claimed in the database within the limits, so neither parallel sends nor many Deliveries pass them.
  const trial = await claimTrialSend(id);
  if (trial === "wait") return "waiting";
  if (trial === "gone") return "skipped";
  const { data: claim, error } = await db().rpc("claim_slack_send", {
    p_id: id, p_team_id: bot.teamId, p_recipient: `${bot.teamId}:${user}`, p_per_workspace: SLACK_PER_WORKSPACE_PER_DAY,
    p_per_recipient: SLACK_PER_RECIPIENT_PER_HOUR, p_per_sender: SLACK_PER_SENDER_PER_DAY, p_per_team_minute: SLACK_PER_TEAM_PER_MINUTE, p_max_attempts: MAX_ATTEMPTS,
  });
  if (error) throw new Error("The Slack message could not be claimed for sending.");
  if (claim === "wait") return "waiting";
  if (claim !== "ok") return "skipped";
  let text = String(d.body);
  // A Prompt's personal form link goes only into the message, never into the body the Outbox shows its sender.
  if (text.includes(FORM_LINK)) {
    const { data: token } = d.form_token_id ? await db().from("tokens").select("code").eq("id", d.form_token_id).eq("workspace_id", d.workspace_id).maybeSingle() : { data: null };
    const site = String(process.env.ZIFFR_SITE_URL).replace(/\/+$/, "");
    text = text.split(FORM_LINK).join(token ? `${site}/submit/${token.code}` : `${site}/`);
  }
  const actions = await buttons(d);
  const blocks = [{ type: "section", text: { type: "mrkdwn", text: text.slice(0, 2900) } }, ...(actions.length ? [{ type: "actions", block_id: "ziffr", elements: actions }] : [])];
  try {
    const opened = await callSlack("conversations.open", { users: user }, bot.token);
    const channel = (opened.channel as { id?: unknown } | undefined)?.id;
    if (typeof channel !== "string" || !/^[A-Z0-9]{3,24}$/.test(channel)) throw new SlackError("no_channel");
    const posted = await callSlack("chat.postMessage", { channel, text: text.slice(0, 3000), blocks, unfurl_links: false, unfurl_media: false }, bot.token);
    const ts = typeof posted.ts === "string" && /^[0-9]{1,12}\.[0-9]{1,8}$/.test(posted.ts) ? posted.ts : null;
    if (!ts) throw new SlackError("no_ts");
    await db().from("deliveries").update({ mail_state: "sent", attempts: Number(d.attempts) + 1, sent_at: new Date().toISOString(), provider_id: ts, slack_channel: channel, slack_ts: ts, last_error: null }).eq("id", id);
    return "sent";
  } catch (e) {
    return trouble(e, bot, id, Number(d.attempts), true);
  }
}

/** A Slack call that did not work: a limit waits without using an attempt, a token that stopped working ends the
 * connection, anything else counts as a failed attempt. Only Slack's error code is kept. */
async function trouble(e: unknown, bot: SlackBot, id: number, attempts: number, claimed: boolean): Promise<SendResult> {
  const code = e instanceof SlackError ? e.code : "error";
  if (e instanceof SlackError && e.code === "ratelimited") {
    // Slack's wait, not ours: the send it refused does not count against Ziffr's limits either.
    if (claimed) await db().from("slack_sends").delete().eq("delivery_id", id);
    await db().from("deliveries").update({ mail_state: "queued", not_before: new Date(Date.now() + (e.retryAfter ?? 60) * 1000).toISOString(), last_error: "Slack asked to wait." }).eq("id", id);
    return "waiting";
  }
  if (TOKEN_GONE.includes(code)) {
    await slackConnectionEnded(bot.teamId);
    await db().from("deliveries").update({ mail_state: "failed", last_error: "Slack is not connected any more." }).eq("id", id);
    return "failed";
  }
  const next = attempts + 1;
  await db().from("deliveries").update({ mail_state: next >= MAX_ATTEMPTS ? "failed" : "queued", attempts: next, last_attempt_at: new Date().toISOString(), last_error: `Slack refused it (${code}).`.slice(0, 200) }).eq("id", id);
  return "failed";
}

/** Sends the Slack Deliveries that are due (as the email queue chooses them), at most `limit` per run. */
export async function sendWaitingSlack(limit = 50): Promise<{ sent: number; failed: number }> {
  const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
  await db().from("deliveries").update({ mail_state: "queued" }).eq("connector", "slack").eq("mail_state", "sending").lt("last_attempt_at", tenMinutesAgo);
  const { data: ids, error } = await db().rpc("due_deliveries_via", { p_connector: "slack", p_limit: limit, p_max_attempts: MAX_ATTEMPTS });
  if (error) throw new Error("The waiting Slack messages could not be read.");
  let sent = 0;
  let failed = 0;
  for (const r of (ids ?? []) as (number | { due_deliveries_via: number })[]) {
    const out = await sendSlackDelivery(typeof r === "number" ? r : r.due_deliveries_via);
    if (out === "sent") sent++;
    else if (out === "failed") failed++;
  }
  return { sent, failed };
}
