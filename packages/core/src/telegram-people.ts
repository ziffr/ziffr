// Who people are on Telegram (spec 0016, ticket #25; GLOSSARY: Connector, Contact, Workspace). A bot can neither write
// to anyone first nor look anyone up, so every member or Contact links themselves: Ziffr makes a one-time code, the
// person opens the bot with it (https://t.me/<bot>?start=<code>) and taps Start, and Telegram's update, which only
// Telegram can send to the webhook, names their account and private chat. Only the person who saw the code (signed in,
// or holding their own form link) and only the account that tapped Start take part, so the link proves both ends.
import { createHash, randomBytes } from "node:crypto";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { callTelegram } from "./telegram-api";
import { submissionForm } from "./page-data";
import { telegramBot, telegramOnIn } from "./telegram-connection";
import { DEMO_WORKSPACE_ID } from "./team";

/** How long a link code works. */
export const TELEGRAM_CODE_MINUTES = 10;

/** A Telegram user or chat id as Telegram sends it: a positive integer (a private chat's id is its user's). */
export const isTelegramId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

const hashOf = (code: string) => createHash("sha256").update(code).digest("hex");

/** A person (member or Contact) of a workspace: only they can be linked or reached there. */
async function belongs(workspaceId: string, personId: string): Promise<boolean> {
  const [{ data: m }, { data: c }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", workspaceId).eq("user_id", personId).maybeSingle(),
    db().from("contacts").select("person_id").eq("workspace_id", workspaceId).eq("person_id", personId).maybeSingle(),
  ]);
  return Boolean(m || c);
}

/** The Contact whose personal form link this is, while it works (stand-ins only while they are one), and their
 * workspace; null for anyone else. A form link opens without signing in and travels in emails, so it may do no more
 * for Telegram than for values: a member connects signed in, on the Connectors page, where their Approvals and
 * questions are theirs to receive. */
async function formContact(formCode: string): Promise<{ workspaceId: string; personId: string } | null> {
  if (!(await submissionForm(formCode))) return null;
  const { data } = await db().from("tokens").select("workspace_id, submitter_id").eq("code", formCode).maybeSingle();
  if (!data) return null;
  const { data: c } = await db().from("contacts").select("person_id").eq("workspace_id", data.workspace_id).eq("person_id", data.submitter_id).maybeSingle();
  return c ? { workspaceId: data.workspace_id as string, personId: data.submitter_id as string } : null;
}

