// Test Messages against the database and the fakes (spec 0052, ticket 7; GLOSSARY: Test Message): one message to the person
// themself by email (the local Mailpit), Slack (the fake Web API) or Telegram (the fake Bot API); kept in the Outbox with
// what is missing when a way is not set up; limits that hold under parallel presses; and no way to reach anyone else.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "./actor";
import { Forbidden } from "./actor";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { setMyQuietHours } from "./quiet-hours";
import { finishSlackInstall, startSlackInstall } from "./slack-connection";
import { setTelegramEnabled } from "./telegram-connection";
import { sendTestMessage } from "./test-message";
import { NO_WAY_HERE, TEST_PER_DAY, TEST_PER_DAY_IN_TRIAL, TEST_PER_WAY_PER_WINDOW, TEST_SUBJECT } from "./test-message-words";
import { DEMO_WORKSPACE_ID } from "./team";
import { fakeSlack } from "./test/fake-slack";
import { fakeTelegram } from "./test/fake-telegram";
import { auditRowsOf, workspace } from "./test/db-fixtures";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
let slack: Awaited<ReturnType<typeof fakeSlack>>;
let tg: Awaited<ReturnType<typeof fakeTelegram>>;
beforeAll(async () => {
  for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; }
  delete process.env.ZIFFR_INBOUND_DOMAIN;
  slack = await fakeSlack(); tg = await fakeTelegram();
});
afterAll(async () => {
  await slack.stop(); await tg.stop();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;
let next = Date.now() * 100 + 90;

/** The messages Mailpit holds for an address. */
async function inbox(to: string) {
  const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json() as { messages: { ID: string }[] };
  return Promise.all(messages.map(async (m) => {
    const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json() as { Subject: string; Text: string; To: { Address: string }[]; Cc: unknown[]; Bcc: unknown[] };
    const headers = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}/headers`)).json() as Record<string, string[]>;
    return { ...full, headers };
  }));
}
const deliveriesOf = async (wsId: string) => (await db().from("deliveries").select("*").eq("workspace_id", wsId).order("id")).data ?? [];

/** A Workspace with Slack connected and Telegram on; Sara owns it, Ann and Bo are members with everything linked, Cy is a member with nothing linked. */
async function setup() {
  const w = await workspace("Acme Trading"); cleanups.push(w.cleanup);
  const sara = await w.person("owner", { email: address("sara") });
  slack.newTeam();
  const state = new URL(await startSlackInstall(w.actor(sara))).searchParams.get("state")!;
  expect(await finishSlackInstall(w.actor(sara), { code: "code-1234567890", state })).toBe("connected");
  await setTelegramEnabled(w.actor(sara), true);
  const linked = async (name: string) => {
    const mail = address(name);
    const id = await w.person("member", { email: mail });
    const slackUser = slack.user(mail);
    const chat = ++next;
    await db().from("telegram_links").insert({ workspace_id: w.id, person_id: id, telegram_user_id: chat, chat_id: chat });
    return { id, mail, slackUser, chat };
  };
  const ann = await linked("ann"); const bo = await linked("bo");
  const cyMail = address("cy"); const cy = await w.person("member", { email: cyMail });
  return { w, sara, ann, bo, cy, cyMail };
}

describe("a Test Message reaches the person who asked, by each way", () => {
  it("emails the sign-in address with the fixed words, no reply address and no buttons", async () => {
    const { w, ann } = await setup();
    const r = await sendTestMessage(w.actor(ann.id), "email");
    expect(r).toMatchObject({ way: "email", state: "sent", note: null, resetsAt: null });
    const [m, ...rest] = await inbox(ann.mail);
    expect(rest).toHaveLength(0);
    expect(m.Subject).toBe(TEST_SUBJECT);
    expect(m.Text).toContain("This is a test from Ziffr for Acme Trading. If you can read it here, Ziffr reaches you on email.");
    expect(m.To.map((t) => t.Address)).toEqual([ann.mail]);
    expect(m.Cc).toHaveLength(0); expect(m.Bcc).toHaveLength(0);
    expect(m.headers["Reply-To"]).toBeUndefined();
    expect(m.headers["List-Unsubscribe"]).toBeUndefined();
    expect(await deliveriesOf(w.id)).toMatchObject([{ kind: "test", connector: "email", recipient_id: ann.id, sender_id: null, mail_state: "sent", reply_token: null }]);
  });

  it("messages the Slack account the person is, from the app, with no buttons", async () => {
    const { w, ann } = await setup();
    const before = slack.of("chat.postMessage").length;
    expect(await sendTestMessage(w.actor(ann.id), "slack")).toMatchObject({ way: "slack", state: "sent", note: null });
    expect(slack.of("chat.postMessage")).toHaveLength(before + 1);
    expect(slack.of("conversations.open").at(-1)?.params.users).toBe(ann.slackUser);
    const post = slack.of("chat.postMessage").at(-1)!;
    expect(post.params.text).toContain("reaches you on Slack");
    expect(post.params.attachments ?? post.params.blocks).not.toContain("ziffr_stop");
    expect(post.params.attachments ?? post.params.blocks).not.toContain("ziffr_approve");
  });

  it("messages the Telegram chat the person linked, in plain text with no buttons", async () => {
    const { w, ann } = await setup();
    const before = tg.of("sendMessage").length;
    expect(await sendTestMessage(w.actor(ann.id), "telegram")).toMatchObject({ way: "telegram", state: "sent", note: null });
    const calls = tg.of("sendMessage");
    expect(calls).toHaveLength(before + 1);
    expect(calls.at(-1)!.params.chat_id).toBe(ann.chat);
    expect(String(calls.at(-1)!.params.text)).toContain("reaches you on Telegram");
    expect(calls.at(-1)!.params.reply_markup).toBeUndefined();
  });

  it("is sent even in the person's Quiet Hours, and is recorded in the Audit Log with the way and outcome only", async () => {
    const { w, ann } = await setup();
    await setMyQuietHours(w.actor(ann.id), { fromHour: 0, toHour: 23, days: [0, 1, 2, 3, 4, 5], timeZone: "UTC" });
    expect(await sendTestMessage(w.actor(ann.id), "email")).toMatchObject({ state: "sent" });
    expect(await deliveriesOf(w.id)).toMatchObject([{ kind: "test", mail_state: "sent", not_before: null }]);
    const rows = await auditRowsOf(w.id, "connector.test_sent");
    expect(rows).toMatchObject([{ kind: "connector.test_sent", details: { way: "email", outcome: "sent" } }]);
    expect(JSON.stringify(rows)).not.toContain(ann.mail);
  });
});

describe("a way that is not set up keeps the Test Message in the Outbox and says what is missing", () => {
  it("says so for a person Slack does not know, and for one who did not connect Telegram, without sending", async () => {
    const { w, cy } = await setup();
    const posts = slack.of("chat.postMessage").length; const sends = tg.of("sendMessage").length;
    expect(await sendTestMessage(w.actor(cy), "slack")).toMatchObject({ state: "kept", note: NO_WAY_HERE.slackPerson });
    expect(await sendTestMessage(w.actor(cy), "telegram")).toMatchObject({ state: "kept", note: NO_WAY_HERE.telegramPerson });
    expect(slack.of("chat.postMessage")).toHaveLength(posts);
    expect(tg.of("sendMessage")).toHaveLength(sends);
    expect((await deliveriesOf(w.id)).map((d) => [d.kind, d.mail_state, d.last_error])).toEqual([["test", "outbox", NO_WAY_HERE.slackPerson], ["test", "outbox", NO_WAY_HERE.telegramPerson]]);
    expect((await auditRowsOf(w.id, "connector.test_sent")).map((r) => r.details)).toEqual([{ way: "slack", outcome: "kept" }, { way: "telegram", outcome: "kept" }]);
  });

  it("says what this Ziffr lacks: no mail server, no Slack app, no Telegram bot", async () => {
    const { w, ann } = await setup();
    const hold = (keys: string[]) => { const was = keys.map((k) => [k, process.env[k]] as const); for (const k of keys) delete process.env[k]; return () => { for (const [k, v] of was) if (v !== undefined) process.env[k] = v; }; };
    let back = hold(["ZIFFR_SMTP_URL"]);
    try { expect(await sendTestMessage(w.actor(ann.id), "email")).toMatchObject({ state: "kept", note: NO_WAY_HERE.mail }); } finally { back(); }
    back = hold(["ZIFFR_SLACK_CLIENT_ID", "ZIFFR_SLACK_CLIENT_SECRET", "ZIFFR_SLACK_SIGNING_SECRET"]);
    try { expect(await sendTestMessage(w.actor(ann.id), "slack")).toMatchObject({ state: "kept", note: NO_WAY_HERE.slackApp }); } finally { back(); }
    back = hold(["ZIFFR_TELEGRAM_BOT_TOKEN"]);
    try { expect(await sendTestMessage(w.actor(ann.id), "telegram")).toMatchObject({ state: "kept", note: NO_WAY_HERE.telegramBot }); } finally { back(); }
    expect((await deliveriesOf(w.id)).every((d) => d.mail_state === "outbox" && d.kind === "test")).toBe(true);
    expect(await inbox(ann.mail)).toHaveLength(0);
  });

  it("says when the Workspace has not connected Slack or turned Telegram on", async () => {
    const w = await workspace("Plain"); cleanups.push(w.cleanup);
    const ann = await w.person("member", { email: address("ann") });
    expect(await sendTestMessage(w.actor(ann), "slack")).toMatchObject({ state: "kept", note: NO_WAY_HERE.slackWorkspace });
    expect(await sendTestMessage(w.actor(ann), "telegram")).toMatchObject({ state: "kept", note: NO_WAY_HERE.telegramWorkspace });
  });

  it("keeps an email for a person with no usable address", async () => {
    const w = await workspace("Plain"); cleanups.push(w.cleanup);
    const ann = await w.person("member");
    expect(await sendTestMessage(w.actor(ann), "email")).toMatchObject({ state: "kept", note: NO_WAY_HERE.address });
  });

  it("shows no mail server's own words when the send fails", async () => {
    const { w, ann } = await setup();
    process.env.ZIFFR_SMTP_URL = "smtp://127.0.0.1:1";
    try {
      const r = await sendTestMessage(w.actor(ann.id), "email");
      expect(r.state).toBe("queued");
      expect(r.note).toBeNull();
    } finally { process.env.ZIFFR_SMTP_URL = SETTINGS.ZIFFR_SMTP_URL; }
  });
});

describe("the limits", () => {
  it("lets 3 through by one way in 10 minutes, then says which limit and when it resets, and another way still goes", async () => {
    const { w, ann, sara } = await setup();
    for (let i = 0; i < TEST_PER_WAY_PER_WINDOW; i++) expect((await sendTestMessage(w.actor(ann.id), "email")).state).toBe("sent");
    const posts = (await inbox(ann.mail)).length;
    const over = await sendTestMessage(w.actor(ann.id), "email");
    expect(over).toMatchObject({ state: "limited", label: "Email" });
    expect(over.note).toMatch(/3 test messages by this way in the last 10 minutes\. Try again in (9|10) minutes\./);
    expect(Date.parse(over.resetsAt!) - Date.now()).toBeGreaterThan(8 * 60_000);
    expect(await inbox(ann.mail)).toHaveLength(posts);
    expect((await sendTestMessage(w.actor(ann.id), "slack")).state).toBe("sent");
    // Another person's presses do not count against this one.
    expect((await sendTestMessage(w.actor(sara), "email")).state).not.toBe("limited");
    // The window moves on: 11 minutes later it is allowed again.
    await db().from("test_message_sends").update({ at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("person_id", ann.id).eq("way", "email");
    expect((await sendTestMessage(w.actor(ann.id), "email")).state).toBe("sent");
  });

  it("lets 20 through a day over all ways, then says the day's limit", async () => {
    const { w, ann } = await setup();
    const ways = ["email", "slack", "telegram"];
    await db().from("test_message_sends").insert(Array.from({ length: TEST_PER_DAY - 1 }, (_, i) => ({ workspace_id: w.id, person_id: ann.id, way: ways[i % 3], at: new Date(Date.now() - (20 + i) * 60_000).toISOString() })));
    expect((await sendTestMessage(w.actor(ann.id), "email")).state).toBe("sent");
    const over = await sendTestMessage(w.actor(ann.id), "slack");
    expect(over).toMatchObject({ state: "limited" });
    expect(over.note).toMatch(/^You sent 20 test messages today\. Try again in \d+ (minutes|hours)\.$/);
    // A day later the oldest have left.
    await db().from("test_message_sends").update({ at: new Date(Date.now() - 25 * 3_600_000).toISOString() }).eq("person_id", ann.id);
    expect((await sendTestMessage(w.actor(ann.id), "slack")).state).toBe("sent");
  });

  it("holds under parallel presses: six at once let exactly three through", async () => {
    const { w, ann } = await setup();
    const results = await Promise.all(Array.from({ length: 6 }, () => sendTestMessage(w.actor(ann.id), "email")));
    expect(results.filter((r) => r.state === "limited")).toHaveLength(3);
    expect(results.filter((r) => r.state === "sent")).toHaveLength(3);
    expect(await inbox(ann.mail)).toHaveLength(3);
  });

  it("counts a Test Message in a trial towards the messages a day", async () => {
    const { w, ann } = await setup();
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString() }).eq("id", w.id);
    expect((await sendTestMessage(w.actor(ann.id), "email")).state).toBe("sent");
    const { data } = await db().from("trial_sends").select("delivery_id").eq("workspace_id", w.id);
    expect(data).toHaveLength(1);
    // The day's cap in a trial is 5 a person: four more presses (spread over the ways) and the sixth is stopped.
    await db().from("test_message_sends").insert(Array.from({ length: TEST_PER_DAY_IN_TRIAL - 2 }, (_, i) => ({ workspace_id: w.id, person_id: ann.id, way: ["slack", "telegram"][i % 2], at: new Date(Date.now() - (20 + i) * 60_000).toISOString() })));
    expect((await sendTestMessage(w.actor(ann.id), "slack")).state).toBe("sent");
    const over = await sendTestMessage(w.actor(ann.id), "slack");
    expect(over).toMatchObject({ state: "limited" });
    expect(over.note).toMatch(/^You sent 5 test messages today\./);
  });
});

describe("a Test Message cannot reach anyone else", () => {
  it("takes no recipient: only the way, and a way that is not one of three is refused", async () => {
    expect(sendTestMessage.length).toBe(2);
    const { w, ann, bo } = await setup();
    for (const bad of [bo.id, bo.mail, { way: "email", to: bo.mail }, ["email"], "whatsapp", "tickets", "", null, undefined, 7]) {
      await expect(sendTestMessage(w.actor(ann.id), bad)).rejects.toBeInstanceOf(Forbidden);
    }
    expect(await deliveriesOf(w.id)).toHaveLength(0);
    expect((await db().from("test_message_sends").select("id").eq("workspace_id", w.id)).data).toHaveLength(0);
  });

  it("sends only to the person who pressed, by every way, whoever else is linked", async () => {
    const { w, sara, ann, bo, cy } = await setup();
    const posts = slack.of("chat.postMessage").length; const sends = tg.of("sendMessage").length;
    for (const way of ["email", "slack", "telegram"] as const) await sendTestMessage(w.actor(ann.id), way);
    const all = await deliveriesOf(w.id);
    expect(all).toHaveLength(3);
    for (const d of all) expect(d).toMatchObject({ kind: "test", recipient_id: ann.id, sender_id: null });
    expect(slack.of("conversations.open").slice(-1).map((c) => c.params.users)).toEqual([ann.slackUser]);
    expect(slack.of("chat.postMessage")).toHaveLength(posts + 1);
    expect(tg.of("sendMessage").slice(sends).map((c) => c.params.chat_id)).toEqual([ann.chat]);
    expect(await inbox(ann.mail)).toHaveLength(1);
    for (const other of [bo.mail, (await db().from("profiles").select("email").eq("id", cy).single()).data!.email, (await db().from("profiles").select("email").eq("id", sara).single()).data!.email]) expect(await inbox(other)).toHaveLength(0);
    // Nothing about anybody else in what was sent.
    const bodies = all.map((d) => String(d.body ?? "") + String(d.subject ?? "")).join(" ");
    expect(bodies).not.toContain(bo.mail);
  });

  it("sends from another Workspace's person nothing here: a person who is not a member of the Workspace is refused", async () => {
    const { w } = await setup();
    const o = await workspace("Elsewhere"); cleanups.push(o.cleanup);
    const stranger = await o.person("member", { email: address("stranger") });
    await expect(sendTestMessage({ personId: stranger, workspaceId: w.id, role: "member" }, "email")).rejects.toBeInstanceOf(Forbidden);
    expect(await deliveriesOf(w.id)).toHaveLength(0);
    expect(await inbox((await db().from("profiles").select("email").eq("id", stranger).single()).data!.email)).toHaveLength(0);
  });
});

describe("who may send one", () => {
  it("refuses an Access Key, a Guest and the demo, and sends nothing", async () => {
    const { w, ann } = await setup();
    const guest = await w.person("guest", { email: address("guest") });
    const key = { ...w.actor(ann.id), key: { id: "k1", scopes: ["*"] } } as unknown as Actor;
    await expect(sendTestMessage(key, "email")).rejects.toBeInstanceOf(Forbidden);
    await expect(sendTestMessage(w.actor(guest), "email")).rejects.toBeInstanceOf(Forbidden);
    await expect(sendTestMessage({ personId: "someone", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, "email")).rejects.toBeInstanceOf(DemoReadOnly);
    expect(await deliveriesOf(w.id)).toHaveLength(0);
    expect(await deliveriesOf(DEMO_WORKSPACE_ID).then((d) => d.filter((x) => x.kind === "test"))).toHaveLength(0);
    expect(await inbox((await db().from("profiles").select("email").eq("id", guest).single()).data!.email)).toHaveLength(0);
  });

  it("is allowed for an Owner, an Admin and a Member, also in a trial", async () => {
    const { w, sara } = await setup();
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString() }).eq("id", w.id);
    const admin = await w.person("admin", { email: address("admin") });
    expect((await sendTestMessage(w.actor(sara), "email")).state).toBe("sent");
    expect((await sendTestMessage(w.actor(admin), "email")).state).toBe("sent");
  });
});
