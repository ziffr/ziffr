// The Slack Web API (spec 0007; GLOSSARY: Connector). Every call Ziffr makes to Slack goes through here, to
// https://slack.com/api or the self-hoster's ZIFFR_SLACK_API_URL (GovSlack), never to an address taken from data.
// Slack's own words in an error are not kept beyond its error code: they may name people or settings. The app's
// client id, client secret and signing secret are the ones in effect (spec 0025): the environment's, else the ones an
// Installation Admin saved on the Installation Settings page.
import { secretsKey } from "./secrets";
import { settingsInEffect, type Settings } from "./settings-in-effect";

/** Slack's answer to one method call, as JSON. */
export type SlackAnswer = { ok: boolean; error?: string } & Record<string, unknown>;

/** A Slack call that did not work: Slack's error code, and for a 429 the seconds Slack asks to wait. */
export class SlackError extends Error {
  constructor(readonly code: string, readonly retryAfter: number | null = null) {
    super(`Slack: ${code}`);
    this.name = "SlackError";
  }
}

/** Errors that mean the bot token no longer works: the connection is over. */
export const TOKEN_GONE = ["invalid_auth", "token_revoked", "account_inactive", "not_authed", "token_expired", "team_disabled"];

/** Where the Web API is: ZIFFR_SLACK_API_URL when it is https (or a local test server), else slack.com. */
export function slackApiBase(env: Record<string, string | undefined> = process.env): string {
  const set = (env.ZIFFR_SLACK_API_URL ?? "").trim().replace(/\/+$/, "");
  // A bot token must not travel in clear text: only https, or a server on this machine for tests.
  if (/^https:\/\/[a-z0-9.-]+(:\d+)?\/[a-z0-9/_-]*$/i.test(set) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[a-z0-9/_-]*$/i.test(set)) return set;
  return "https://slack.com/api";
}

/** The signing secret of these settings, when it is long enough to be one; null otherwise. Pass the settings in effect. */
export function slackSigningSecret(env: Settings): string | null {
  const s = env.ZIFFR_SLACK_SIGNING_SECRET ?? "";
  return s.length >= 16 ? s : null;
}

/** Whether these settings talk to Slack: the app's client id, client secret and signing secret, the key that seals bot
 * tokens, and ZIFFR_SITE_URL for the links and the OAuth redirect. */
export function slackEnabled(env: Settings): boolean {
  return Boolean(env.ZIFFR_SLACK_CLIENT_ID && env.ZIFFR_SLACK_CLIENT_SECRET) && Boolean(slackSigningSecret(env))
    && Boolean(secretsKey(env)) && /^https?:\/\/[^\s/]+/.test(env.ZIFFR_SITE_URL ?? "");
}

/** The signing secret in effect now, for checking Slack's requests on the server; null without one. */
export const slackSigningSecretNow = async (): Promise<string | null> => slackSigningSecret(await settingsInEffect());

/** Whether this Ziffr talks to Slack now, by the settings in effect. */
export const slackOn = async (): Promise<boolean> => slackEnabled(await settingsInEffect());

/** Calls one Web API method with form fields (objects are sent as JSON, as Slack takes `blocks`), with the bot token
 * when given. Throws a SlackError for `ok: false`, a 429 or a failed request; waits at most ten seconds. */
export async function callSlack(method: string, params: Record<string, unknown>, token?: string): Promise<SlackAnswer> {
  if (!/^[a-z]+(\.[a-zA-Z0-9]+)+$/.test(method)) throw new SlackError("bad_method");
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  let res: Response;
  try {
    res = await fetch(`${slackApiBase()}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SlackError("request_failed");
  }
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after"));
    throw new SlackError("ratelimited", Number.isFinite(wait) && wait > 0 ? Math.min(wait, 3600) : 60);
  }
  let json: SlackAnswer;
  try {
    json = (await res.json()) as SlackAnswer;
  } catch {
    throw new SlackError(`http_${res.status}`);
  }
  if (!json || json.ok !== true) throw new SlackError(typeof json?.error === "string" ? json.error.slice(0, 60).replace(/[^a-z0-9_]/gi, "") : "unknown_error");
  return json;
}
