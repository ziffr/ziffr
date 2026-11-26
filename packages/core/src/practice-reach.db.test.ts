// What may reach somebody from a Practice Workspace, against the database and the fake Slack and Telegram (spec 0063,
// #1271; GLOSSARY: Practice Workspace): only the person it was made for, each way only while switched on and only at
// the address or account recorded for it. And the near misses, which send nothing: another address or account, another
// person, a message held earlier or queued before the switch went off, an address with several recipients, and the same
// rules where the database holds them.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { makeCalendarLink } from "./calendar-links";
import { db } from "./db";
import { mailboxKey, sendDelivery, sendMail, type OutgoingMail } from "./mail";
import { initialDeliveryState } from "./outbound";
import { heldBack, PRACTICE_HELD, PracticeRefused } from "./practice";
import { practiceWays, switchPracticeWay } from "./practice-ways";
import { finishSlackInstall, slackBot, startSlackInstall } from "./slack-connection";
import { linkSlackByCode, startSlackLink } from "./slack-people";
import { sendSlackDelivery } from "./slack-send";
import { setTelegramEnabled, telegramOnIn } from "./telegram-connection";
import { linkTelegramByCode, startTelegramLink } from "./telegram-people";
import { sendTelegramDelivery } from "./telegram-send";
import { createViewLink } from "./view-links";
import { createWebhook } from "./webhooks";
import { fakeSlack } from "./test/fake-slack";
import { fakeTelegram } from "./test/fake-telegram";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 120_000 });
const MAIL = { ZIFFR_SMTP_URL: "smtp://127.0.0.1:1", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test", ZIFFR_INBOUND_DOMAIN: "in.example.test", ZIFFR_INBOUND_SECRET: "x".repeat(32), ZIFFR_SECRETS_KEY: randomBytes(32).toString("base64") };
const saved: Record<string, string | undefined> = {};
let slack: Awaited<ReturnType<typeof fakeSlack>>;
let tg: Awaited<ReturnType<typeof fakeTelegram>>;
beforeAll(async () => {
  for (const [k, v] of Object.entries(MAIL)) { saved[k] = process.env[k]; process.env[k] = v; }
  slack = await fakeSlack(); tg = await fakeTelegram();
});
afterAll(async () => {
  await slack.stop(); await tg.stop();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c().catch(() => {}); });

const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;
let chats = Date.now() * 100 + 7;

/** A Practice Workspace whose maker signs in with a verified address and is an Installation Admin, and a made-up Member. */
async function practice() {
  const w = await workspace("Practice", { practice: true }); cleanups.push(w.cleanup);
  const mail = address("admin");
  const me = await w.person("owner", { id: w.practiceFor!, email: mail });
  const { data } = await db().auth.admin.createUser({ email: mail, email_confirm: true });
  cleanups.push(async () => void (await db().auth.admin.deleteUser(data.user!.id)));
  await db().from("profiles").update({ auth_user_id: data.user!.id }).eq("id", me).throwOnError();
  await db().from("installation_admins").insert({ person_id: me }).throwOnError();
  cleanups.push(async () => void (await db().from("installation_admins").delete().eq("person_id", me)));
  const ann = await w.madeUp("member");
  return { w, me, ann, mail, authId: data.user!.id, actor: w.actor(me) };
}
type Practice = Awaited<ReturnType<typeof practice>>;
/** A Delivery asked to be queued, and how it was kept. */
async function queue(p: Practice, recipient: string, connector = "email") {
  const { data, error } = await db().from("deliveries").insert({ workspace_id: p.w.id, connector, recipient_id: recipient, kind: "notice", subject: "Hello", body: "Hello", mail_state: "queued" }).select("id, mail_state").single();
  if (error) throw new Error(error.message);
  return data as { id: number; mail_state: string };
}
const row = async (id: number) => (await db().from("deliveries").select("mail_state, last_error").eq("id", id).single()).data;
/** A mail transport that only records. */
function recorder() {
  const sent: OutgoingMail[] = [];
  return { sent, transport: async (m: OutgoingMail) => { sent.push(m); return { messageId: "<1@test>" }; } };
}
const held = { mail_state: "outbox", last_error: PRACTICE_HELD };
const code = (r: { error: { code?: string } | null }) => r.error?.code;

describe("the switches", () => {
  it("are off by default, and the person's own alone", async () => {
    const p = await practice();
    expect((await practiceWays(p.actor))!.map((s) => [s.way, s.on])).toEqual([["email", false], ["slack", false], ["telegram", false]]);
    expect((await queue(p, p.me)).mail_state).toBe("outbox");
    expect(await practiceWays(p.w.actor(p.ann, "member"))).toBeNull();
    await expect(switchPracticeWay(p.w.actor(p.ann, "member"), "email", true)).rejects.toBeInstanceOf(Forbidden);
    await expect(switchPracticeWay({ ...p.actor, key: { id: 1 } as never }, "email", true)).rejects.toBeInstanceOf(Forbidden);
    await expect(switchPracticeWay(p.actor, "webhook", true)).rejects.toBeInstanceOf(Forbidden);
    const plain = await workspace("Plain"); cleanups.push(plain.cleanup);
    const them = await plain.person("owner");
    expect(await practiceWays(plain.actor(them))).toBeNull();
    await expect(switchPracticeWay(plain.actor(them), "email", true)).rejects.toBeInstanceOf(Forbidden);
    expect(code(await db().from("practice_ways").insert({ workspace_id: plain.id, way: "slack" }))).toBe("ZF4P2");
    await db().from("installation_admins").delete().eq("person_id", p.me);
    await expect(switchPracticeWay(p.actor, "email", true)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("email to yourself", () => {
  it("goes to the verified address, with no reply address, once switched on", async () => {
    const p = await practice();
    const before = await queue(p, p.me);
    await switchPracticeWay(p.actor, "email", true);
    const d = await queue(p, p.me);
    expect(d.mail_state).toBe("queued");
    const { sent, transport } = recorder();
    expect(await sendDelivery(d.id, transport)).toBe("sent");
    expect(sent.map((m) => [m.to, m.replyTo])).toEqual([[p.mail, undefined]]);
    // What was held before the switch stays held.
    expect(await sendDelivery(before.id, transport)).toBe("skipped");
    expect(await row(before.id)).toMatchObject(held);
    expect(sent).toHaveLength(1);
  });
  it("never goes to anyone else, whatever is asked", async () => {
    const p = await practice();
    await switchPracticeWay(p.actor, "email", true);
    expect(await initialDeliveryState("email", p.w.id, p.ann)).toBe("outbox");
    expect((await queue(p, p.ann)).mail_state).toBe("outbox");
    // A queued one of the person's moved to somebody else is held by the database.
    const mine = await queue(p, p.me);
    expect((await db().from("deliveries").update({ recipient_id: p.ann }).eq("id", mine.id).select("mail_state").single()).data?.mail_state).toBe("outbox");
    // No other email at all, also to the person's own address.
    const { sent, transport } = recorder();
    for (const to of [p.mail, "someone@example.org"]) await expect(sendMail({ to, subject: "x", text: "x" }, p.w.id, transport)).rejects.toBeInstanceOf(PracticeRefused);
    expect(sent).toEqual([]);
  });
  it.each<[string, (p: Practice) => PromiseLike<unknown>]>([
    ["the address in the profile changed", (p) => db().from("profiles").update({ email: address("else") }).eq("id", p.me).throwOnError()],
    ["the sign-in address changed", (p) => db().auth.admin.updateUserById(p.authId, { email: address("new"), email_confirm: true })],
    ["both changed to a new address of their own", async (p) => { const next = address("new"); await db().auth.admin.updateUserById(p.authId, { email: next, email_confirm: true }); await db().from("profiles").update({ email: next }).eq("id", p.me).throwOnError(); }],
    ["the profile holds two addresses", (p) => db().from("profiles").update({ email: `${p.mail}, other@example.org` }).eq("id", p.me).throwOnError()],
    ["they are no Installation Admin any more", (p) => db().from("installation_admins").delete().eq("person_id", p.me).throwOnError()],
  ])("sends nothing once %s", async (_what, change) => {
    const p = await practice();
    await switchPracticeWay(p.actor, "email", true);
    const d = await queue(p, p.me);
    await change(p);
    const { sent, transport } = recorder();
    expect(await sendDelivery(d.id, transport)).not.toBe("sent");
    expect(sent).toEqual([]);
  });
  it("holds what was queued when the switch went off, also after it is on again", async () => {
    const p = await practice();
    await switchPracticeWay(p.actor, "email", true);
    const d = await queue(p, p.me);
    await switchPracticeWay(p.actor, "email", false);
    expect(await row(d.id)).toMatchObject(held);
    expect((await queue(p, p.me)).mail_state).toBe("outbox");
    await switchPracticeWay(p.actor, "email", true);
    const { sent, transport } = recorder();
    expect(await sendDelivery(d.id, transport)).toBe("skipped");
    expect(sent).toEqual([]);
    expect(code(await db().from("deliveries").update({ mail_state: "sending" }).eq("id", d.id).eq("recipient_id", p.me))).toBeUndefined();
  });
  it("counts a send only for the person's own Delivery to that inbox, in the database too", async () => {
    const p = await practice();
    await switchPracticeWay(p.actor, "email", true);
    const mine = await queue(p, p.me);
    const hers = await queue(p, p.ann);
    const send = (delivery_id: number | null, key: string) => db().from("email_sends").insert({ workspace_id: p.w.id, delivery_id, address_key: key });
    expect(code(await send(hers.id, mailboxKey(p.mail)))).toBe("ZF4P2");
    expect(code(await send(mine.id, mailboxKey("someone@example.org")))).toBe("ZF4P2");
    expect(code(await send(null, mailboxKey(p.mail)))).toBe("ZF4P2");
    expect(code(await send(mine.id, mailboxKey(p.mail)))).toBeUndefined();
  });
});

describe("Telegram to yourself", () => {
  /** Telegram switched on, turned on and linked to a chat of the person's own. */
  async function linked() {
    const p = await practice();
    await expect(setTelegramEnabled(p.actor, true)).rejects.toThrow(/switch this way on/);
    await switchPracticeWay(p.actor, "telegram", true);
    await setTelegramEnabled(p.actor, true);
    const chat = ++chats;
    const link = async (id: number) => {
      const start = new URL((await startTelegramLink(p.actor)).url).searchParams.get("start")!;
      return linkTelegramByCode({ code: start, userId: id, chatId: id, chatType: "private" });
    };
    expect(await link(chat)).toMatchObject({ linked: true });
    return { p, chat, link };
  }
  const messagesTo = (chat: number) => tg.calls.filter((c) => c.method === "sendMessage" && Number(c.params.chat_id) === chat);

  it("goes to the chat linked after the switch, and to nobody else", async () => {
    const { p, chat } = await linked();
    expect((await practiceWays(p.actor))!.find((s) => s.way === "telegram")).toMatchObject({ on: true, account: "recorded" });
    const d = await queue(p, p.me, "telegram");
    expect(await sendTelegramDelivery(d.id)).toBe("sent");
    expect(messagesTo(chat)).toHaveLength(1);
    expect((await queue(p, p.ann, "telegram")).mail_state).toBe("outbox");
  });
  it("sends nothing to another account linked later", async () => {
    const { p, link } = await linked();
    const other = ++chats;
    expect(await link(other)).toMatchObject({ linked: true, silent: true });
    expect((await practiceWays(p.actor))!.find((s) => s.way === "telegram")).toMatchObject({ account: "changed" });
    const d = await queue(p, p.me, "telegram");
    expect(await sendTelegramDelivery(d.id)).toBe("skipped");
    expect(await row(d.id)).toMatchObject(held);
    expect(messagesTo(other)).toHaveLength(0);
    expect(await heldBack(p.w.id, "telegram", { recipientId: p.me, destination: String(other) })).toBe(true);
  });
  it("ends the connection and holds what waited when switched off", async () => {
    const { p, chat } = await linked();
    const d = await queue(p, p.me, "telegram");
    await switchPracticeWay(p.actor, "telegram", false);
    expect(await row(d.id)).toMatchObject(held);
    expect(await sendTelegramDelivery(d.id)).toBe("skipped");
    expect(messagesTo(chat)).toHaveLength(0);
    expect(await telegramOnIn(p.w.id)).toBe(false);
    expect((await db().from("telegram_links").select("person_id").eq("workspace_id", p.w.id)).data).toEqual([]);
  });
  it("counts a send only to the recorded chat, and lets only an ending change a stored switch, in the database too", async () => {
    const { p, chat } = await linked();
    const mine = await queue(p, p.me, "telegram");
    const hers = await queue(p, p.ann, "telegram");
    const send = (delivery_id: number, chat_id: number) => db().from("telegram_sends").insert({ workspace_id: p.w.id, delivery_id, chat_id });
    expect(code(await send(mine.id, chat + 1))).toBe("ZF4P2");
    expect(code(await send(hers.id, chat))).toBe("ZF4P2");
    expect(code(await send(mine.id, chat))).toBeUndefined();
    // Switched off in the database alone: the row may still be turned off, never on again or moved.
    await db().from("practice_ways").delete().eq("workspace_id", p.w.id);
    const set = (patch: Record<string, unknown>) => db().from("telegram_workspaces").update(patch).eq("workspace_id", p.w.id);
    const plain = await workspace("Plain"); cleanups.push(plain.cleanup);
    expect(code(await set({ workspace_id: plain.id }))).toBe("ZF4P2");
    expect(code(await set({ enabled: false }))).toBeUndefined();
    expect(code(await set({ enabled: true }))).toBe("ZF4P2");
    expect(code(await send(mine.id, chat))).toBe("ZF4P2");
  });
});

describe("Slack to yourself", () => {
  async function connected() {
    const p = await practice();
    await expect(startSlackInstall(p.actor)).rejects.toThrow(/switch this way on/);
    await switchPracticeWay(p.actor, "slack", true);
    const team = slack.newTeam();
    const state = new URL(await startSlackInstall(p.actor)).searchParams.get("state")!;
    expect(await finishSlackInstall(p.actor, { code: "code-1234567890", state })).toBe("connected");
    return { p, team: (team.team as { id: string }).id };
  }
  const posts = () => slack.of("chat.postMessage").length;
  const lookups = () => slack.of("users.lookupByEmail").length;

  it("looks nobody up, sends only to the account linked with a code, and not to another linked later", async () => {
    const { p } = await connected();
    const before = lookups();
    const early = await queue(p, p.me, "slack");
    // Nothing linked yet: it goes nowhere, and not later either.
    expect(await sendSlackDelivery(early.id)).toBe("failed");
    const link = async (user: string) => linkSlackByCode((await slackBot(p.w.id))!, user, (await startSlackLink(p.actor)).code);
    const mine = `U${randomBytes(5).toString("hex").toUpperCase()}`;
    expect(await link(mine)).not.toBeNull();
    const d = await queue(p, p.me, "slack");
    const sent = posts();
    expect(await sendSlackDelivery(d.id)).toBe("sent");
    expect(posts()).toBe(sent + 1);
    expect(await link(`U${randomBytes(5).toString("hex").toUpperCase()}`)).not.toBeNull();
    const next = await queue(p, p.me, "slack");
    expect(await sendSlackDelivery(next.id)).toBe("skipped");
    expect(posts()).toBe(sent + 1);
    expect((await queue(p, p.ann, "slack")).mail_state).toBe("outbox");
    expect(lookups()).toBe(before);
    await switchPracticeWay(p.actor, "slack", false);
    expect(await slackBot(p.w.id)).toBeNull();
    expect((await db().from("slack_installations").select("revoked_at").eq("workspace_id", p.w.id).single()).data?.revoked_at).not.toBeNull();
  });
  it("counts a send only to the recorded account, takes no look-up link, and lets only an ending change a stored connection", async () => {
    const { p, team } = await connected();
    const user = `U${randomBytes(5).toString("hex").toUpperCase()}`;
    const match = (person: string, matched_by: string, slack_user_id: string) => db().from("slack_links").insert({ workspace_id: p.w.id, person_id: person, team_id: team, slack_user_id, matched_by, email: matched_by === "email" ? p.mail : null });
    expect(code(await match(p.me, "email", user))).toBe("ZF4P2");
    expect(code(await match(p.ann, "code", user))).toBe("ZF4P2");
    expect(code(await match(p.me, "code", user))).toBeUndefined();
    const mine = await queue(p, p.me, "slack");
    const hers = await queue(p, p.ann, "slack");
    const send = (delivery_id: number, team_id: string, recipient_key: string) => db().from("slack_sends").insert({ workspace_id: p.w.id, delivery_id, team_id, recipient_key });
    expect(code(await send(mine.id, team, `${team}:UOTHER123`))).toBe("ZF4P2");
    expect(code(await send(mine.id, "TOTHER123", `${team}:${user}`))).toBe("ZF4P2");
    expect(code(await send(hers.id, team, `${team}:${user}`))).toBe("ZF4P2");
    expect(code(await send(mine.id, team, `${team}:${user}`))).toBeUndefined();
    await db().from("practice_ways").delete().eq("workspace_id", p.w.id);
    const set = (patch: Record<string, unknown>) => db().from("slack_installations").update(patch).eq("workspace_id", p.w.id);
    const now = new Date().toISOString();
    expect(code(await set({ team_id: "TOTHER123" }))).toBe("ZF4P2");
    expect(code(await set({ bot_token: "x".repeat(40) }))).toBe("ZF4P2");
    expect(code(await set({ revoked_at: now, team_id: "TOTHER123" }))).toBe("ZF4P2");
    expect(code(await set({ revoked_at: now }))).toBeUndefined();
    expect(code(await set({ revoked_at: null }))).toBe("ZF4P2");
  });
});

describe("links and Webhooks", () => {
  it("are the person's own to make, and nobody else's", async () => {
    const p = await practice();
    const { data: dash } = await db().from("dashboards").insert({ workspace_id: p.w.id, name: "Board", owner_id: p.me }).select("id").single();
    const later = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    expect(await createViewLink(p.actor, "dashboard", Number(dash!.id), { label: "x", expires: later, frozen: false })).toMatch(/.{20,}/);
    expect((await makeCalendarLink(p.actor)).secret).toMatch(/.{20,}/);
    expect((await createWebhook(p.actor, { name: "Mine", url: "https://example.org/hook" })).id).toBeTruthy();
    expect(code(await db().from("view_links").insert({ workspace_id: p.w.id, created_by: p.ann }))).toBe("ZF4P2");
    expect(code(await db().from("calendar_links").insert({ workspace_id: p.w.id, person_id: p.ann }))).toBe("ZF4P2");
    expect(code(await db().from("webhooks").insert({ workspace_id: p.w.id, created_by: p.ann }))).toBe("ZF4P2");
    expect(code(await db().from("webhooks").insert({ workspace_id: p.w.id, created_by: p.me, owner_id: p.ann }))).toBe("ZF4P2");
    expect(code(await db().from("webhooks").update({ created_by: p.ann }).eq("workspace_id", p.w.id))).toBe("ZF4P2");
    expect(code(await db().from("invitations").insert({ workspace_id: p.w.id }))).toBe("ZF4P2");
    expect(code(await db().from("contacts").insert({ workspace_id: p.w.id }))).toBe("ZF4P2");
  });
});
