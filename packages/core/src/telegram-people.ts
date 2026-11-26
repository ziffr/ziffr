// Who people are on Telegram (spec 0016, ticket #25; GLOSSARY: Connector, Contact, Workspace). A bot can neither write
// to anyone first nor look anyone up, so every member or Contact links themselves: Ziffr makes a one-time code, the
// person opens the bot with it (https://t.me/<bot>?start=<code>) and taps Start, and Telegram's update, which only
// Telegram can send to the webhook, names their account and private chat. A member makes the code signed in, so the two
// ends are proven at once. A Contact has no sign-in: they make it on their personal form page, and their Start connects
// nothing until they confirm it from their email (telegram-confirm.ts).
import { createHash, randomBytes } from "node:crypto";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { openNames } from "./sealed-columns";
import { submissionForm } from "./page-data";
import { telegramAccountName } from "./connection-notice-words";
import { tellConnected, tellDisconnected } from "./connection-notices";
import { askContactToConfirm, confirmationAddress, TELEGRAM_CONFIRM_MINUTES, tellChat, type TelegramConfirmRequest } from "./telegram-confirm";
import { telegramBot, telegramOnIn } from "./telegram-connection";
import { refuseInDemo } from "./demo";

/** How long a link code works. */
export const TELEGRAM_CODE_MINUTES = 10;

/** A Telegram user or chat id as Telegram sends it: a positive integer (a private chat's id is its user's). */
export const isTelegramId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

const hashOf = (code: string) => createHash("sha256").update(code).digest("hex");

/** What a person is in a workspace (a Contact before a member), or null: only they can be linked or reached there. */
async function belongs(workspaceId: string, personId: string): Promise<"contact" | "member" | null> {
  const [{ data: m }, { data: c }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", workspaceId).eq("user_id", personId).maybeSingle(),
    db().from("contacts").select("person_id").eq("workspace_id", workspaceId).eq("person_id", personId).maybeSingle(),
  ]);
  return c ? "contact" : m ? "member" : null;
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

/** Makes a person's one-time code and the link that opens the bot with it. 32 random bytes in base64url: 43
 * characters, inside Telegram's 64 from A-Z a-z 0-9 _ -; only its hash is kept. A new code ends the last. */
async function codeFor(workspaceId: string, personId: string): Promise<{ url: string; minutes: number }> {
  // Before Telegram is called: the demo never reaches anyone on Telegram.
  refuseInDemo({ workspaceId });
  if (!(await telegramOnIn(workspaceId))) throw new Error("Telegram is not on in this workspace.");
  const bot = await telegramBot();
  if (!bot) throw new Error("Telegram does not answer right now. Try again in a moment.");
  const code = randomBytes(32).toString("base64url");
  // An abandoned code or confirmation leaves nothing behind for long (the table holds both).
  const keep = Math.max(TELEGRAM_CODE_MINUTES, TELEGRAM_CONFIRM_MINUTES);
  await db().from("telegram_link_codes").delete().lt("created_at", new Date(Date.now() - keep * 60_000).toISOString());
  const { error } = await db().from("telegram_link_codes").upsert({ code_hash: hashOf(code), workspace_id: workspaceId, person_id: personId, created_at: new Date().toISOString() }, { onConflict: "workspace_id,person_id" });
  if (error) throw new Error("The link could not be made.");
  return { url: `https://t.me/${bot.username}?start=${code}`, minutes: TELEGRAM_CODE_MINUTES };
}

/** "Connect Telegram" for a signed-in member, in their workspace. */
export async function startTelegramLink(actor: Actor): Promise<{ url: string; minutes: number }> {
  return codeFor(actor.workspaceId, actor.personId);
}

/** "Connect Telegram" on a Contact's personal form page, in the Metric's workspace. It starts only where the Contact can
 * be emailed the confirmation, and connects nothing by itself. It never replaces a Telegram the Contact already
 * connected, and a form cannot disconnect one: only /stop from that Telegram account does. */
export async function startTelegramLinkByForm(formCode: string): Promise<{ url: string; minutes: number }> {
  const owner = await formContact(formCode);
  if (!owner) throw new Forbidden("Connect Telegram signed in, on the Connectors page.");
  const { data: linked } = await db().from("telegram_links").select("person_id").eq("workspace_id", owner.workspaceId).eq("person_id", owner.personId).maybeSingle();
  if (linked) throw new Error("Your Telegram is connected already. To use another one, disconnect first.");
  const to = await confirmationAddress(owner.workspaceId, owner.personId);
  if ("help" in to) throw new Error(to.help);
  return codeFor(owner.workspaceId, owner.personId);
}

/** What became of a /start: linked (with the workspace's name for the bot to say), waiting for a Contact's
 * confirmation by email, or why not. */
export type TelegramLinkOutcome =
  | { linked: true; workspace: string; person: string }
  | { linked: false; why: "unknown_code" | "expired" | "not_private" }
  | TelegramConfirmRequest;

/** Takes `/start <code>` from a private chat, once, within ten minutes, if the person who made the code still belongs to
 * its workspace. A member's account is linked to them, and they are emailed that it was: whoever was that account in the
 * workspace before is not any more, since the account that proved the code wins, and is emailed too. A Contact's is not
 * linked here: they are asked to confirm it by email. `from` is the sender as Telegram names them, shown in those
 * emails. */
