// Confirming a Contact's Telegram connection (spec 0016; GLOSSARY: Contact, Connector, Delivery). A Contact has no
// sign-in, so what is started on their personal form page takes effect only once they confirm it from their mailbox:
// when the Telegram account taps Start, nothing is connected yet, and Ziffr emails the address the Workspace keeps for
// the Contact a link for that Contact and that chat. Opening it only shows what confirming would do; the page's button
// confirms, once, within TELEGRAM_CONFIRM_MINUTES. Until then Ziffr sends nothing to that chat as the Contact and takes
// nothing from it as theirs.
// Security: the link carries the chat, the account's name as it may be shown, a mark of the address and 32 random bytes.
// The table (telegram_link_codes, which also holds the one-time codes) keeps only the hash of the whole token, so no
// part of it can be changed and the table holds no usable link. One thing waits per person: a newer code or a newer
// request ends the last. The emails per person are limited in the database.
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { deliverNotice } from "./deliveries";
import { addressIn, headerSafe, mailOn } from "./mail";
import { openNames } from "./sealed-columns";
import { callTelegram } from "./telegram-api";
import { telegramOnIn } from "./telegram-connection";
import { trialHoldsBack } from "./trials";

/** How long the confirmation link in the email works. */
export const TELEGRAM_CONFIRM_MINUTES = 30;
/** Confirmation emails one Contact gets in an hour at most, however often their form asks. */
export const TELEGRAM_CONFIRMS_PER_HOUR = 3;
/** Confirmation emails one Contact gets in 24 hours at most. */
export const TELEGRAM_CONFIRMS_PER_DAY = 5;

