// Confirming a Contact's Telegram connection (spec 0016; GLOSSARY: Contact, Connector, Delivery). A Contact has no
// sign-in, so what is started on their personal form page takes effect only once they confirm it from their mailbox:
// when the Telegram account taps Start, nothing is connected yet, and Ziffr emails the address the Workspace keeps for
// the Contact a link for that Contact and that chat, and the bot tells the chat four digits that are nowhere else.
// Opening the link only shows what confirming would do; typing those digits and pressing the page's button confirms,
// once, within TELEGRAM_CONFIRM_MINUTES. So whoever confirms holds both the mailbox and that chat. Until then Ziffr
// sends nothing to the chat as the Contact and takes nothing from it as theirs.
// Security: the link carries the chat, the account's name as it may be shown, a mark of the address, a mark of the
// digits and 32 random bytes. The mark of the digits is keyed with this Installation's secrets key, so the link does
// not give them away, not even by trying all ten thousand. The table (telegram_link_codes, which also holds the
// one-time codes) keeps only a hash of the whole token, so no part of it can be changed and the table holds no usable
// link; the hash also says how many tries were spent. TELEGRAM_CONFIRM_TRIES wrong numbers end the request. One thing
// waits per person: a newer code or a newer request ends the last. The emails per person are limited in the database.
import { createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { telegramAccountName } from "./connection-notice-words";
import { tellDisconnected } from "./connection-notices";
import { db } from "./db";
import { deliverEmailNotice, deliverNotice } from "./deliveries";
import { addressIn, headerSafe, mailOn } from "./mail";
import { openNames } from "./sealed-columns";
import { secretsKey } from "./secrets";
import { settingsInEffect } from "./settings-in-effect";
import { callTelegram } from "./telegram-api";
import { telegramOnIn } from "./telegram-connection";
import { trialHoldsBack } from "./trials";

/** How long the confirmation link in the email works. */
export const TELEGRAM_CONFIRM_MINUTES = 30;
/** Confirmation emails one Contact gets in an hour at most, however often their form asks. */
export const TELEGRAM_CONFIRMS_PER_HOUR = 3;
/** Confirmation emails one Contact gets in 24 hours at most. */
export const TELEGRAM_CONFIRMS_PER_DAY = 5;
/** Numbers that may be typed for one request: when the last of them is wrong too, the request ends. */
export const TELEGRAM_CONFIRM_TRIES = 3;

const TOKEN = /^([1-9]\d{0,15})\.([1-9]\d{0,15})\.([A-Za-z0-9_-]{1,400})\.([0-9a-f]{32})\.([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** Ties a token to the address it was emailed to, without putting the address in it. */
const addressMark = (secret: string, address: string) => sha(`${secret}\n${address.toLowerCase()}`).slice(0, 32);
/** The hash a waiting request is stored under after this many tries. */
const hashAfter = (token: string, tries: number) => sha(tries ? `${token}\n${tries}` : token);

/** What a token keeps of the digits its chat was told: keyed with the secrets key, so only this Installation can check a
 * number against it. Null without that key (Telegram is off then). */
async function numberMark(secret: string, digits: string): Promise<string | null> {
  const root = secretsKey(await settingsInEffect());
  if (!root) return null;
  const key = Buffer.from(hkdfSync("sha256", root, "", "ziffr telegram confirm number", 32));
  return createHmac("sha256", key).update(`${secret}\n${digits}`).digest("hex").slice(0, 32);
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

/** What a Contact's Start led to: an email to confirm with (`sent` says whether it has left; else it is tried again)
 * and the digits only that chat is told, or why there is none. Nothing is connected by any of them. */
export type TelegramConfirmRequest =
  | { linked: false; why: "confirm"; workspace: string; check: string; minutes: number; sent: boolean }
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
  const check = String(randomInt(10_000)).padStart(4, "0");
  const digits = await numberMark(secret, check);
  if (!digits) return { linked: false, why: "gone" };
  const account = telegramAccountName(chat.from);
  const token = [chat.userId, chat.chatId, Buffer.from(account, "utf8").toString("base64url"), addressMark(secret, to.address), digits, secret].join(".");
  const { error: kept } = await db().from("telegram_link_codes").upsert({ code_hash: hashAfter(token, 0), workspace_id: workspaceId, person_id: personId, created_at: new Date().toISOString() }, { onConflict: "workspace_id,person_id" });
  if (kept) return { linked: false, why: "gone" };
  const workspace = await workspaceName(workspaceId);
  let state: unknown = null;
  try {
    // To the address on file (mail.ts reads it when sending). No sender: only the Contact is shown this Delivery.
    const delivery = await deliverEmailNotice(workspaceId, {
      recipientId: personId, subject: "Confirm Telegram for Ziffr",
      text: [
        `A Telegram account asks to be connected to you in the workspace “${headerSafe(workspace)}” on Ziffr, started from your personal form link.`,
        `Telegram account: ${account}`,
        "If you confirm, Ziffr sends that account your messages from this workspace, about every number you are asked for: requests, reminders, questions and replies, which can quote values. Answers from it count as yours.",
        `If you started this yourself, open the link, type the four-digit number the Ziffr bot sent to your own Telegram chat, and press Confirm within ${TELEGRAM_CONFIRM_MINUTES} minutes. Never type a number someone else gave you. Otherwise ignore this email. Nothing is connected without your confirmation.`,
      ].join("\n\n"),
      link: `/api/confirm-telegram/${token}`,
    });
    // What became of it is read back, so the chat is never told of an email that did not leave.
    if (delivery) state = (await db().from("deliveries").select("mail_state").eq("id", delivery).eq("workspace_id", workspaceId).maybeSingle()).data?.mail_state;
  } catch {
    // Nothing left: the request ends below.
  }
  if (state !== "sent" && state !== "sending" && state !== "queued") {
    await db().from("telegram_link_codes").delete().eq("code_hash", hashAfter(token, 0));
    return { linked: false, why: "no_email" };
  }
  return { linked: false, why: "confirm", workspace, check, minutes: TELEGRAM_CONFIRM_MINUTES, sent: state === "sent" };
}

/** Whether the account sent /stop, or blocked the bot, after the last Start it sent for a confirmation. */
async function stoppedSince(userId: number): Promise<boolean> {
  const { data, error } = await db().from("telegram_updates").select("outcome").eq("telegram_user_id", userId).in("outcome", ["confirm_sent", "unlinked", "blocked"]).order("received_at", { ascending: false }).limit(1);
  // Fails closed: what cannot be read connects nothing.
  return Boolean(error) || (data?.[0] !== undefined && data[0].outcome !== "confirm_sent");
}

/** The request a token names, while it may still be confirmed: known, unexpired, unused, with a try left, for a Contact
 * who is not connected yet, where Telegram is on, still going to the same address on file, from a chat that has not said
 * /stop since. Null in every other case, so the answer never says which. */
async function find(token: unknown) {
  const m = typeof token === "string" ? TOKEN.exec(token) : null;
  if (!m) return null;
  const [whole, user, chat, account, mark, digits, secret] = m;
  const since = new Date(Date.now() - TELEGRAM_CONFIRM_MINUTES * 60_000).toISOString();
  const hashes = Array.from({ length: TELEGRAM_CONFIRM_TRIES }, (_, n) => hashAfter(whole, n));
  const { data: row } = await db().from("telegram_link_codes").select("code_hash, workspace_id, person_id").in("code_hash", hashes).gt("created_at", since).maybeSingle();
  if (!row) return null;
  const workspaceId = row.workspace_id as string;
  const personId = row.person_id as string;
  if (!(await isContact(workspaceId, personId)) || !(await telegramOnIn(workspaceId)) || (await isConnected(workspaceId, personId))) return null;
  const to = await confirmationAddress(workspaceId, personId);
  if ("help" in to || addressMark(secret, to.address) !== mark) return null;
  const userId = Number(user);
  if (await stoppedSince(userId)) return null;
  return { whole, secret, digits, tries: hashes.indexOf(String(row.code_hash)), workspaceId, personId, userId, chatId: Number(chat), account: Buffer.from(account, "base64url").toString("utf8") };
}

/** What the confirm page shows: the Workspace, the Telegram account and how many tries are left; never the digits.
 * Changes nothing. Null when the link does not work, whatever the reason. Carries only what the holder of the link was
 * emailed. */
export async function telegramConfirmView(token: string): Promise<{ workspace: string; account: string; triesLeft: number } | null> {
  const f = await find(token);
  return f ? { workspace: await workspaceName(f.workspaceId), account: f.account, triesLeft: TELEGRAM_CONFIRM_TRIES - f.tries } : null;
}

/** What a typed number led to: connected, or not, with the tries left (none: the request has ended). */
export type TelegramConfirmation = { connected: true; workspace: string } | { connected: false; triesLeft: number };

/** Connects the chat a token names to its Contact when the number typed is the one that chat was told, once, and tells
 * both the chat and the Contact's address on file. Whoever was that Telegram account in the Workspace before is not any
 * more: the account that proved itself wins. Anything that is not four digits costs no try. Null when the link does not
 * work. */
export async function confirmTelegram(token: string, number: unknown): Promise<TelegramConfirmation | null> {
  const f = await find(token);
  if (!f) return null;
  const typed = typeof number === "string" ? number.replace(/\s/g, "") : "";
  if (!/^\d{4}$/.test(typed)) return { connected: false, triesLeft: TELEGRAM_CONFIRM_TRIES - f.tries };
  // The try is spent before the number is looked at, in one statement, so numbers sent at once spend one each. The last
  // try removes the request.
  const spent = f.tries + 1;
  const last = spent >= TELEGRAM_CONFIRM_TRIES;
  const waiting = db().from("telegram_link_codes");
  const { data: took } = await (last ? waiting.delete() : waiting.update({ code_hash: hashAfter(f.whole, spent) })).eq("code_hash", hashAfter(f.whole, f.tries)).select("person_id");
  if (!took?.length) return null;
  const given = Buffer.from((await numberMark(f.secret, typed)) ?? "");
  const wanted = Buffer.from(f.digits);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return { connected: false, triesLeft: TELEGRAM_CONFIRM_TRIES - spent };
  // Claimed (deleted, so a second press finds nothing).
  if (!last) {
    const { data: claimed } = await db().from("telegram_link_codes").delete().eq("code_hash", hashAfter(f.whole, spent)).select("person_id");
    if (!claimed?.length) return null;
  }
  if (!(await connect(f))) return null;
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
  return { connected: true, workspace };
}

/** Writes the connection; false when it could not be made, and then nothing else changed. It never writes over one the
 * Contact got meanwhile. Written first: where the account is someone else's in this Workspace (one account is one person
 * there), that row then becomes this one in a single statement, so nobody loses a connection unless this one is made. */
async function connect(to: { workspaceId: string; personId: string; userId: number; chatId: number }): Promise<boolean> {
  const row = { workspace_id: to.workspaceId, person_id: to.personId, telegram_user_id: to.userId, chat_id: to.chatId, linked_at: new Date().toISOString() };
  const { error } = await db().from("telegram_links").insert(row);
  if (error?.code !== "23505") return !error;
  const { data: held } = await db().from("telegram_links").select("person_id").eq("workspace_id", to.workspaceId).eq("telegram_user_id", to.userId).neq("person_id", to.personId).maybeSingle();
  const moved = await db().from("telegram_links").update(row).eq("workspace_id", to.workspaceId).eq("telegram_user_id", to.userId).neq("person_id", to.personId).select("person_id");
  if (moved.error || !moved.data?.length) return false;
  // Whoever held the account is told by email that it is not theirs any more.
  if (held) await tellDisconnected({ workspaceId: to.workspaceId, personId: held.person_id as string, service: "telegram" });
  return true;
}