export async function linkTelegramByCode(input: { code: string; userId: unknown; chatId: unknown; chatType: unknown; from?: unknown }): Promise<TelegramLinkOutcome> {
  if (input.chatType !== "private") return { linked: false, why: "not_private" };
  if (!isTelegramId(input.userId) || !isTelegramId(input.chatId) || !/^[A-Za-z0-9_-]{43}$/.test(String(input.code))) return { linked: false, why: "unknown_code" };
  // Taken and removed in one step: a code works once.
  const { data: taken } = await db().from("telegram_link_codes").delete().eq("code_hash", hashOf(String(input.code))).select("workspace_id, person_id, created_at");
  const c = taken?.[0];
  if (!c) return { linked: false, why: "unknown_code" };
  if (Date.now() - new Date(c.created_at).getTime() > TELEGRAM_CODE_MINUTES * 60_000) return { linked: false, why: "expired" };
  const kind = await belongs(c.workspace_id, c.person_id);
  if (!kind || !(await telegramOnIn(c.workspace_id))) return { linked: false, why: "gone" };
  // Decided by who the code is for: a Contact has no sign-in, so their code was made with a form link.
  if (kind === "contact") return askContactToConfirm(c.workspace_id, c.person_id, { userId: input.userId, chatId: input.chatId, from: input.from });
  const { data: dropped } = await db().from("telegram_links").delete().eq("workspace_id", c.workspace_id).eq("telegram_user_id", input.userId).neq("person_id", c.person_id).select("person_id");
  for (const d of dropped ?? []) await tellDisconnected({ workspaceId: c.workspace_id, personId: d.person_id as string, service: "telegram" });
  // The person's Telegram so far, if another account: it is told, so nobody loses their messages without knowing.
  const { data: before } = await db().from("telegram_links").select("chat_id, telegram_user_id").eq("workspace_id", c.workspace_id).eq("person_id", c.person_id).maybeSingle();
  const linkedAt = new Date();
  const { error } = await db().from("telegram_links").upsert(
    { workspace_id: c.workspace_id, person_id: c.person_id, telegram_user_id: input.userId, chat_id: input.chatId, linked_at: linkedAt.toISOString() },
    { onConflict: "workspace_id,person_id" },
  );
  if (error) return { linked: false, why: "gone" };
  // By email too, to the member's own address: an account they were not connected to before.
  if (Number(before?.telegram_user_id) !== input.userId) await tellConnected({ workspaceId: c.workspace_id, personId: c.person_id, service: "telegram", account: telegramAccountName(input.from), by: "code", linkedAt });
  const [{ data: w }, { data: p }] = await Promise.all([
    db().from("workspaces").select("name").eq("id", c.workspace_id).maybeSingle(),
    db().from("profiles").select("id, name").eq("id", c.person_id).maybeSingle().then(async (r) => ({ data: r.data ? (await openNames(c.workspace_id, [r.data]))[0] : null })),
  ]);
  const name = w?.name ?? "Ziffr";
  if (before && Number(before.telegram_user_id) !== input.userId) await tellChat(Number(before.chat_id), `Ziffr messages for ${name} now go to another Telegram account. If that was not you, tell an Owner of the workspace.`);
  return { linked: true, workspace: name, person: p?.name ?? "you" };
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

/** Whether the Contact whose form this is is linked to Telegram in its workspace and, while they are not, why the form
 * cannot start a connection (`help`, in words for them); null for a link that does not work or is not a Contact's (the
 * form then offers nothing about Telegram). */
export async function formTelegramLink(formCode: string): Promise<{ linked: boolean; telegramOn: boolean; help: string | null } | null> {
  const owner = await formContact(formCode);
  if (!owner) return null;
  const [{ data }, telegramOn] = await Promise.all([
    db().from("telegram_links").select("person_id").eq("workspace_id", owner.workspaceId).eq("person_id", owner.personId).maybeSingle(),
    telegramOnIn(owner.workspaceId),
  ]);
  const to = !data && telegramOn ? await confirmationAddress(owner.workspaceId, owner.personId) : null;
  return { linked: Boolean(data), telegramOn, help: to && "help" in to ? to.help : null };
}

/** Whether the actor stopped Prompts and reminders on Telegram in their workspace (with the button under one). */
export async function telegramOptedOut(actor: Actor): Promise<boolean> {
  const { data } = await db().from("telegram_opt_outs").select("person_id").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  return Boolean(data);
}

/** The actor gets Prompts and reminders on Telegram again in their workspace. Only they can: it was their choice. */
export async function telegramOptBackIn(actor: Actor): Promise<void> {
  await db().from("telegram_opt_outs").delete().eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId);
}

/** Forgets the actor's Telegram link in their workspace. */
export async function unlinkTelegram(actor: Actor): Promise<void> {
  await db().from("telegram_links").delete().eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId);
}

/** The private chat a Delivery to this person goes to in a workspace, or null when they are not linked there or no
 * longer belong to it: someone who left gets nothing, also not what was queued before they left. */
export async function telegramChatOf(workspaceId: string, personId: string): Promise<{ chatId: number; userId: number } | null> {
  const { data } = await db().from("telegram_links").select("chat_id, telegram_user_id").eq("workspace_id", workspaceId).eq("person_id", personId).maybeSingle();
  if (!data || !(await belongs(workspaceId, personId))) return null;
  return { chatId: Number(data.chat_id), userId: Number(data.telegram_user_id) };
}

/** The person a Telegram account is in a workspace, as linked, while they still belong to it (a member or Contact):
 * for answers that come in by Telegram. Someone who left answers nothing, whatever link remains. */
export async function personOfTelegramUser(workspaceId: string, userId: unknown): Promise<string | null> {
  if (!isTelegramId(userId)) return null;
  const { data } = await db().from("telegram_links").select("person_id").eq("workspace_id", workspaceId).eq("telegram_user_id", userId).maybeSingle();
  return data && (await belongs(workspaceId, data.person_id)) ? (data.person_id as string) : null;
}