/** Tells a chat that it no longer gets a workspace's messages; a lost notice is not worth failing for. */
async function tellChat(chatId: number, text: string): Promise<void> {
  try {
    await callTelegram("sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true } });
  } catch {
    // The link changed all the same.
  }
}

/** Makes a person's one-time code and the link that opens the bot with it. 32 random bytes in base64url: 43
 * characters, inside Telegram's 64 from A-Z a-z 0-9 _ -; only its hash is kept. A new code ends the last. */
async function codeFor(workspaceId: string, personId: string): Promise<{ url: string; minutes: number }> {
  if (workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo does not use Telegram.");
  if (!(await telegramOnIn(workspaceId))) throw new Error("Telegram is not on in this workspace.");
  const bot = await telegramBot();
  if (!bot) throw new Error("Telegram does not answer right now. Try again in a moment.");
  const code = randomBytes(32).toString("base64url");
  // An abandoned code leaves nothing usable behind for long.
  await db().from("telegram_link_codes").delete().lt("created_at", new Date(Date.now() - TELEGRAM_CODE_MINUTES * 60_000).toISOString());
  const { error } = await db().from("telegram_link_codes").upsert({ code_hash: hashOf(code), workspace_id: workspaceId, person_id: personId, created_at: new Date().toISOString() }, { onConflict: "workspace_id,person_id" });
  if (error) throw new Error("The link could not be made.");
  return { url: `https://t.me/${bot.username}?start=${code}`, minutes: TELEGRAM_CODE_MINUTES };
}

/** "Connect Telegram" for a signed-in member, in their workspace. */
export async function startTelegramLink(actor: Actor): Promise<{ url: string; minutes: number }> {
  return codeFor(actor.workspaceId, actor.personId);
}

/** "Connect Telegram" on a Contact's personal form page, in the Metric's workspace. It never replaces a Telegram the
 * Contact already connected: whoever holds the form link must disconnect that first, which tells its chat. */
export async function startTelegramLinkByForm(formCode: string): Promise<{ url: string; minutes: number }> {
  const owner = await formContact(formCode);
  if (!owner) throw new Forbidden("Connect Telegram signed in, on the Connectors page.");
  const { data: linked } = await db().from("telegram_links").select("person_id").eq("workspace_id", owner.workspaceId).eq("person_id", owner.personId).maybeSingle();
  if (linked) throw new Error("Your Telegram is connected already. To use another one, disconnect first.");
  return codeFor(owner.workspaceId, owner.personId);
}

/** What became of a /start: linked (with the workspace's name for the bot to say), or why not. */
export type TelegramLinkOutcome = { linked: true; workspace: string } | { linked: false; why: "unknown_code" | "expired" | "not_private" | "gone" };

/** Links the Telegram account that sent `/start <code>` in a private chat to the person who made the code, once,
 * within ten minutes, if they still belong to its workspace. Whoever was that account in the workspace before is
 * not any more: the account that proved the code wins. */
export async function linkTelegramByCode(input: { code: string; userId: unknown; chatId: unknown; chatType: unknown }): Promise<TelegramLinkOutcome> {
  if (input.chatType !== "private") return { linked: false, why: "not_private" };
  if (!isTelegramId(input.userId) || !isTelegramId(input.chatId) || !/^[A-Za-z0-9_-]{43}$/.test(String(input.code))) return { linked: false, why: "unknown_code" };
  // Taken and removed in one step: a code works once.
  const { data: taken } = await db().from("telegram_link_codes").delete().eq("code_hash", hashOf(String(input.code))).select("workspace_id, person_id, created_at");
  const c = taken?.[0];
  if (!c) return { linked: false, why: "unknown_code" };
  if (Date.now() - new Date(c.created_at).getTime() > TELEGRAM_CODE_MINUTES * 60_000) return { linked: false, why: "expired" };
  if (!(await belongs(c.workspace_id, c.person_id)) || !(await telegramOnIn(c.workspace_id))) return { linked: false, why: "gone" };
  await db().from("telegram_links").delete().eq("workspace_id", c.workspace_id).eq("telegram_user_id", input.userId).neq("person_id", c.person_id);
  // The person's Telegram so far, if another account: it is told, so nobody loses their messages without knowing.
  const { data: before } = await db().from("telegram_links").select("chat_id, telegram_user_id").eq("workspace_id", c.workspace_id).eq("person_id", c.person_id).maybeSingle();
  const { error } = await db().from("telegram_links").upsert(
    { workspace_id: c.workspace_id, person_id: c.person_id, telegram_user_id: input.userId, chat_id: input.chatId, linked_at: new Date().toISOString() },
    { onConflict: "workspace_id,person_id" },
  );
  if (error) return { linked: false, why: "gone" };
  const { data: w } = await db().from("workspaces").select("name").eq("id", c.workspace_id).maybeSingle();
  const name = w?.name ?? "Ziffr";
  if (before && Number(before.telegram_user_id) !== input.userId) await tellChat(Number(before.chat_id), `Ziffr messages for ${name} now go to another Telegram account. If that was not you, tell an Owner of the workspace.`);
  return { linked: true, workspace: name };
}

/** Forgets a Telegram account everywhere: it sent /stop, or blocked the bot. Returns how many links ended. */
export async function forgetTelegramUser(userId: unknown): Promise<number> {
  if (!isTelegramId(userId)) return 0;
  const { data } = await db().from("telegram_links").delete().eq("telegram_user_id", userId).select("person_id");
  return data?.length ?? 0;
}

/** Whether the actor is linked to Telegram in their workspace, and since when. */
export async function myTelegramLink(actor: Actor): Promise<{ linkedAt: string } | null> {
  const { data } = await db().from("telegram_links").select("linked_at").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  return data ? { linkedAt: data.linked_at as string } : null;
}

/** Whether the Contact whose form this is is linked to Telegram in its workspace; null for a link that does not work
 * or is not a Contact's (the form then offers nothing about Telegram). */
export async function formTelegramLink(formCode: string): Promise<{ linked: boolean; telegramOn: boolean } | null> {
  const owner = await formContact(formCode);
  if (!owner) return null;
  const [{ data }, telegramOn] = await Promise.all([
    db().from("telegram_links").select("person_id").eq("workspace_id", owner.workspaceId).eq("person_id", owner.personId).maybeSingle(),
    telegramOnIn(owner.workspaceId),
  ]);
  return { linked: Boolean(data), telegramOn };
}

/** Forgets the actor's Telegram link in their workspace. */
export async function unlinkTelegram(actor: Actor): Promise<void> {
  await db().from("telegram_links").delete().eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId);
}

/** Forgets the Telegram link of the Contact whose form this is, in its workspace, and tells the chat it was. */
export async function unlinkTelegramByForm(formCode: string): Promise<void> {
  const owner = await formContact(formCode);
  if (!owner) throw new Forbidden("This form link does not work any more.");
  const { data: gone } = await db().from("telegram_links").delete().eq("workspace_id", owner.workspaceId).eq("person_id", owner.personId).select("chat_id");
  if (gone?.[0]) await tellChat(Number(gone[0].chat_id), "Disconnected from Ziffr on your personal form: you get no more Ziffr messages here for that workspace.");
}

/** The private chat a Delivery to this person goes to in a workspace, or null when they are not linked there. */
export async function telegramChatOf(workspaceId: string, personId: string): Promise<{ chatId: number; userId: number } | null> {
  const { data } = await db().from("telegram_links").select("chat_id, telegram_user_id").eq("workspace_id", workspaceId).eq("person_id", personId).maybeSingle();
  return data ? { chatId: Number(data.chat_id), userId: Number(data.telegram_user_id) } : null;
}

/** The person a Telegram account is in a workspace, as linked: for answers that come in by Telegram. */
export async function personOfTelegramUser(workspaceId: string, userId: unknown): Promise<string | null> {
  if (!isTelegramId(userId)) return null;
  const { data } = await db().from("telegram_links").select("person_id").eq("workspace_id", workspaceId).eq("telegram_user_id", userId).maybeSingle();
  return data?.person_id ?? null;
}
