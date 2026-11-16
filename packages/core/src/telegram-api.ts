// The Telegram Bot API (spec 0016; GLOSSARY: Connector). Every call Ziffr makes to Telegram goes through here, to
// https://api.telegram.org or the self-hoster's ZIFFR_TELEGRAM_API_URL (a Bot API server of their own), never to an
// address taken from data. The bot token is part of every request's path, so no address and no error text that
// could carry it is ever logged or kept: an error keeps only Telegram's numeric code.
import { createHmac } from "node:crypto";
import { secretsKey } from "./secrets";

/** Telegram's answer to one method call: `result` when it worked. */
export type TelegramAnswer = { ok: boolean; result?: unknown; error_code?: number; parameters?: { retry_after?: number } };

/** A Telegram call that did not work: Telegram's error code (or a word of ours), and for a 429 the seconds to wait. */
export class TelegramError extends Error {
  constructor(readonly code: string, readonly retryAfter: number | null = null) {
    super(`Telegram: ${code}`);
    this.name = "TelegramError";
  }
}

/** The bot token from @BotFather: the bot's numeric id, a colon, and a secret part. */
const TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/;

/** The bot token, when one is set and looks like one; null otherwise. */
export function telegramToken(env: Record<string, string | undefined> = process.env): string | null {
  const t = (env.ZIFFR_TELEGRAM_BOT_TOKEN ?? "").trim();
  return TOKEN.test(t) ? t : null;
}

/** Whether this Ziffr talks to Telegram: a bot token, and the key the webhook's secret is derived from. */
export function telegramEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(telegramToken(env)) && Boolean(secretsKey(env));
}

/** Whether updates are fetched by polling (`pnpm telegram:poll`, for a laptop) instead of a webhook. */
export const telegramPolling = (env: Record<string, string | undefined> = process.env) => env.ZIFFR_TELEGRAM_POLLING === "1";

/** Where the Bot API is: ZIFFR_TELEGRAM_API_URL when it is https (or a local test server), else api.telegram.org. */
export function telegramApiBase(env: Record<string, string | undefined> = process.env): string {
  const set = (env.ZIFFR_TELEGRAM_API_URL ?? "").trim().replace(/\/+$/, "");
  // The token travels in the path: only https, or a server on this machine for tests.
  if (/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(set) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(set)) return set;
  return "https://api.telegram.org";
}

/** The secret Telegram sends with every webhook request (X-Telegram-Bot-Api-Secret-Token): derived from the bot token
 * and ZIFFR_SECRETS_KEY, so it changes when either does and is never stored. 64 hex characters, inside Telegram's
 * allowed set. Null without both. */
export function telegramWebhookSecret(env: Record<string, string | undefined> = process.env): string | null {
  const token = telegramToken(env);
  const key = secretsKey(env);
  if (!token || !key) return null;
  return createHmac("sha256", key).update(`telegram-webhook:${token}`).digest("hex");
}

/** Calls one Bot API method with a JSON body. Throws a TelegramError for `ok: false`, a 429 or a failed request;
 * waits at most ten seconds (more for long polling, `waitSeconds`). */
export async function callTelegram<T = unknown>(method: string, params: Record<string, unknown> = {}, waitSeconds = 0): Promise<T> {
  const token = telegramToken();
  if (!token) throw new TelegramError("not_configured");
  if (!/^[a-zA-Z]+$/.test(method)) throw new TelegramError("bad_method");
  let res: Response;
  try {
    res = await fetch(`${telegramApiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      redirect: "error",
      signal: AbortSignal.timeout(10_000 + waitSeconds * 1000),
    });
  } catch {
    // The fetch error can name the address, and with it the token: never pass it on.
    throw new TelegramError("request_failed");
  }
  let json: TelegramAnswer;
  try {
    json = (await res.json()) as TelegramAnswer;
  } catch {
    throw new TelegramError(`http_${res.status}`);
  }
  if (res.status === 429 || json?.error_code === 429) {
    const wait = Number(json?.parameters?.retry_after);
    throw new TelegramError("too_many_requests", Number.isFinite(wait) && wait > 0 ? Math.min(wait, 3600) : 30);
  }
  if (!json || json.ok !== true) throw new TelegramError(`error_${Number(json?.error_code) || res.status}`);
  return json.result as T;
}
