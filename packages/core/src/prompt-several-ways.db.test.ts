// A Prompt on several ways at once (#613; GLOSSARY: Prompt, Delivery, Delivery Preference), against the database and the
// fake Slack and Telegram APIs: one Prompt, one Delivery per way; the first accepted value closes it and the other
// messages are updated; a later answer follows the Metric's rule and is never dropped silently; a way that does not reach
// the person is left out; quiet hours hold each Delivery; a reminder goes by the first way only; a reply counts only from
// the person it went to, on the way it was offered on.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { deliverPrompt, waysFor } from "./deliveries";
import { connectorsView, submissionForm } from "./page-data";
import { setMyQuietHours } from "./quiet-hours";
import { setPreference } from "./questions";
import { routeReply, type ReplyChannel } from "./reply-routing";
import { sendWaitingSlack } from "./slack-send";
import { sendWaitingTelegram } from "./telegram-send";
import { finishSlackInstall, startSlackInstall } from "./slack-connection";
import { receiveSlackEvent } from "./slack-inbound";
import { receiveTelegramUpdate } from "./telegram-inbound";
import { setTelegramEnabled } from "./telegram-connection";
import { submitValue } from "./submissions";
import { tellIfAnswered } from "./prompt-ways";
import { PROMPT_ANSWERED } from "./internal/delivery-send";
import { fakeSlack } from "./test/fake-slack";
import { fakeTelegram } from "./test/fake-telegram";
import { opened, valuesOf, workspace } from "./test/db-fixtures";

let slack: Awaited<ReturnType<typeof fakeSlack>>;
let tg: Awaited<ReturnType<typeof fakeTelegram>>;
beforeAll(async () => { slack = await fakeSlack(); tg = await fakeTelegram(); });
afterAll(async () => { await slack.stop(); await tg.stop(); });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const mail = (who: string) => `${who}-${Math.random().toString(36).slice(2, 8)}@example.test`;
let next = Date.now() * 100 + 70;
const ALL = ["slack", "telegram", "mail", "web_form"] as const;

