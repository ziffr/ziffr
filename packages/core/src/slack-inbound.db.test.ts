// Answers by Slack (spec 0007, ticket #104), against the database and a fake Slack Web API on this machine. A reply
// in the thread of a sent Delivery records a value, answers in the Thread, proposes a Correction; buttons approve and
// stop; a link code links. Another Slack user, another Slack workspace or app, an unknown thread, an old Delivery and
// a repeated event change nothing.
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { openRows } from "./sealed-columns";
import { deliverPrompt } from "./deliveries";
import { ask } from "./questions";
import { finishSlackInstall, slackBot, startSlackInstall, type SlackBot } from "./slack-connection";
import { receiveSlackEvent, receiveSlackInteraction, slackSigned, slackText } from "./slack-inbound";
import { startSlackLink, slackUserFor } from "./slack-people";
import { submitValue } from "./submissions";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import type { Actor } from "./actor";
import { fakeSlack } from "./test/fake-slack";
import { valuesOf, workspace, opened } from "./test/db-fixtures";

let slack: Awaited<ReturnType<typeof fakeSlack>>;
beforeAll(async () => { slack = await fakeSlack(); });
afterAll(async () => { await slack.stop(); });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const mail = (who: string) => `${who}-${Math.random().toString(36).slice(2, 8)}@example.test`;
const eventId = () => `Ev${randomBytes(6).toString("hex").toUpperCase()}`;

