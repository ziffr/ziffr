// The check against bots on the sign-in form (spec 0021, ticket 8): Cloudflare Turnstile, when this Ziffr has its two
// settings. A public Ziffr that offers trials lets anyone ask for a sign-in link; without a check a bot could make it
// mail any address. The answer is verified here, on the server, before any link is sent; the browser's word is never
// taken. Only Cloudflare's own address is called, never one from a request.
import "server-only";
import { settingsInEffect } from "@ziffr/core/settings-in-effect";

const VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The site key the sign-in form shows the check with, or null when these settings (the settings in effect: the
 * environment, else the Installation settings page) set up no check. */
export function turnstileSiteKey(env: Record<string, string | undefined>): string | null {
  return env.ZIFFR_TURNSTILE_SITE_KEY && env.ZIFFR_TURNSTILE_SECRET ? env.ZIFFR_TURNSTILE_SITE_KEY : null;
}

/** Whether the check's answer from the form is good: true when no check is set up; false for a missing, wrong, used
 * or late answer, or when Cloudflare cannot be asked (a closed door, never an open one). */
export async function turnstilePassed(answer: unknown, ip: string | null, given?: Record<string, string | undefined>): Promise<boolean> {
  const env = given ?? (await settingsInEffect());
  if (!turnstileSiteKey(env)) return true;
  if (typeof answer !== "string" || !answer || answer.length > 2048) return false;
  const body = new URLSearchParams({ secret: String(env.ZIFFR_TURNSTILE_SECRET), response: answer });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY, { method: "POST", body, signal: AbortSignal.timeout(5000), cache: "no-store" });
    const data = (await res.json()) as { success?: unknown };
    return res.ok && data.success === true;
  } catch {
    return false;
  }
}