/** A workspace with Slack connected and Telegram on; Ann is reachable on Slack, Telegram and email, and asked on all three. */
async function setup(o: { telegram?: boolean; rule?: string; ways?: ("slack" | "telegram" | "email")[] } = {}) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner", { email: mail("sara") });
  slack.newTeam();
  const state = new URL(await startSlackInstall(w.actor(sara))).searchParams.get("state")!;
  expect(await finishSlackInstall(w.actor(sara), { code: "code-1234567890", state })).toBe("connected");
  await setTelegramEnabled(w.actor(sara), true);
  const address = mail("ann");
  const ann = await w.person("member", { email: address });
  const annSlack = slack.user(address);
  const chat = ++next;
  if (o.telegram !== false) await db().from("telegram_links").insert({ workspace_id: w.id, person_id: ann, telegram_user_id: chat, chat_id: chat });
  await setPreference(w.actor(ann, "member"), ann, "reminder", o.ways ?? ["slack", "telegram", "email"]);
  const m = await w.metric(sara, { name: "Coffee", sources: [...ALL], submission_rule: o.rule ?? "overwrite" });
  const code = await w.token(m.id, ann);
  return { w, sara, ann, annSlack, chat, m, code };
}
const deliveries = async (wsId: string, recipient: string) => await opened("deliveries", wsId, (await db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", recipient).eq("kind", "prompt").order("id")).data);
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- a Delivery as opened, whatever its columns
const by = (rows: { connector: unknown }[], c: string) => rows.find((d) => d.connector === c) as Row;
const promptOf = async (id: number) => (await db().from("prompts").select("*").eq("id", id).single()).data!;
/** A reply from `source` on one Delivery, as its Connector would hand it over once it proved who wrote. */
const reply = (d: Row, ann: string, source: "mail" | "slack" | "telegram", text: string) => {
  const said: string[] = [];
  const via: ReplyChannel = { source, sender: "x", provenPersonId: ann, answer: async (subject, body) => { said.push(`${subject}: ${body}`); } };
  return routeReply({ id: d.id, workspace_id: d.workspace_id, recipient_id: d.recipient_id, kind: d.kind, action_id: d.action_id, prompt_id: d.prompt_id }, text, via).then((outcome) => ({ outcome, said: said.join("\n") }));
};

describe("a Prompt goes by every way the person chose, at once", () => {
  it("makes one Prompt and one Delivery per way, in order, each sent where it can be", async () => {
    const { w, sara, ann, m } = await setup();
    const r = await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect(r).toMatchObject({ connector: "slack", chosen: true });
    const ds = await deliveries(w.id, ann);
    expect(ds.map((d) => d.connector)).toEqual(["slack", "telegram", "email"]);
    expect(new Set(ds.map((d) => d.prompt_id)).size).toBe(1);
    expect((await db().from("prompts").select("id").eq("metric_id", m.id)).data).toHaveLength(1);
    expect(ds.map((d) => d.answer_source)).toEqual(["slack", "telegram", "mail"]);
    expect(by(ds, "slack").mail_state).toBe("sent");
    expect(by(ds, "telegram").mail_state).toBe("sent");
    expect(slack.of("chat.postMessage").length).toBeGreaterThan(0);
    expect(tg.of("sendMessage").length).toBeGreaterThan(0);
  });

  it("offers a form link, and takes no reply, by an email when only the Web form is open besides chat", async () => {
    const { w, sara, ann, m } = await setup();
    await db().from("metrics").update({ sources: ["slack", "web_form"] }).eq("id", m.id);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    expect(ds.map((d) => d.connector)).toEqual(["slack", "email"]);
    expect(by(ds, "email").answer_source).toBe("web_form");
    expect((await reply(by(ds, "email"), ann, "mail", "4")).outcome).toBe("form_link");
    expect(await valuesOf(m.id)).toEqual([]);
  });

  it("leaves out a way that does not reach the person, and the rest still go", async () => {
    const { w, sara, ann, m } = await setup({ telegram: false });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect((await deliveries(w.id, ann)).map((d) => d.connector)).toEqual(["slack", "email"]);
  });

  it("falls back to the first way the Metric allows when none of the person's own reaches them", async () => {
    const { w, sara, ann, m } = await setup({ telegram: false, ways: ["telegram"] });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect((await deliveries(w.id, ann)).map((d) => d.connector)).toEqual(["slack"]);
  });

  it("goes by one way when asked by that way (ask me now), and a reminder goes by the first way only", async () => {
    const { w, sara, ann, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "telegram" });
    expect((await deliveries(w.id, ann)).map((d) => d.connector)).toEqual(["telegram"]);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, reminder: true, note: "Reminder, due soon." });
    expect((await deliveries(w.id, ann)).map((d) => d.connector)).toEqual(["telegram", "slack"]);
  });

  it("the Metric page and the Outbox read the group", async () => {
    const { w, sara, ann, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const view = await connectorsView(w.actor(ann, "member"));
    const rows = view.deliveries.filter((d) => d.kind === "prompt");
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((d) => d.prompt_id)).size).toBe(1);
    expect(rows.map((d) => d.answer_source).sort()).toEqual(["mail", "slack", "telegram"]);
  });
});

