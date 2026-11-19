// The Telegram round trip test against the real database and a fake Telegram (spec 0025): only an Installation
// Admin starts one; its code works once, for ten minutes, and only as a test; the bot's message and the admin's
// numbered reply finish it; it connects nobody to any Workspace, forgets the chat when it is done, and is limited.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { claimInstallation, prepareSetupCode } from "./installation-admins";
import { startTelegramTest, TELEGRAM_TESTS_PER_HOUR, telegramTestStatus } from "./installation-telegram-test";
import { forgetStoredSettings } from "./settings-in-effect";
import { setTelegramEnabled } from "./telegram-connection";
import { receiveTelegramUpdate } from "./telegram-inbound";
import { linkTelegramByCode, startTelegramLink } from "./telegram-people";
import { sendWaitingTelegram } from "./telegram-send";
import { fakeTelegram } from "./test/fake-telegram";
import { workspace } from "./test/db-fixtures";

let savedAdmins: Record<string, unknown>[] = [];
const cleanups: (() => Promise<void>)[] = [];
let tg: Awaited<ReturnType<typeof fakeTelegram>>;
let next = Math.floor(Math.random() * 1e9);
const id = () => ++next;

beforeAll(async () => { savedAdmins = (await db().from("installation_admins").select("*")).data ?? []; });
afterAll(async () => {
  await db().from("installation_admins").delete().neq("person_id", "");
  if (savedAdmins.length) await db().from("installation_admins").insert(savedAdmins);
});
beforeEach(async () => {
  await db().from("installation_admins").delete().neq("person_id", "");
  delete process.env.ZIFFR_INSTALLATION_ADMINS;
  tg = await fakeTelegram();
  forgetStoredSettings();
  // The bot's answer limits count recent answers, tests' included: one test's burst must not silence the next.
  await db().from("telegram_updates").delete().like("outcome", "test_%");
});
afterEach(async () => {
  await tg.stop();
  for (const c of cleanups.splice(0)) await c();
});

/** A signed-in person; the first one made in a test claims the Installation and is its Installation Admin. */
async function person(claim = true) {
  const pid = `t-${randomUUID()}`;
  const email = `tt-${pid.slice(2, 10)}@example.test`;
  const { data } = await db().auth.admin.createUser({ email, email_confirm: true });
  const { error } = await db().from("profiles").insert({ id: pid, name: `Admin ${pid.slice(2, 6)}`, role: "", color: "#000", email, auth_user_id: data.user!.id });
  if (error) throw error;
  cleanups.push(async () => {
    await db().from("installation_telegram_tests").delete().eq("person_id", pid);
    await db().from("installation_admins").delete().eq("person_id", pid);
    await db().from("profiles").delete().eq("id", pid);
    await db().auth.admin.deleteUser(data.user!.id).catch(() => {});
  });
  if (claim) {
    let code = "";
    await prepareSetupCode({ fresh: true }, (c) => { code = c; });
    await claimInstallation({ personId: pid }, code);
  }
  return { personId: pid };
}

/** A text message from `user` in their private chat, replying to message `to` when given. */
const text = (user: number, body: string, to?: number) => ({
  update_id: id(),
  message: { message_id: id() % 1_000_000, from: { id: user, is_bot: false, first_name: "Ann" }, chat: { id: user, type: "private" }, date: 0, text: body, ...(to ? { reply_to_message: { message_id: to, chat: { id: user, type: "private" }, date: 0 } } : {}) },
});
const codeOf = (url: string) => new URL(url).searchParams.get("start")!;
const said = () => tg.of("sendMessage").map((c) => String(c.params.text));
const lastSent = () => tg.of("sendMessage").at(-1)!;
const rowOf = async (personId: string) => (await db().from("installation_telegram_tests").select("*").eq("person_id", personId).order("id", { ascending: false }).limit(1).single()).data!;

