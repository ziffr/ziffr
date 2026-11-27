// Sending by Slack (spec 0007, ticket #103; GLOSSARY: Delivery, Connector, Prompt). The Slack Connector has always
// worded each Delivery; this sends it as a direct message from the workspace's bot, through the queue email uses:
// queued, claimed in the database within limits, retried by the job. Only to the Slack user a member or Contact of
// the Delivery's workspace was found as (slack-people.ts), never in the demo, and nothing without a connection.
import { db } from "./db";
import { archivedMetricHolds, failForGood, withFormLink } from "./internal/delivery-send";
import { openRows } from "./sealed-columns";
import { heldBack, mayQueue, PRACTICE_HELD } from "./practice";
import { giveUpAfter, OPT_OUT_KINDS, type SendResult } from "./mail";
import { sendingLimit } from "./sending-limit";
import { sendingLimitDefault } from "./sending-limits";
import { callSlack, slackOn, SlackError, TOKEN_GONE } from "./slack-api";
import { slackBot, slackConnectionEnded, type SlackBot } from "./slack-connection";
import { slackIdentity } from "./slack-identity";
import { slackUserFor } from "./slack-people";
import { tellIfAnswered } from "./prompt-ways";
import { workspaceLook } from "./workspace-look";
import { DEMO_WORKSPACE_ID } from "./team";
import { claimTrialSend, keepInOutbox } from "./trials";
import { sendingHeldBack } from "./user-block";

/** Slack messages one workspace may send in 24 hours, unless ZIFFR_LIMIT_CHAT_MESSAGES_PER_WORKSPACE_PER_DAY says otherwise (the default); the rest wait in the queue. */
export const SLACK_PER_WORKSPACE_PER_DAY = sendingLimitDefault("chatPerWorkspace");
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
  const maxAttempts = await sendingLimit("sendAttempts");
  const { data: found } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, body, attempts, form_token_id, prompt_id, alert_metric_id, heads_up_metric_a, heads_up_metric_b, heads_up_key, heads_up_told_id, tell_workflow_id, snapshot_dashboard_id, sender_id, filled_in_observation_id, total_rests, combined")
    .eq("id", id).eq("connector", "slack").eq("mail_state", "queued").lt("attempts", maxAttempts).maybeSingle();
  if (!found) return "skipped";
  const [d] = await openRows("deliveries", found.workspace_id, [found]);
  // What never goes out, whatever the limits: it is marked failed for good, if it is still queued.
  const never = (why: string) => failForGood(id, why);
  // Words that do not open (changed in the database, or under a destroyed key) never go out, not even as "null".
  if (d.body === null) return never("Its text cannot be read any more.");
  // Nothing goes out for an Archived Metric, also when it was archived after this was queued.
  const archived = await archivedMetricHolds(d);
  if (archived) return never(archived);
  // From a Practice Workspace (spec 0063) only to its own person; which account it goes to is compared below.
  if (!(await mayQueue(d.workspace_id, "slack", d.recipient_id))) return keepInOutbox(id, PRACTICE_HELD);
  // A trial reaches only people who accepted, never a Contact, whatever is set up (ADR 0015); nothing reaches a Blocked User.
  const held = await sendingHeldBack(d.workspace_id, d.recipient_id);
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
  if (await heldBack(d.workspace_id, "slack", { recipientId: d.recipient_id, destination: `${bot.teamId}:${user}` })) return keepInOutbox(id, PRACTICE_HELD);
  // Claimed in the database within the limits, so neither parallel sends nor many Deliveries pass them.
  const trial = await claimTrialSend(id);
  if (trial === "wait") return "waiting";
  if (trial === "gone") return "skipped";
  const { data: claim, error } = await db().rpc("claim_slack_send", {
    p_id: id, p_team_id: bot.teamId, p_recipient: `${bot.teamId}:${user}`, p_per_workspace: await sendingLimit("chatPerWorkspace"),
    p_per_recipient: SLACK_PER_RECIPIENT_PER_HOUR, p_per_sender: SLACK_PER_SENDER_PER_DAY, p_per_team_minute: SLACK_PER_TEAM_PER_MINUTE, p_max_attempts: maxAttempts,
  });
  if (error) throw new Error("The Slack message could not be claimed for sending.");
  if (claim === "wait") return "waiting";
  if (claim !== "ok") return "skipped";
  const text = await withFormLink(String(d.body), d, String(process.env.ZIFFR_SITE_URL));
  const actions = await buttons(d);
  const blocks = [{ type: "section", text: { type: "mrkdwn", text: text.slice(0, 2900) } }, ...(actions.length ? [{ type: "actions", block_id: "ziffr", elements: actions }] : [])];
  try {
    const opened = await callSlack("conversations.open", { users: user }, bot.token);
    const channel = (opened.channel as { id?: unknown } | undefined)?.id;
    if (typeof channel !== "string" || !/^[A-Z0-9]{3,24}$/.test(channel)) throw new SlackError("no_channel");
    // The one thing of the Theme Slack can show: a side bar in the accent (Block Kit has no colours of its own), which
    // only an attachment carries. A Theme that cannot be read leaves the message as it was, with no bar.
    const look = await workspaceLook(d.workspace_id).catch(() => null);
    const color = look?.accent ?? null;
    const message = color ? { attachments: [{ color, blocks }] } : { blocks };
    // The Workspace's name and logo, where Slack granted chat:write.customize; otherwise the app's own, as before.
    const who = look ? slackIdentity(bot.scopes, d.workspace_id, look, process.env.ZIFFR_SITE_URL) : {};
    const posted = await callSlack("chat.postMessage", { channel, text: text.slice(0, 3000), ...message, ...who, unfurl_links: false, unfurl_media: false }, bot.token);
    const ts = typeof posted.ts === "string" && /^[0-9]{1,12}\.[0-9]{1,8}$/.test(posted.ts) ? posted.ts : null;
    if (!ts) throw new SlackError("no_ts");
    await db().from("deliveries").update({ mail_state: "sent", attempts: Number(d.attempts) + 1, sent_at: new Date().toISOString(), provider_id: ts, slack_channel: channel, slack_ts: ts, last_error: null }).eq("id", id);
    await tellIfAnswered(d.workspace_id, id);
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
  await db().from("deliveries").update({ mail_state: next >= (await sendingLimit("sendAttempts")) ? "failed" : "queued", attempts: next, last_attempt_at: new Date().toISOString(), last_error: `Slack refused it (${code}).`.slice(0, 200) }).eq("id", id);
  return "failed";
}

/** Sends the Slack Deliveries that are due (as the email queue chooses them), at most `limit` per run. */
export async function sendWaitingSlack(limit = 50): Promise<{ sent: number; failed: number }> {
  const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
  await db().from("deliveries").update({ mail_state: "queued" }).eq("connector", "slack").eq("mail_state", "sending").lt("last_attempt_at", tenMinutesAgo);
  const maxAttempts = await sendingLimit("sendAttempts");
  await giveUpAfter(maxAttempts, "slack");
  const { data: ids, error } = await db().rpc("due_deliveries_via", { p_connector: "slack", p_limit: limit, p_max_attempts: maxAttempts });
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