describe("the first answer wins", () => {
  it("closes the Prompt and updates the other messages: Slack and Telegram are edited, the email says so on its form", async () => {
    const { w, sara, ann, m, code } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    const r = await reply(by(ds, "telegram"), ann, "telegram", "3");
    expect(r.outcome).toBe("recorded");
    expect(await valuesOf(m.id)).toMatchObject([{ value: 3, source: "telegram", submitter_id: ann }]);
    const p = await promptOf(by(ds, "telegram").prompt_id);
    expect(p).toMatchObject({ answered_source: "telegram" });
    expect(p.answered_at).not.toBeNull();
    // Slack's message is edited, with no buttons and no attachment; Telegram's own is not (the reply says it).
    const edit = slack.of("chat.update").at(-1)!;
    expect(edit.params).toMatchObject({ channel: by(ds, "slack").slack_channel, ts: by(ds, "slack").slack_ts });
    expect(edit.params.text).toMatch(/^Answered on Telegram: 3 for Coffee/);
    expect(JSON.parse(edit.params.attachments)).toEqual([]);
    expect(tg.of("editMessageText").filter((c) => c.params.message_id === Number(by(ds, "telegram").telegram_message_id))).toEqual([]);
    expect((await deliveries(w.id, ann)).map((d) => d.status)).toEqual(["answered", "answered", "answered"]);
    // The email cannot be edited: its form link says it is answered.
    expect(slack.of("chat.update")).toHaveLength(1);
    expect((await submissionForm(code))!.answeredOn).toBe("telegram");
  });

  it("an answer on Slack edits the Telegram message", async () => {
    const { w, sara, ann, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    expect((await reply(by(ds, "slack"), ann, "slack", "7")).outcome).toBe("recorded");
    const edit = tg.of("editMessageText").at(-1)!;
    expect(edit.params).toMatchObject({ chat_id: Number(by(ds, "telegram").telegram_chat_id), message_id: Number(by(ds, "telegram").telegram_message_id) });
    expect(String(edit.params.text)).toMatch(/^Answered on Slack: 7 for Coffee/);
    expect(edit.params).not.toHaveProperty("reply_markup");
  });

  it("an answer on the form link, which belongs to no message, updates all the chats", async () => {
    const { w, sara, ann, m, code } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect(await submitValue({ source: "web_form", sender: code, text: "9" })).toMatchObject({ ok: true });
    expect(slack.of("chat.update").at(-1)!.params.text).toMatch(/^Answered on Web form: 9/);
    expect(String(tg.of("editMessageText").at(-1)!.params.text)).toMatch(/^Answered on Web form: 9/);
    expect((await deliveries(w.id, ann)).every((d) => d.status === "answered")).toBe(true);
  });

  it("a failed edit changes nothing about the answer", async () => {
    const { w, sara, ann, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    slack.fail("chat.update", { error: "message_not_found" });
    tg.fail("editMessageText", { code: 400 });
    const ds = await deliveries(w.id, ann);
    expect((await reply(by(ds, "email"), ann, "mail", "5")).outcome).toBe("recorded");
    expect(await valuesOf(m.id)).toMatchObject([{ value: 5, source: "mail" }]);
  });
});

describe("a later answer on another way", () => {
  it("follows the Metric's rule (overwrite) and says it came second", async () => {
    const { w, sara, ann, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    await reply(by(ds, "telegram"), ann, "telegram", "3");
    const edits = slack.of("chat.update").length;
    const late = await reply(by(ds, "slack"), ann, "slack", "5");
    expect(late.outcome).toBe("recorded");
    expect(late.said).toContain("Replaced 3 with 5");
    expect(late.said).toContain("already answered on Telegram");
    // Under "overwrite" the later value is the one the Metric holds.
    expect((await valuesOf(m.id)).map((v) => v.value)).toEqual([5]);
    // Nobody is edited a second time: the Prompt was closed once.
    expect(slack.of("chat.update")).toHaveLength(edits);
    expect((await promptOf(by(ds, "telegram").prompt_id)).answered_source).toBe("telegram");
  });

  it("a rule that rejects a second value says so, and the first stays", async () => {
    const { w, sara, ann, m } = await setup({ rule: "reject" });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    await reply(by(ds, "telegram"), ann, "telegram", "3");
    const late = await reply(by(ds, "slack"), ann, "slack", "5");
    expect(late.outcome).toBe("refused");
    expect(late.said).toMatch(/Not recorded: .*already has 3.*rejects a second value/);
    expect((await valuesOf(m.id)).map((v) => v.value)).toEqual([3]);
  });

  it("under the add rule both count, and the second is told so", async () => {
    const { w, sara, ann, m } = await setup({ rule: "add" });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    await reply(by(ds, "telegram"), ann, "telegram", "3");
    const late = await reply(by(ds, "slack"), ann, "slack", "5");
    expect(late.said).toContain("3 + 5 = 8");
    expect(late.said).toContain("already answered");
  });

  it("works end to end through Slack's and Telegram's own events", async () => {
    const { w, sara, ann, annSlack, chat, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    const tgd = by(ds, "telegram");
    expect(await receiveTelegramUpdate({ update_id: ++next, message: { message_id: ++next % 1_000_000, from: { id: chat, is_bot: false, first_name: "Ann" }, chat: { id: chat, type: "private" }, date: 0, text: "11", reply_to_message: { message_id: Number(tgd.telegram_message_id), chat: { id: chat, type: "private" }, date: 0 } } })).toBe("recorded");
    const sld = by(ds, "slack");
    const bot = (await db().from("slack_installations").select("team_id, app_id").eq("workspace_id", w.id).single()).data!;
    const ev = { type: "event_callback", team_id: bot.team_id, api_app_id: bot.app_id, event_id: `Ev${Math.random().toString(16).slice(2, 10).toUpperCase()}`, event_time: Math.floor(Date.now() / 1000), event: { type: "message", channel_type: "im", channel: sld.slack_channel, user: annSlack, text: "12", ts: `${Math.floor(Date.now() / 1000)}.000200`, thread_ts: sld.slack_ts } };
    expect(await receiveSlackEvent(ev)).toEqual({ outcome: "recorded" });
    expect((await valuesOf(m.id)).map((v) => v.value)).toEqual([12]);
    expect(String(slack.of("chat.postMessage").at(-1)!.params.text)).toContain("already answered on Telegram");
  });
});

describe("quiet hours hold each Delivery", () => {
  const aroundNow = () => { const h = new Date().getUTCHours(); return { fromHour: (h + 23) % 24, toHour: (h + 2) % 24, days: [], timeZone: null }; };

  it("holds every way, and what is answered meanwhile is never sent afterwards", async () => {
    const { w, sara, ann, m, code } = await setup();
    await setMyQuietHours(w.actor(ann, "member"), aroundNow());
    const posted = slack.of("chat.postMessage").length;
    const sentTg = tg.of("sendMessage").length;
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    expect(ds.map((d) => d.mail_state)).toEqual(["queued", "queued", "outbox"]);
    expect(ds.filter((d) => d.mail_state === "queued").every((d) => d.not_before)).toBe(true);
    expect(slack.of("chat.postMessage")).toHaveLength(posted);
    expect(tg.of("sendMessage")).toHaveLength(sentTg);
    // The person answers on the form while the chats wait, then quiet hours end.
    expect(await submitValue({ source: "web_form", sender: code, text: "4" })).toMatchObject({ ok: true });
    await db().from("deliveries").update({ not_before: new Date(Date.now() - 60_000).toISOString() }).eq("workspace_id", w.id).eq("mail_state", "queued");
    await sendWaitingSlack();
    await sendWaitingTelegram();
    expect(slack.of("chat.postMessage").slice(posted).map((c) => c.params.text)).toEqual([]);
    expect(tg.of("sendMessage")).toHaveLength(sentTg);
    const after = await deliveries(w.id, ann);
    expect(after.filter((d) => d.connector !== "email").map((d) => [d.mail_state, d.last_error])).toEqual([["failed", PROMPT_ANSWERED], ["failed", PROMPT_ANSWERED]]);
  });

  it("sends each held Delivery when quiet hours end and nothing was answered", async () => {
    const { w, sara, ann, m } = await setup();
    await setMyQuietHours(w.actor(ann, "member"), aroundNow());
    const posted = slack.of("chat.postMessage").length;
    const sentTg = tg.of("sendMessage").length;
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    await db().from("deliveries").update({ not_before: new Date(Date.now() - 60_000).toISOString() }).eq("workspace_id", w.id).eq("mail_state", "queued");
    await sendWaitingSlack();
    await sendWaitingTelegram();
    expect(slack.of("chat.postMessage")).toHaveLength(posted + 1);
    expect(tg.of("sendMessage")).toHaveLength(sentTg + 1);
  });
});

describe("a reply counts only from the person it went to, on the way it was offered", () => {
  it("another person's reply on Telegram or Slack to Ann's messages records nothing", async () => {
    const { w, sara, ann, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    const benMail = mail("ben");
    const ben = await w.person("member", { email: benMail });
    const benChat = ++next;
    await db().from("telegram_links").insert({ workspace_id: w.id, person_id: ben, telegram_user_id: benChat, chat_id: benChat });
    await w.token(m.id, ben);
    const tgd = by(ds, "telegram");
    await receiveTelegramUpdate({ update_id: ++next, message: { message_id: ++next % 1_000_000, from: { id: benChat, is_bot: false, first_name: "Ben" }, chat: { id: benChat, type: "private" }, date: 0, text: "99", reply_to_message: { message_id: Number(tgd.telegram_message_id), chat: { id: benChat, type: "private" }, date: 0 } } });
    const bot = (await db().from("slack_installations").select("team_id, app_id").eq("workspace_id", w.id).single()).data!;
    const sld = by(ds, "slack");
    const benSlack = slack.user(benMail);
    const out = await receiveSlackEvent({ type: "event_callback", team_id: bot.team_id, api_app_id: bot.app_id, event_id: `Ev${Math.random().toString(16).slice(2, 10).toUpperCase()}`, event_time: Math.floor(Date.now() / 1000), event: { type: "message", channel_type: "im", channel: sld.slack_channel, user: benSlack, text: "99", ts: `${Math.floor(Date.now() / 1000)}.000300`, thread_ts: sld.slack_ts } });
    expect(out.outcome).not.toBe("recorded");
    expect(await valuesOf(m.id)).toEqual([]);
    expect((await promptOf(tgd.prompt_id)).answered_at).toBeNull();
  });

  it("a reply to a Delivery whose Prompt belongs to someone else is not taken", async () => {
    const { w, sara, ann, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    const ben = await w.person("member");
    await w.token(m.id, ben);
    // A Delivery row that says it went to Ben, with Ann's Prompt: its recipient is not the Prompt's Submitter.
    const forged = { ...by(ds, "slack"), recipient_id: ben };
    expect((await reply(forged, ben, "slack", "99")).outcome).toBe("unknown_token");
    expect(await valuesOf(m.id)).toEqual([]);
  });

  it("an email Delivery that only offers the form takes no reply by mail, and a chat Delivery takes none by another Source", async () => {
    const { w, sara, ann, m } = await setup();
    await db().from("metrics").update({ sources: ["slack", "telegram", "web_form"] }).eq("id", m.id);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    expect((await reply(by(ds, "email"), ann, "mail", "4")).outcome).toBe("form_link");
    expect((await reply(by(ds, "slack"), ann, "telegram", "4")).outcome).toBe("form_link");
    expect(await valuesOf(m.id)).toEqual([]);
  });
});

describe("a message that went out after the answer", () => {
  it("is edited at once, as the others were; nothing for a way that is the answer's own", async () => {
    const { w, sara, ann, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    const edited = tg.of("editMessageText").length;
    await tellIfAnswered(w.id, by(ds, "slack").id);
    expect(slack.of("chat.update").filter((c) => c.params.ts === by(ds, "slack").slack_ts)).toEqual([]);
    await db().from("prompts").update({ answered_at: new Date().toISOString(), answered_source: "telegram" }).eq("id", by(ds, "slack").prompt_id);
    await tellIfAnswered(w.id, by(ds, "slack").id);
    expect(slack.of("chat.update").at(-1)!.params).toMatchObject({ ts: by(ds, "slack").slack_ts, text: "Answered on Telegram." });
    await tellIfAnswered(w.id, by(ds, "telegram").id);
    expect(tg.of("editMessageText")).toHaveLength(edited);
    await db().from("prompts").update({ answered_source: "slack" }).eq("id", by(ds, "slack").prompt_id);
    await tellIfAnswered(w.id, by(ds, "telegram").id);
    expect(String(tg.of("editMessageText").at(-1)!.params.text)).toBe("Answered on Slack.");
  });
});

describe("a Prompt's id is no key to another person's", () => {
  it("another submitter of the same Metric cannot answer, or close, Ann's Prompt by its id", async () => {
    const { w, sara, ann, m } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const ds = await deliveries(w.id, ann);
    const ben = await w.person("member", { email: mail("ben") });
    const benCode = await w.token(m.id, ben);
    const edits = slack.of("chat.update").length;
    expect(await submitValue({ source: "web_form", sender: benCode, text: "99", promptId: by(ds, "slack").prompt_id, workspaceId: w.id })).toMatchObject({ ok: false, outcome: "rejected_no_token" });
    expect(await valuesOf(m.id)).toEqual([]);
    expect((await promptOf(by(ds, "slack").prompt_id)).answered_at).toBeNull();
    expect(slack.of("chat.update")).toHaveLength(edits);
  });
});

describe("choosing several ways", () => {
  it("keeps the order, for a person and for the team, and the first is the one reminders use", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); const ann = await w.person("member");
    await setPreference(w.actor(ann, "member"), ann, "reminder", ["telegram", "email", "slack"]);
    expect(await waysFor(w.id, ann, "prompt")).toEqual(["telegram", "email", "slack"]);
    await setPreference(w.actor(sara), null, "reminder", ["slack", "email"]);
    // Ann's own list wins; someone without one gets the team's.
    expect(await waysFor(w.id, ann, "prompt")).toEqual(["telegram", "email", "slack"]);
    const ben = await w.person("member");
    expect(await waysFor(w.id, ben, "prompt")).toEqual(["slack", "email"]);
    await setPreference(w.actor(ann, "member"), ann, "reminder", ["email"]);
    expect(await waysFor(w.id, ann, "prompt")).toEqual(["email"]);
    await setPreference(w.actor(ann, "member"), ann, "reminder", null);
    expect(await waysFor(w.id, ann, "prompt")).toEqual(["slack", "email"]);
    await setPreference(w.actor(ann, "member"), ann, "reminder", []);
    expect(await waysFor(w.id, ben, "reminder")).toEqual(["slack", "email"]);
  });

  it("refuses repeats, more than three, a list for any other kind, an empty team default and someone else's", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); const ann = await w.person("member");
    const forbidden = expect.any(Forbidden);
    await expect(setPreference(w.actor(ann, "member"), ann, "reminder", ["slack", "slack"])).rejects.toEqual(forbidden);
    await expect(setPreference(w.actor(ann, "member"), ann, "reminder", ["slack", "telegram", "email", "whatsapp"])).rejects.toEqual(forbidden);
    await expect(setPreference(w.actor(ann, "member"), ann, "question", ["slack", "email"])).rejects.toEqual(forbidden);
    await expect(setPreference(w.actor(ann, "member"), ann, "reminder", ["nonsense" as never])).rejects.toEqual(forbidden);
    await expect(setPreference(w.actor(sara), null, "reminder", [])).rejects.toEqual(forbidden);
    // A way for a person who is no member here cannot be stored (the database refuses it): said, not silently dropped.
    await expect(setPreference(w.actor("nobody-here", "member"), "nobody-here", "reminder", ["slack"])).rejects.toThrow("could not be saved");
    await expect(setPreference(w.actor(ann, "member"), null, "reminder", ["slack"])).rejects.toEqual(forbidden);
    await expect(setPreference(w.actor(ann, "member"), sara, "reminder", ["slack"])).rejects.toEqual(forbidden);
    expect((await db().from("delivery_preferences").select("id").eq("workspace_id", w.id)).data).toEqual([]);
  });

  it("with no choice and no team default, a Prompt goes by every way that reaches the person, and connecting one adds it", async () => {
    const { w, sara, ann, m } = await setup({ telegram: false });
    await db().from("delivery_preferences").delete().eq("workspace_id", w.id);
    expect(await waysFor(w.id, ann, "prompt")).toEqual(["slack", "telegram", "email"]);
    expect(await waysFor(w.id, ann, "reminder")).toEqual(["email"]);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect((await deliveries(w.id, ann)).map((d) => d.connector)).toEqual(["slack", "email"]);
    const chat = ++next;
    await db().from("telegram_links").insert({ workspace_id: w.id, person_id: ann, telegram_user_id: chat, chat_id: chat });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect((await deliveries(w.id, ann)).slice(2).map((d) => d.connector)).toEqual(["slack", "telegram", "email"]);
    // A team default, or the person's own list, is a choice and is kept.
    await setPreference(w.actor(sara), null, "reminder", ["email"]);
    expect(await waysFor(w.id, ann, "prompt")).toEqual(["email"]);
  });

  it("an existing single choice is a list of one", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const ann = await w.person("member");
    await db().from("delivery_preferences").insert({ workspace_id: w.id, user_id: ann, kind: "reminder", connector: "telegram" });
    expect(await waysFor(w.id, ann, "prompt")).toEqual(["telegram"]);
  });
});