async function connect(actor: Actor) {
  slack.newTeam();
  const state = new URL(await startSlackInstall(actor)).searchParams.get("state")!;
  expect(await finishSlackInstall(actor, { code: "code-1234567890", state })).toBe("connected");
  return (await slackBot(actor.workspaceId))!;
}
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner", { email: mail("sara") });
  const bot = await connect(w.actor(sara));
  const annMail = mail("ann");
  const ann = await w.person("member", { email: annMail });
  const annSlack = slack.user(annMail);
  const m = await w.metric(sara, { name: "Field visits", sources: ["web_form", "slack"] });
  await w.token(m.id, ann);
  return { w, sara, bot, ann, annSlack, m };
}
const sent = async (wsId: string, recipient: string) => (await db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", recipient).eq("connector", "slack").order("id", { ascending: false }).limit(1).single()).data!;
/** A message event as Slack sends it, in the thread of `threadTs` unless null. */
const message = (bot: SlackBot, user: string, channel: string, threadTs: string | null, text: string, over: Record<string, unknown> = {}) => ({
  type: "event_callback", team_id: bot.teamId, api_app_id: bot.appId, event_id: eventId(), event_time: Math.floor(Date.now() / 1000),
  event: { type: "message", channel_type: "im", channel, user, text, ts: `${Math.floor(Date.now() / 1000)}.000200`, ...(threadTs ? { thread_ts: threadTs } : {}), ...over },
});
const press = (bot: SlackBot, user: string, d: { id: number; slack_channel: string; slack_ts: string }, actionId: string) => ({
  type: "block_actions", team: { id: bot.teamId }, api_app_id: bot.appId, user: { id: user }, trigger_id: `${Date.now()}.${randomBytes(6).toString("hex")}`,
  container: { type: "message", channel_id: d.slack_channel, message_ts: d.slack_ts }, actions: [{ action_id: actionId, value: String(d.id) }],
});

describe("Slack's signature", () => {
  it("holds only for the body Slack signed with the secret, a moment ago", async () => {
    const { createHmac } = await import("node:crypto");
    const secret = "s".repeat(32);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = `v0=${createHmac("sha256", secret).update(`v0:${ts}:{"a":1}`).digest("hex")}`;
    expect(slackSigned(ts, sig, '{"a":1}', secret)).toBe(true);
    expect(slackSigned(ts, sig, '{"a":2}', secret)).toBe(false);
    expect(slackSigned(ts, sig, '{"a":1}', "t".repeat(32))).toBe(false);
    expect(slackSigned(String(Number(ts) - 301), sig, '{"a":1}', secret)).toBe(false);
    expect(slackSigned(ts, sig.toUpperCase(), '{"a":1}', secret)).toBe(false);
    expect(slackSigned(ts, null, '{"a":1}', secret)).toBe(false);
    expect(slackText("&lt;b&gt; <@U123> <https://x.test|link> 5 &amp; 6")).toBe("<b>  link 5 & 6");
  });
});

describe("answers by Slack", () => {
  it("records the value from a reply in a Prompt's thread, once per event, and says so in the thread", async () => {
    const { w, sara, bot, ann, annSlack, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    const d = await sent(w.id, ann);
    expect(d.mail_state).toBe("sent");
    const e = message(bot, annSlack, d.slack_channel, d.slack_ts, "17");
    expect(await receiveSlackEvent(e)).toEqual({ outcome: "recorded" });
    expect(await receiveSlackEvent(e)).toEqual({ outcome: "duplicate" });
    expect(await valuesOf(m.id)).toMatchObject([{ value: 17, submitter_id: ann, source: "slack" }]);
    const confirm = slack.of("chat.postMessage").at(-1)!;
    expect(confirm.params).toMatchObject({ channel: d.slack_channel, thread_ts: d.slack_ts });
    // The reply comes in the Workspace's name too (the fake grants chat:write.customize).
    expect(confirm.params.username).toBeTruthy();
    expect(confirm.params.text).toMatch(/^Recorded/);
    expect((await sent(w.id, ann)).status).toBe("answered");
  });

  it("saves later words as the note, offers the other number in the thread and records it on yes (spec 0064)", async () => {
    const { w, sara, bot, ann, annSlack, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    const d = await sent(w.id, ann);
    const say = (text: string) => receiveSlackEvent(message(bot, annSlack, d.slack_channel, d.slack_ts, text));
    const said = () => String(slack.of("chat.postMessage").at(-1)!.params.text);
    expect(await say("17")).toEqual({ outcome: "recorded" });
    expect(await say("actually 18, one came late")).toEqual({ outcome: "noted" });
    expect(said()).toBe("Saved as your note. Your value is still 17. To change it to 18, reply yes.");
    expect(await valuesOf(m.id)).toMatchObject([{ value: 17 }]);
    expect(await say("yes")).toEqual({ outcome: "recorded" });
    expect(await valuesOf(m.id)).toMatchObject([{ value: 18 }]);
    const before = slack.of("chat.postMessage").length;
    expect(await say("thanks")).toEqual({ outcome: "closed" });
    expect(slack.of("chat.postMessage")).toHaveLength(before);
  });

  it("reads a sentence as the answer, and asks back for several numbers or another period (spec 0022)", async () => {
    const { w, sara, bot, ann, annSlack, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    const d = await sent(w.id, ann);
    const said = () => String(slack.of("chat.postMessage").at(-1)!.params.text);
    expect(await receiveSlackEvent(message(bot, annSlack, d.slack_channel, d.slack_ts, "2 visits, 1 no-show"))).toEqual({ outcome: "refused" });
    expect(said()).toContain("Found several numbers: “2” and “1”");
    expect(await receiveSlackEvent(message(bot, annSlack, d.slack_channel, d.slack_ts, "last month: 4"))).toEqual({ outcome: "refused" });
    expect(said()).toMatch(/This Prompt asks for/);
    expect(await receiveSlackEvent(message(bot, annSlack, d.slack_channel, d.slack_ts, "we had 6 visits this month"))).toEqual({ outcome: "recorded" });
    expect(said()).toMatch(/^Recorded: 6 recorded for Field visits, \w+ \d{4}/);
    expect(await valuesOf(m.id)).toMatchObject([{ value: 6, source: "slack" }]);
  });

  it("takes nothing from another Slack user, Slack workspace or app, an unknown thread or an old Delivery", async () => {
    const { w, sara, bot, ann, annSlack, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    const d = await sent(w.id, ann);
    // Someone else of the same Slack workspace, even a member of the same Ziffr workspace.
    const benMail = mail("ben");
    const ben = await w.person("member", { email: benMail });
    const benSlack = slack.user(benMail);
    await slackUserFor(bot, ben);
    expect(await receiveSlackEvent(message(bot, benSlack, d.slack_channel, d.slack_ts, "99"))).toEqual({ outcome: "wrong_user" });
    expect(await receiveSlackEvent({ ...message(bot, annSlack, d.slack_channel, d.slack_ts, "99"), team_id: "TELSEWHERE" })).toEqual({ outcome: "unknown_team" });
    expect(await receiveSlackEvent({ ...message(bot, annSlack, d.slack_channel, d.slack_ts, "99"), api_app_id: "AOTHERAPP" })).toEqual({ outcome: "unknown_team" });
    expect(await receiveSlackEvent(message(bot, annSlack, d.slack_channel, "1600000000.000100", "99"))).toEqual({ outcome: "unknown_thread" });
    // Another Ziffr workspace's bot cannot reach this one's thread.
    const other = await setup();
    expect(await receiveSlackEvent(message(other.bot, annSlack, d.slack_channel, d.slack_ts, "99"))).toEqual({ outcome: "unknown_thread" });
    // Edits, other bots and the bot itself are not replies.
    expect(await receiveSlackEvent(message(bot, annSlack, d.slack_channel, d.slack_ts, "99", { subtype: "message_changed" }))).toEqual({ outcome: "ignored" });
    expect(await receiveSlackEvent(message(bot, annSlack, d.slack_channel, d.slack_ts, "99", { bot_id: "B1" }))).toEqual({ outcome: "ignored" });
    expect(await receiveSlackEvent(message(bot, bot.botUserId, d.slack_channel, d.slack_ts, "99"))).toEqual({ outcome: "ignored" });
    await db().from("deliveries").update({ created_at: new Date(Date.now() - 31 * 86_400_000).toISOString() }).eq("id", d.id);
    expect(await receiveSlackEvent(message(bot, annSlack, d.slack_channel, d.slack_ts, "99"))).toEqual({ outcome: "expired" });
    expect(await valuesOf(m.id)).toEqual([]);
    // Outside a thread: a hint, never a guess.
    expect(await receiveSlackEvent(message(bot, annSlack, d.slack_channel, null, "99"))).toEqual({ outcome: "hint" });
    // The bot answers such messages at most ten times a minute in a workspace.
    for (let i = 0; i < 9; i++) await receiveSlackEvent(message(bot, annSlack, d.slack_channel, null, "hello"));
    expect(await receiveSlackEvent(message(bot, annSlack, d.slack_channel, null, "hello"))).toEqual({ outcome: "too_many" });
  });

  it("puts a reply about a question into its Thread, and a Correction line as a proposed Correction", async () => {
    const { w, sara, bot, ann, annSlack, m } = await setup();
    const actionId = await ask(w.actor(sara), { metricId: m.id, period: "2026-10-01", assigneeId: ann, text: "Why so low?", via: "slack" });
    const d = await sent(w.id, ann);
    expect(await receiveSlackEvent(message(bot, annSlack, d.slack_channel, d.slack_ts, "Two visits were cancelled."))).toEqual({ outcome: "replied" });
    expect(await receiveSlackEvent(message(bot, annSlack, d.slack_channel, d.slack_ts, "Sorry, wrong.\nCorrection: 1,234"))).toEqual({ outcome: "corrected" });
    const thread = await openRows("thread_messages", w.id, (await db().from("thread_messages").select("id, author_id, body, correction_value, correction_value_sealed").eq("action_id", actionId).order("id")).data);
    expect(thread).toMatchObject([{ author_id: ann, body: "Two visits were cancelled." }, { author_id: ann, correction_value: 1234 }]);
  });

  it("approves with the button, only for the approver, and stops Prompts on Slack with the other", async () => {
    const { w, sara, bot, ann, annSlack, m } = await setup();
    await db().from("metrics").update({ target_max: 10 }).eq("id", m.id);
    const benMail = mail("ben");
    const ben = await w.person("member", { email: benMail });
    const benSlack = slack.user(benMail);
    await db().from("delivery_preferences").insert({ workspace_id: w.id, user_id: ben, kind: "task", connector: "slack" });
    const wf = await saveWorkflow(w.actor(sara), null, "Check", { dueWorkingDays: 2, steps: [{ type: "check", changePct: 50, outsideTarget: true }, { type: "approve", approvers: [ben] }, { type: "publish", lock: true }] });
    await setMetricWorkflow(w.actor(sara), m.id, wf);
    const { data: tok } = await db().from("tokens").select("code").eq("metric_id", m.id).eq("submitter_id", ann).single();
    expect((await submitValue({ source: "web_form", sender: tok!.code, text: "500" })).detail).toMatch(/approval asked/);
    const task = await sent(w.id, ben);
    expect(JSON.parse(slack.of("chat.postMessage").at(-1)!.params.attachments)[0].blocks[1].elements[0].action_id).toBe("ziffr_approve");
    await slackUserFor(bot, ann);
    expect(await receiveSlackInteraction(press(bot, annSlack, task, "ziffr_approve"))).toBe("wrong_user");
    expect(await receiveSlackInteraction({ ...press(bot, benSlack, task, "ziffr_approve"), container: { channel_id: task.slack_channel, message_ts: "1600000000.000100" } })).toBe("unknown_thread");
    const approve = press(bot, benSlack, task, "ziffr_approve");
    expect(await receiveSlackInteraction(approve)).toBe("approved");
    // The same signed press again (a replay) is taken once.
    expect(await receiveSlackInteraction(approve)).toBe("duplicate");
    const { data: action } = await db().from("actions").select("period_start").eq("id", task.action_id).single();
    const { data: state } = await db().from("period_states").select("state").eq("metric_id", m.id).eq("period_start", action!.period_start).single();
    expect(state!.state).toBe("locked");
    expect(await receiveSlackInteraction(press(bot, benSlack, task, "ziffr_approve"))).toBe("refused");
    // Stop: Ann's Prompts on Slack end, and the Metric's owner is told.
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    const prompt = await sent(w.id, ann);
    expect(await receiveSlackInteraction(press(bot, annSlack, prompt, "ziffr_stop"))).toBe("stopped");
    expect((await db().from("slack_opt_outs").select("person_id").eq("workspace_id", w.id)).data).toEqual([{ person_id: ann }]);
    const notice = await opened("deliveries", w.id, (await db().from("deliveries").select("id, subject").eq("workspace_id", w.id).eq("recipient_id", sara).eq("kind", "notice")).data, { dropId: true });
    expect(notice?.[0]?.subject).toMatch(/is no longer asked for numbers on Slack$/);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    expect((await sent(w.id, ann)).mail_state).toBe("failed");
  });

  it("links an account by a code sent to the bot, and ends the connection when the app is removed", async () => {
    const { w, bot } = await setup();
    const kai = await w.person("member", { email: mail("kai") });
    const { code } = await startSlackLink(w.actor(kai, "member"));
    expect(await receiveSlackEvent(message(bot, "UKAI1", "DKAI1", null, `link ${code}`))).toEqual({ outcome: "linked" });
    expect(await slackUserFor(bot, kai)).toEqual({ userId: "UKAI1", by: "code" });
    expect(await receiveSlackEvent({ type: "url_verification", challenge: "abc123" })).toEqual({ challenge: "abc123", outcome: "ignored" });
    expect(await receiveSlackEvent({ type: "event_callback", team_id: bot.teamId, api_app_id: bot.appId, event_id: eventId(), event: { type: "tokens_revoked", tokens: { oauth: ["UKAI1"], bot: [] } } })).toEqual({ outcome: "ignored" });
    expect(await slackBot(w.id)).not.toBeNull();
    expect(await receiveSlackEvent({ type: "event_callback", team_id: bot.teamId, api_app_id: bot.appId, event_id: eventId(), event: { type: "app_uninstalled" } })).toEqual({ outcome: "disconnected" });
    expect(await slackBot(w.id)).toBeNull();
  });
});