const TOKEN = /^([1-9]\d{0,15})\.([1-9]\d{0,15})\.([A-Za-z0-9_-]{1,400})\.([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** Ties a token to the address it was emailed to, without putting the address in it. */
const addressMark = (secret: string, address: string) => sha(`${secret}\n${address.toLowerCase()}`).slice(0, 32);
/** The four digits shown both in the Telegram chat and in the email, so the Contact sees that the two belong together. */
const checkNumber = (secret: string) => String(parseInt(sha(`telegram check\n${secret}`).slice(0, 8), 16) % 10_000).padStart(4, "0");

/** A Telegram account's name as it may stand in an email and on a page. Whoever holds the account chose it, so only
 * letters, digits, spaces, apostrophes and hyphens of the display name are kept (no address or link survives), cut
 * short; the @username has a fixed shape. */
function accountLabel(from: unknown): string {
  const f = (from && typeof from === "object" ? from : {}) as { first_name?: unknown; last_name?: unknown; username?: unknown };
  const shown = [f.first_name, f.last_name].filter((v): v is string => typeof v === "string").join(" ")
    .replace(/[^\p{L}\p{M}\p{N} '’-]+/gu, " ").replace(/\s+/g, " ").trim();
  const name = Array.from(shown).slice(0, 40).join("").trim();
  const user = typeof f.username === "string" && /^[A-Za-z0-9_]{3,32}$/.test(f.username) ? `@${f.username}` : "";
  return name && user ? `“${name}” (${user})` : user || (name ? `“${name}”` : "an account without a name");
}

/** Tells a chat something about its connection; a lost notice is not worth failing for. */
export async function tellChat(chatId: number, text: string): Promise<void> {
  try {
    await callTelegram("sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true } });
  } catch {
    // The connection changed, or did not, all the same.
  }
}

/** The address a Contact's confirmation goes to, or why a personal form cannot start a connection, in words for the
 * Contact that say who can help. Whatever keeps the email from really leaving counts: no confirmation, no connection. */
export async function confirmationAddress(workspaceId: string, personId: string): Promise<{ address: string } | { help: string }> {
  const cannot = "Telegram cannot be connected from this page";
  if (!(await mailOn())) return { help: `${cannot}: Ziffr cannot send the email that confirms it. Whoever runs this Ziffr can set up email.` };
  // A trial sends nothing to a Contact (ADR 0015).
  if (await trialHoldsBack(workspaceId, personId)) return { help: `${cannot}: this trial workspace sends nothing to Contacts.` };
  const address = await addressIn(workspaceId, personId);
  return address ? { address } : { help: `${cannot}: Ziffr has no email address for you to confirm it with. Ask an Owner or Admin of the workspace, or the person who asks you for these numbers, for help.` };
}

/** What a Contact's Start led to: an email to confirm with, or why none was sent. Nothing is connected by any of them. */
export type TelegramConfirmRequest =
  | { linked: false; why: "confirm"; workspace: string; check: string; minutes: number }
  | { linked: false; why: "no_email" | "limited" | "connected" | "gone" };

async function isContact(workspaceId: string, personId: string): Promise<boolean> {
  const { data } = await db().from("contacts").select("person_id").eq("workspace_id", workspaceId).eq("person_id", personId).maybeSingle();
  return Boolean(data);
}

async function isConnected(workspaceId: string, personId: string): Promise<boolean> {
  const { data } = await db().from("telegram_links").select("person_id").eq("workspace_id", workspaceId).eq("person_id", personId).maybeSingle();
  return Boolean(data);
}

async function workspaceName(workspaceId: string): Promise<string> {
  const { data } = await db().from("workspaces").select("name").eq("id", workspaceId).maybeSingle();
  return String(data?.name ?? "Ziffr");
}

/** Emails a Contact the link that confirms connecting this Telegram chat to them. The caller has taken a one-time code
 * made for that Contact, sent from the chat; this connects nothing. */
export async function askContactToConfirm(workspaceId: string, personId: string, chat: { userId: number; chatId: number; from: unknown }): Promise<TelegramConfirmRequest> {
  // A personal form never replaces a Telegram already connected.
  if (await isConnected(workspaceId, personId)) return { linked: false, why: "connected" };
  const to = await confirmationAddress(workspaceId, personId);
  if ("help" in to) return { linked: false, why: "no_email" };
  // The emails are limited, counted under a lock in the database (the counter of messages a person asks for themself,
  // which a Contact, who never signs in, uses for nothing else), so the form cannot fill the Contact's inbox. A count
  // that cannot be read sends nothing.
  const { data: claim, error } = await db().rpc("claim_test_message", {
    p_workspace: workspaceId, p_person: personId, p_way: "telegram",
    p_per_window: TELEGRAM_CONFIRMS_PER_HOUR, p_window_minutes: 60, p_per_day: TELEGRAM_CONFIRMS_PER_DAY,
  });
  if (error || claim !== "ok") return { linked: false, why: "limited" };
  const secret = randomBytes(32).toString("base64url");
  const account = accountLabel(chat.from);
  const token = [chat.userId, chat.chatId, Buffer.from(account, "utf8").toString("base64url"), addressMark(secret, to.address), secret].join(".");
  const { error: kept } = await db().from("telegram_link_codes").upsert({ code_hash: sha(token), workspace_id: workspaceId, person_id: personId, created_at: new Date().toISOString() }, { onConflict: "workspace_id,person_id" });
  if (kept) return { linked: false, why: "gone" };
  const workspace = await workspaceName(workspaceId);
  const check = checkNumber(secret);
  try {
    // To the address on file (mail.ts reads it when sending). No sender: only the Contact is shown this Delivery.
    await deliverNotice(workspaceId, {
      recipientId: personId, senderId: null, via: "email", subject: "Confirm Telegram for Ziffr",
      text: [
        `A Telegram account asks to be connected to you in the workspace “${headerSafe(workspace)}” on Ziffr, started from your personal form link.`,
        `Telegram account: ${account}\nNumber shown in that Telegram chat: ${check}`,
        "If you confirm, Ziffr sends that account your messages from this workspace, about every number you are asked for: requests, reminders, questions and replies, which can quote values. Answers from it count as yours.",
        `Confirm only if you started this yourself and your Telegram shows ${check}: open the link and press Confirm within ${TELEGRAM_CONFIRM_MINUTES} minutes. Otherwise ignore this email. Nothing is connected without your confirmation.`,
      ].join("\n\n"),
      link: `/api/confirm-telegram/${token}`,
    });
  } catch {
    await db().from("telegram_link_codes").delete().eq("code_hash", sha(token));
    return { linked: false, why: "no_email" };
  }
  return { linked: false, why: "confirm", workspace, check, minutes: TELEGRAM_CONFIRM_MINUTES };
}

/** Whether the account sent /stop, or blocked the bot, after the last Start it sent for a confirmation. */
async function stoppedSince(userId: number): Promise<boolean> {
  const { data, error } = await db().from("telegram_updates").select("outcome").eq("telegram_user_id", userId).in("outcome", ["confirm_sent", "unlinked", "blocked"]).order("received_at", { ascending: false }).limit(1);
  // Fails closed: what cannot be read connects nothing.
  return Boolean(error) || (data?.[0] !== undefined && data[0].outcome !== "confirm_sent");
}

/** The request a token names, while it may still be confirmed: known, unexpired, unused, for a Contact who is not
 * connected yet, where Telegram is on, still going to the same address on file, from a chat that has not said /stop
 * since. Null in every other case, so the answer never says which. */
async function find(token: unknown) {
  const m = typeof token === "string" ? TOKEN.exec(token) : null;
  if (!m) return null;
  const [whole, user, chat, account, mark, secret] = m;
  const since = new Date(Date.now() - TELEGRAM_CONFIRM_MINUTES * 60_000).toISOString();
  const { data: row } = await db().from("telegram_link_codes").select("workspace_id, person_id").eq("code_hash", sha(whole)).gt("created_at", since).maybeSingle();
  if (!row) return null;
  const workspaceId = row.workspace_id as string;
  const personId = row.person_id as string;
  if (!(await isContact(workspaceId, personId)) || !(await telegramOnIn(workspaceId)) || (await isConnected(workspaceId, personId))) return null;
  const to = await confirmationAddress(workspaceId, personId);
  if ("help" in to || addressMark(secret, to.address) !== mark) return null;
  const userId = Number(user);
  if (await stoppedSince(userId)) return null;
  return { hash: sha(whole), workspaceId, personId, userId, chatId: Number(chat), account: Buffer.from(account, "base64url").toString("utf8"), check: checkNumber(secret) };
}

/** What the confirm page shows: the Workspace, the Telegram account and the number its chat shows. Changes nothing.
 * Null when the link does not work, whatever the reason. Carries only what the holder of the link was emailed. */
export async function telegramConfirmView(token: string): Promise<{ workspace: string; account: string; check: string } | null> {
  const f = await find(token);
  return f ? { workspace: await workspaceName(f.workspaceId), account: f.account, check: f.check } : null;
}

/** Connects the chat a token names to its Contact, once, and tells both the chat and the Contact's address on file.
 * Whoever was that Telegram account in the Workspace before is not any more: the account that proved itself wins. Null
 * when the link does not work. */
export async function confirmTelegram(token: string): Promise<{ workspace: string } | null> {
  const f = await find(token);
  if (!f) return null;
  // Claimed first (deleted, so a second press finds nothing).
  const { data: claimed } = await db().from("telegram_link_codes").delete().eq("code_hash", f.hash).select("person_id");
  if (!claimed?.length) return null;
  await db().from("telegram_links").delete().eq("workspace_id", f.workspaceId).eq("telegram_user_id", f.userId).neq("person_id", f.personId);
  // Inserted, never written over: a connection made meanwhile stays.
  const { error } = await db().from("telegram_links").insert({ workspace_id: f.workspaceId, person_id: f.personId, telegram_user_id: f.userId, chat_id: f.chatId, linked_at: new Date().toISOString() });
  if (error) return null;
  const workspace = await workspaceName(f.workspaceId);
  const { data: profile } = await db().from("profiles").select("id, name").eq("id", f.personId).maybeSingle();
  const person = profile ? (await openNames(f.workspaceId, [profile]))[0]?.name : null;
  await tellChat(f.chatId, `Connected as ${person ?? "you"} in ${workspace}: you get their Ziffr messages here. If that is not you, send /stop. To answer a message, reply to it.`);
  try {
    await deliverNotice(f.workspaceId, {
      recipientId: f.personId, senderId: null, via: "email", subject: "Telegram is connected to Ziffr",
      text: [
        `Telegram is now connected to you in the workspace “${headerSafe(workspace)}” on Ziffr.\nTelegram account: ${f.account}`,
        "From now on, Ziffr can send that account your messages from this workspace, and answers from it count as yours.",
        "To stop it, send /stop to the Ziffr bot from that account. If you did not confirm this, tell an Owner or Admin of the workspace at once.",
      ].join("\n\n"),
      link: null,
    });
  } catch {
    // Connected all the same: the chat was told, and the Contact confirmed it themself.
  }
  return { workspace };
}
