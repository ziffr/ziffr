// The Telegram round trip test on the Installation Settings page (spec 0025; GLOSSARY: Installation Settings,
// Installation Admin), like the test email for Mail. The admin opens the bot with a one-time code (Start); the bot
// sends a test message, which proves Ziffr reaches Telegram; the admin replies with a number, which proves Telegram
// reaches Ziffr through the webhook. It connects nobody to any Workspace and changes nobody's Deliveries: test codes
// have a shape of their own (`zt_` and 43 characters) that the Workspace connect codes (43 characters) never have,
// and they live in a table of their own, so neither kind is ever taken for the other.
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { assertInstallationAdmin, isInstallationAdmin, recordInstallationEvent, type InstallationActor } from "./installation-admins";
import { callTelegram, telegramOn } from "./telegram-api";
import { telegramBot } from "./telegram-connection";

/** Tests one Installation Admin may start in an hour. */
export const TELEGRAM_TESTS_PER_HOUR = 5;
/** How long a test's link works, and how long a started test waits for its answer. */
export const TELEGRAM_TEST_MINUTES = 10;

/** What the page shows of the latest test: where it stands, and when it was made or finished. */
export type TelegramTestStatus = {
  state: "none" | "waiting_start" | "sent" | "send_failed" | "done" | "expired";
  at: string | null;
};

const TEST_CODE = /^zt_[A-Za-z0-9_-]{43}$/;

/** Whether a /start payload is a test code (and so never a Workspace connect code). */
export const isTelegramTestCode = (code: string) => TEST_CODE.test(code);

const hashOf = (code: string) => createHash("sha256").update(code).digest("hex");
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

/** Starts a test for an Installation Admin: a one-time code in a link that opens the bot. At most
 * TELEGRAM_TESTS_PER_HOUR an hour; a new test ends the ones before it. Only the code's hash is stored. */
export async function startTelegramTest(actor: InstallationActor): Promise<{ url: string }> {
  await assertInstallationAdmin(actor);
  if (!(await telegramOn())) throw new Error("Save a bot token first.");
  const bot = await telegramBot();
  if (!bot) throw new Error("Telegram does not accept the bot token, or cannot be reached. Try Check Telegram.");
  const code = `zt_${randomBytes(32).toString("base64url")}`;
  const { data, error } = await db().rpc("make_installation_telegram_test", { p_person: actor.personId, p_code_hash: hashOf(code), p_limit: TELEGRAM_TESTS_PER_HOUR });
  // Any failure to count is a refusal.
  if (error || data !== true) throw new Error(`At most ${TELEGRAM_TESTS_PER_HOUR} Telegram tests an hour. Try again later.`);
  return { url: `https://t.me/${bot.username}?start=${code}` };
}

/** Forgets the chat of every test that has run out unanswered (it is kept only while a test waits), and deletes
 * tests older than a day. Run by the deliveries job, on every test step and when the page asks. */
export async function forgetStaleTelegramTests(): Promise<void> {
  await db().from("installation_telegram_tests").update({ chat_id: null, telegram_user_id: null, message_id: null })
    .not("chat_id", "is", null).lt("started_at", minutesAgo(TELEGRAM_TEST_MINUTES));
  await db().from("installation_telegram_tests").delete().lt("created_at", minutesAgo(24 * 60));
}

/** Where the actor's latest test stands, for the page while it waits. Installation Admins only. */
export async function telegramTestStatus(actor: InstallationActor): Promise<TelegramTestStatus> {
  await assertInstallationAdmin(actor);
  await forgetStaleTelegramTests();
  const { data: t } = await db().from("installation_telegram_tests").select("created_at, started_at, sent_at, answered_at, code_hash")
    .eq("person_id", actor.personId).order("id", { ascending: false }).limit(1).maybeSingle();
  if (!t) return { state: "none", at: null };
  if (t.answered_at) return { state: "done", at: t.answered_at as string };
  const waitedFrom = new Date((t.started_at ?? t.created_at) as string).getTime();
  if (Date.now() - waitedFrom > TELEGRAM_TEST_MINUTES * 60_000) return { state: "expired", at: t.created_at as string };
  if (!t.started_at) return { state: t.code_hash ? "waiting_start" : "expired", at: t.created_at as string };
  return { state: t.sent_at ? "sent" : "send_failed", at: t.started_at as string };
}

