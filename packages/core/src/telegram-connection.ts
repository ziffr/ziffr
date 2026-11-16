// Telegram per workspace (spec 0016, ticket #24; GLOSSARY: Connector, Workspace, Workspace Role). One bot serves the
// Installation; each workspace's Owners and Admins turn Telegram on or off for it. Turning it on registers the
// Installation's webhook (or leaves it to polling on a laptop). Pages get the bot's username and the switch, never
// the token: it stays in the environment and in telegram-api.ts.
import { assertCan, can, Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { callTelegram, telegramEnabled, telegramPolling, telegramToken, telegramWebhookSecret, TelegramError } from "./telegram-api";
import { DEMO_WORKSPACE_ID } from "./team";

/** The updates Ziffr asks Telegram for: messages, button presses, and being blocked or unblocked. */
export const TELEGRAM_UPDATES = ["message", "callback_query", "my_chat_member"];

/** Telegram as the Connectors page shows it: whether this Ziffr has a bot and which, whether this workspace has it
 * on, and whether the viewer may switch it. */
export type TelegramConnectionView = { configured: boolean; bot: { username: string } | null; enabled: boolean; canManage: boolean; polling: boolean };

let cachedBot: { token: string; username: string | null; at: number } | null = null;

/** The bot's username, asked of Telegram (getMe) at most every ten minutes; null when the token does not work. */
export async function telegramBot(): Promise<{ username: string } | null> {
  const token = telegramToken();
  if (!token || !telegramEnabled()) return null;
  if (cachedBot && cachedBot.token === token && Date.now() - cachedBot.at < 10 * 60_000) return cachedBot.username ? { username: cachedBot.username } : null;
  let username: string | null = null;
  try {
    const me = await callTelegram<{ is_bot?: boolean; username?: string }>("getMe");
    username = me?.is_bot && typeof me.username === "string" && /^[A-Za-z0-9_]{5,32}$/.test(me.username) ? me.username : null;
  } catch {
    username = null;
  }
  cachedBot = { token, username, at: Date.now() };
  return username ? { username } : null;
}

/** Forgets the bot's username, so the next look asks Telegram again (tests, and a token changed while running). */
export function forgetTelegramBot() {
  cachedBot = null;
}

/** Whether Telegram is on in a workspace: this Ziffr has a bot, and the workspace turned it on. Never in the demo. */
export async function telegramOnIn(workspaceId: string): Promise<boolean> {
  if (!telegramEnabled() || workspaceId === DEMO_WORKSPACE_ID) return false;
  const { data } = await db().from("telegram_workspaces").select("enabled").eq("workspace_id", workspaceId).maybeSingle();
  return data?.enabled === true;
}

/** Telegram for the Connectors page. */
export async function telegramConnection(actor: Actor): Promise<TelegramConnectionView> {
  const configured = telegramEnabled();
  const canManage = configured && actor.workspaceId !== DEMO_WORKSPACE_ID && can(actor, "manage-members");
  if (!configured) return { configured, bot: null, enabled: false, canManage: false, polling: false };
  const [bot, enabled] = await Promise.all([telegramBot(), telegramOnIn(actor.workspaceId)]);
  return { configured, bot, enabled, canManage, polling: telegramPolling() };
}

function mayManage(actor: Actor) {
  assertCan(actor, "manage-members");
  // The demo is shared by every visitor: it never reaches anyone on Telegram.
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo does not use Telegram.");
}

/** Points Telegram's webhook at this Ziffr, with the secret it must send back. Installation-wide, so registering it
 * again for another workspace changes nothing. Not with polling, which fetches updates itself. */
export async function registerTelegramWebhook(): Promise<void> {
  if (telegramPolling()) return;
  const site = String(process.env.ZIFFR_SITE_URL ?? "").replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+$/.test(site)) throw new Error("Telegram needs ZIFFR_SITE_URL with https, or ZIFFR_TELEGRAM_POLLING=1 on a laptop.");
  await callTelegram("setWebhook", {
    url: `${site}/api/telegram/updates`,
    secret_token: telegramWebhookSecret(),
    allowed_updates: TELEGRAM_UPDATES,
    max_connections: 10,
  });
}

/** Turns Telegram on or off in the actor's workspace (Owners and Admins). Turning it on first makes sure Telegram
 * can reach this Ziffr; if that fails, it stays off. Turning it off keeps who linked themselves. */
export async function setTelegramEnabled(actor: Actor, on: boolean): Promise<void> {
  mayManage(actor);
  if (!telegramEnabled()) throw new Error("Telegram is not set up for this Ziffr.");
  if (on) {
    if (!(await telegramBot())) throw new Error("Telegram does not accept this Ziffr's bot token.");
    try {
      await registerTelegramWebhook();
    } catch (err) {
      throw err instanceof TelegramError ? new Error("Telegram could not be told where to send answers. Try again in a moment.") : err;
    }
  }
  const { error } = await db().from("telegram_workspaces").upsert({ workspace_id: actor.workspaceId, enabled: on, changed_by: actor.personId, changed_at: new Date().toISOString() });
  if (error) throw new Error("Telegram could not be switched.");
  await audit(actor, { kind: on ? "telegram.turned_on" : "telegram.turned_off", object: { type: "workspace", id: actor.workspaceId } });
}