describe("the Telegram round trip test", () => {
  it("is started only by an Installation Admin, and only with a working bot", async () => {
    const a = await person();
    const w = await workspace();
    cleanups.push(w.cleanup);
    const owner = w.actor(await w.person("owner"));
    await expect(startTelegramTest(owner)).rejects.toThrow(/Only Installation Admins/);
    await expect(telegramTestStatus(owner)).rejects.toThrow(/Only Installation Admins/);
    tg.fail("getMe", { code: 401 });
    const { forgetTelegramBot } = await import("./telegram-connection");
    forgetTelegramBot();
    await expect(startTelegramTest(a)).rejects.toThrow(/does not accept/);
    delete process.env.ZIFFR_TELEGRAM_BOT_TOKEN;
    await expect(startTelegramTest(a)).rejects.toThrow(/Save a bot token first/);
  });

  it("sends a message on Start and is done when the admin replies with a number", async () => {
    const a = await person();
    expect(await telegramTestStatus(a)).toEqual({ state: "none", at: null });
    const { url } = await startTelegramTest(a);
    expect(url).toMatch(/^https:\/\/t\.me\/ziffr_test_bot\?start=zt_[A-Za-z0-9_-]{43}$/);
    const code = codeOf(url);
    // Only the code's hash is kept.
    const row = await rowOf(a.personId);
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(code);
    expect((await telegramTestStatus(a)).state).toBe("waiting_start");

    const user = id();
    expect(await receiveTelegramUpdate(text(user, `/start ${code}`))).toBe("test_started");
    expect(lastSent().params).toMatchObject({ chat_id: user, text: "Ziffr test from ziffr.example.test: reply to this message with any number to finish." });
    expect((await telegramTestStatus(a)).state).toBe("sent");
    // Once only.
    expect(await receiveTelegramUpdate(text(user, `/start ${code}`))).toBe("test_refused");

    const testMessage = Number((await rowOf(a.personId)).message_id);
    expect(await receiveTelegramUpdate(text(user, "hello", testMessage))).toBe("test_hint");
    expect(said().at(-1)).toMatch(/with any number/);
    // Another account's reply is no answer to it.
    expect(await receiveTelegramUpdate(text(id(), "7", testMessage))).toBe("unknown_message");
    expect(await receiveTelegramUpdate(text(user, "42", testMessage))).toBe("test_answered");
    expect(said().at(-1)).toBe("Telegram works: Ziffr sent this and got your answer.");
    const done = await telegramTestStatus(a);
    expect(done.state).toBe("done");
    // The chat is forgotten once it is done; only the times stay.
    expect(await rowOf(a.personId)).toMatchObject({ chat_id: null, telegram_user_id: null, message_id: null, code_hash: null });
    const { data: events } = await db().from("installation_audit_events").select("kind").eq("actor_id", a.personId).eq("kind", "setting.test_telegram");
    expect(events).toHaveLength(1);
  });

  it("connects nobody to any Workspace, and Workspace codes and test codes never stand in for each other", async () => {
    const a = await person();
    const w = await workspace();
    cleanups.push(w.cleanup);
    const owner = await w.person("owner");
    await setTelegramEnabled(w.actor(owner), true);
    const user = id();
    const { url } = await startTelegramTest(a);
    await receiveTelegramUpdate(text(user, `/start ${codeOf(url)}`));
    expect((await db().from("telegram_links").select("person_id").eq("telegram_user_id", user)).data).toEqual([]);
    // A test code is never a Workspace link, and a Workspace code is never a test.
    expect(await linkTelegramByCode({ code: `zt_${"a".repeat(43)}`, userId: user, chatId: user, chatType: "private" })).toMatchObject({ linked: false });
    const link = await startTelegramLink(w.actor(owner));
    const before = await rowOf(a.personId);
    expect(await receiveTelegramUpdate(text(user, `/start ${codeOf(link.url)}`))).toBe("linked");
    expect(await rowOf(a.personId)).toEqual(before);
    // Replies to the test message are never read as a Delivery's: no value, no Thread.
    expect((await db().from("deliveries").select("id").eq("telegram_chat_id", user)).data).toEqual([]);
  });

  it("refuses a code after ten minutes, or once its admin is no admin, and forgets a chat left waiting", async () => {
    const a = await person();
    const { url } = await startTelegramTest(a);
    await db().from("installation_telegram_tests").update({ created_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("person_id", a.personId);
    expect(await receiveTelegramUpdate(text(id(), `/start ${codeOf(url)}`))).toBe("test_refused");
    expect((await telegramTestStatus(a)).state).toBe("expired");

    const second = await startTelegramTest(a);
    const user = id();
    await receiveTelegramUpdate(text(user, `/start ${codeOf(second.url)}`));
    await db().from("installation_telegram_tests").update({ started_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("person_id", a.personId).not("chat_id", "is", null);
    expect((await telegramTestStatus(a)).state).toBe("expired");
    expect((await rowOf(a.personId)).chat_id).toBeNull();

    const b = await person(false);
    await db().from("installation_admins").insert({ person_id: b.personId, added_by: a.personId });
    const third = await startTelegramTest(b);
    await db().from("installation_admins").delete().eq("person_id", b.personId);
    expect(await receiveTelegramUpdate(text(id(), `/start ${codeOf(third.url)}`))).toBe("test_refused");
    expect(said().at(-1)).toMatch(/does not work any more/);
  });

  it("says when Telegram took the Start but the message could not be sent", async () => {
    const a = await person();
    const { url } = await startTelegramTest(a);
    tg.fail("sendMessage", { code: 400 });
    expect(await receiveTelegramUpdate(text(id(), `/start ${codeOf(url)}`))).toBe("test_started");
    expect((await telegramTestStatus(a)).state).toBe("send_failed");
    expect((await rowOf(a.personId)).chat_id).toBeNull();
  });

  it("keeps the bot quiet under a flood of wrong test codes", async () => {
    await person();
    const user = id();
    const before = tg.of("sendMessage").length;
    for (let i = 0; i < 15; i++) await receiveTelegramUpdate(text(user, `/start zt_${"x".repeat(40)}${String(i).padStart(3, "0")}`));
    // At most ten answers a minute per account (and five a second for the bot), as for every other message it answers.
    const answered = tg.of("sendMessage").length - before;
    expect(answered).toBeGreaterThan(0);
    expect(answered).toBeLessThanOrEqual(10);
  });

  it("finishes once for two answers at once, and not at all for an admin removed meanwhile", async () => {
    const a = await person();
    const { url } = await startTelegramTest(a);
    const user = id();
    await receiveTelegramUpdate(text(user, `/start ${codeOf(url)}`));
    const msg = Number((await rowOf(a.personId)).message_id);
    const outcomes = await Promise.all([receiveTelegramUpdate(text(user, "1", msg)), receiveTelegramUpdate(text(user, "2", msg))]);
    expect(outcomes.filter((o) => o === "test_answered")).toHaveLength(1);
    expect(said().filter((t) => t.startsWith("Telegram works"))).toHaveLength(1);
    const { data: events } = await db().from("installation_audit_events").select("kind").eq("actor_id", a.personId).eq("kind", "setting.test_telegram");
    expect(events).toHaveLength(1);

    const b = await person(false);
    await db().from("installation_admins").insert({ person_id: b.personId, added_by: a.personId });
    const second = await startTelegramTest(b);
    const other = id();
    await receiveTelegramUpdate(text(other, `/start ${codeOf(second.url)}`));
    const msg2 = Number((await rowOf(b.personId)).message_id);
    await db().from("installation_admins").delete().eq("person_id", b.personId);
    expect(await receiveTelegramUpdate(text(other, "3", msg2))).toBe("test_hint");
    expect(await rowOf(b.personId)).toMatchObject({ answered_at: null, chat_id: null });
  });

  it("forgets the chat of a test that ran out: on a late answer, and in the deliveries job", async () => {
    const a = await person();
    const { url } = await startTelegramTest(a);
    const user = id();
    await receiveTelegramUpdate(text(user, `/start ${codeOf(url)}`));
    const msg = Number((await rowOf(a.personId)).message_id);
    const late = new Date(Date.now() - 11 * 60_000).toISOString();
    await db().from("installation_telegram_tests").update({ started_at: late }).eq("person_id", a.personId);
    expect(await receiveTelegramUpdate(text(user, "5", msg))).toBe("test_hint");
    expect(said().at(-1)).toMatch(/has run out/);
    expect((await rowOf(a.personId)).chat_id).toBeNull();

    const again = await startTelegramTest(a);
    await receiveTelegramUpdate(text(id(), `/start ${codeOf(again.url)}`));
    await db().from("installation_telegram_tests").update({ started_at: late }).eq("person_id", a.personId).not("chat_id", "is", null);
    await sendWaitingTelegram();
    expect((await rowOf(a.personId)).chat_id).toBeNull();
  });

  it("allows a few an hour per admin, counted in one locked step, and a new test ends the one before", async () => {
    const a = await person();
    const first = await startTelegramTest(a);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => startTelegramTest(a)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(TELEGRAM_TESTS_PER_HOUR - 1);
    await expect(startTelegramTest(a)).rejects.toThrow(/At most 5 Telegram tests an hour/);
    expect(await receiveTelegramUpdate(text(id(), `/start ${codeOf(first.url)}`))).toBe("test_refused");
  });
});