/** Takes /start with a test code from a private chat: uses the code once, within its ten minutes, while its admin
 * still is one, then sends the test message and keeps the chat until the answer. Says nothing of a code that does
 * not work beyond that it does not. Returns whether the test started. */
export async function takeTelegramTestStart(input: { code: string; userId: number; chatId: number; say: (text: string) => Promise<void> }): Promise<boolean> {
  if (!isTelegramTestCode(input.code)) return false;
  await forgetStaleTelegramTests();
  // Used and taken in one statement: a code works once, also when Telegram delivers /start twice.
  const { data } = await db().from("installation_telegram_tests")
    .update({ code_hash: null, started_at: new Date().toISOString(), chat_id: input.chatId, telegram_user_id: input.userId })
    .eq("code_hash", hashOf(input.code)).is("started_at", null).gt("created_at", minutesAgo(TELEGRAM_TEST_MINUTES))
    .select("id, person_id");
  const t = data?.[0];
  if (!t || !(await isInstallationAdmin({ personId: t.person_id as string }))) {
    if (t) await forget(t.id as number);
    await input.say("That test link does not work any more. Start a new test on the Installation settings page.");
    return false;
  }
  const host = (() => { try { return new URL(String(process.env.ZIFFR_SITE_URL)).host; } catch { return "this Ziffr"; } })();
  try {
    const sent = await callTelegram<{ message_id?: number }>("sendMessage", {
      chat_id: input.chatId, text: `Ziffr test from ${host}: reply to this message with any number to finish.`, link_preview_options: { is_disabled: true },
    });
    if (typeof sent?.message_id !== "number") throw new Error("no message id");
    await db().from("installation_telegram_tests").update({ sent_at: new Date().toISOString(), message_id: sent.message_id }).eq("id", t.id);
  } catch {
    // Sending failed: the page says so; the chat is not kept for an answer that cannot come.
    await forget(t.id as number);
    return true;
  }
  return true;
}

/** Takes a reply to the test message: from the same account, in the same chat, within the test's ten minutes. A
 * number finishes the test; anything else asks for one. Returns false when the message is no test's, so the caller
 * goes on as for any reply. */
export async function takeTelegramTestAnswer(input: { userId: number; chatId: number; repliedTo: number; text: string; say: (text: string) => Promise<void> }): Promise<"answered" | "not_a_number" | false> {
  const { data: t } = await db().from("installation_telegram_tests").select("id, person_id, telegram_user_id, started_at")
    .eq("chat_id", input.chatId).eq("message_id", input.repliedTo).is("answered_at", null).maybeSingle();
  if (!t) return false;
  // Someone else replying in this chat (only possible in a group, which Ziffr ignores anyway) is no answer to it.
  if (Number(t.telegram_user_id) !== input.userId) return false;
  if (Date.now() - new Date(t.started_at as string).getTime() > TELEGRAM_TEST_MINUTES * 60_000 || !(await isInstallationAdmin({ personId: t.person_id as string }))) {
    await forget(t.id as number);
    await input.say("This test has run out. Start a new one on the Installation settings page.");
    return "not_a_number";
  }
  if (!/^\s*[-+]?\d+(?:[.,]\d+)?\s*$/.test(input.text)) {
    await input.say("Reply to the test message with any number, such as 1, to finish the test.");
    return "not_a_number";
  }
  // Answered: the chat is forgotten at once; only the times stay. Only the one answer that changed the row counts,
  // so two replies at once finish the test once.
  const { data: done } = await db().from("installation_telegram_tests").update({ answered_at: new Date().toISOString(), chat_id: null, telegram_user_id: null, message_id: null })
    .eq("id", t.id).is("answered_at", null).select("id");
  if (!done?.length) return "not_a_number";
  await input.say("Telegram works: Ziffr sent this and got your answer.");
  await recordInstallationEvent(t.person_id as string, "setting.test_telegram", "ZIFFR_TELEGRAM_BOT_TOKEN");
  return "answered";
}

// Ends a test without its chat.
async function forget(id: number) {
  await db().from("installation_telegram_tests").update({ chat_id: null, telegram_user_id: null, message_id: null }).eq("id", id);
}
