// Sign-in emails sent by Ziffr (ADR 0003, spec 0025, #198; GLOSSARY: Installation Settings): Supabase Auth hands each
// email it would send to Ziffr through its Send Email Hook, and Ziffr sends it through the mail server in effect, so a
// server saved on the Installation settings page carries sign-in links too. The hook's signature (Standard Webhooks,
// with ZIFFR_AUTH_HOOK_SECRET) is the whole defence: a forged call would make Ziffr send sign-in emails to anyone. The
// link goes to Supabase Auth's own verify address and comes back only to this Ziffr's address.
import { createHmac, timingSafeEqual } from "node:crypto";
import { isAddress, mailEnabled, sendMail, type MailTransport } from "./mail";
import { emailHtml } from "./branded-email";
import { themeLook } from "./theme-look";
import { settingsInEffect } from "./settings-in-effect";

/** How far a hook call's timestamp may be from now, in seconds, either way. */
export const AUTH_HOOK_TOLERANCE_SECONDS = 300;

/** The kinds of email Auth asks for and Ziffr sends. Any other is refused, so Auth reports a failure rather than
 * Ziffr silently sending nothing. */
export const AUTH_EMAIL_KINDS = ["magiclink", "signup", "recovery", "invite", "email_change"] as const;
type AuthEmailKind = (typeof AUTH_EMAIL_KINDS)[number];

/** Why a hook call was not sent, by a fixed code that Auth logs; never the payload or the mail server's words. */
export class AuthEmailRefused extends Error {
  constructor(readonly code: "bad_payload" | "unknown_kind" | "redirect_outside" | "mail_off" | "send_failed") {
    super(code);
    this.name = "AuthEmailRefused";
  }
}

/** The hook's secrets as bytes, from `v1,whsec_<base64>` (as Auth takes it) or `whsec_<base64>`, several separated
 * by `|` while one replaces another; none when unset or any is malformed, and then the hook route answers "not
 * found". */
export function authHookSecrets(env: Record<string, string | undefined> = process.env): Buffer[] {
  const parts = (env.ZIFFR_AUTH_HOOK_SECRET ?? "").split("|").map((p) => p.trim()).filter(Boolean).slice(0, 5);
  const keys = parts.map((part) => {
    const b64 = /^(?:v1,)?whsec_([A-Za-z0-9+/=]{24,200})$/.exec(part)?.[1];
    const key = b64 ? Buffer.from(b64, "base64") : null;
    return key && key.length >= 16 ? key : null;
  });
  return keys.length && keys.every(Boolean) ? (keys as Buffer[]) : [];
}

const seen = new Map<string, number>();

/** Whether this is the first time this process takes the call with this id in its five minutes, so a call sent again
 * (a replay of one that leaked) sends nothing more. Ids older than the window are forgotten. */
export function firstHookCall(id: string, now = Date.now()): boolean {
  for (const [k, at] of seen) if (now - at > 2 * AUTH_HOOK_TOLERANCE_SECONDS * 1000) seen.delete(k);
  if (seen.has(id)) return false;
  if (seen.size < 10_000) seen.set(id, now);
  return true;
}

/** Whether a hook call was signed with the secret, a moment ago (Standard Webhooks: the HMAC-SHA256 of
 * `<id>.<timestamp>.<body>`, base64, as `v1,<signature>`, several separated by spaces). Compared in constant time. */
export function authHookSigned(secrets: Buffer[], headers: { id: string | null; timestamp: string | null; signature: string | null }, body: string, now = Date.now()): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !/^[\w.-]{1,200}$/.test(id) || !timestamp || !/^\d{9,11}$/.test(timestamp) || !signature) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > AUTH_HOOK_TOLERANCE_SECONDS) return false;
  const macs = secrets.map((secret) => createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest());
  return signature.split(" ").slice(0, 10).some((part) => {
    const given = /^v1,([A-Za-z0-9+/=]{1,200})$/.exec(part)?.[1];
    if (!given) return false;
    const bytes = Buffer.from(given, "base64");
    return macs.some((mac) => bytes.length === mac.length && timingSafeEqual(bytes, mac));
  });
}

/** Where a link may lead after verifying: this Ziffr's own address and below it, nowhere else, so the hook can never
 * be used to send people elsewhere with a working sign-in. */
function redirectInside(redirectTo: unknown, site: string): string | null {
  if (redirectTo === undefined || redirectTo === null || redirectTo === "") return site;
  if (typeof redirectTo !== "string" || redirectTo.length > 2000) return null;
  return redirectTo === site || redirectTo.startsWith(`${site}/`) ? redirectTo : null;
}

/** The address of Supabase Auth that people's browsers reach. */
function authAddress(): string {
  return String(process.env.SUPABASE_PUBLIC_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
}

const TOKEN_HASH = /^[A-Za-z0-9_-]{8,200}$/;

/** Ziffr's words for each kind; the link is the only thing taken from the call. */
const WORDS: Record<Exclude<AuthEmailKind, "email_change">, { subject: string; lead: string; button: string }> = {
  magiclink: { subject: "Your Ziffr sign-in link", lead: "Open this link to sign in to Ziffr:", button: "Sign in to Ziffr" },
  signup: { subject: "Your Ziffr sign-in link", lead: "Open this link to sign in to Ziffr for the first time:", button: "Sign in to Ziffr" },
  recovery: { subject: "Your Ziffr sign-in link", lead: "Open this link to sign in to Ziffr:", button: "Sign in to Ziffr" },
  invite: { subject: "You are invited to Ziffr", lead: "Open this link to accept and sign in to Ziffr:", button: "Accept and sign in" },
};

const ENDING = "The link works once, for an hour. If you did not ask for it, ignore this email: nobody signs in without the link.";

/** One email: the plain text (always sent, the whole link on a line of its own) and the same words as HTML in Ziffr's
 * own look. A sign-in email goes out before the person has a Workspace, so it carries the Installation's look (Ziffr's
 * default Theme, its name as the wordmark) and never anything of a Workspace. In the HTML the link is a button. */
export function authMail(to: string, subject: string, lead: string, button: string, url: string) {
  const look = themeLook(undefined, "Ziffr");
  const text = `${lead}\n\n<${url}>\n\n${ENDING}`;
  const html = emailHtml(look, { text, action: { label: button, url }, preheader: ENDING, sentBy: "Sent by Ziffr because this address was used to sign in." });
  return { to, subject, text, html };
}

/** Sends the email of one hook call, already checked for its signature: the sign-in link for its kind, to the
 * address Auth names, through the mail server in effect. Throws AuthEmailRefused for anything it does not send. */
export async function sendAuthEmail(payload: unknown, transport?: MailTransport): Promise<void> {
  const p = payload as { user?: { email?: unknown; new_email?: unknown }; email_data?: Record<string, unknown> } | null;
  const data = p?.email_data;
  const email = typeof p?.user?.email === "string" ? p.user.email.toLowerCase() : "";
  if (!data || typeof data !== "object" || !isAddress(email)) throw new AuthEmailRefused("bad_payload");
  const kind = data.email_action_type;
  if (!AUTH_EMAIL_KINDS.includes(kind as AuthEmailKind)) throw new AuthEmailRefused("unknown_kind");
  const settings = await settingsInEffect();
  const site = String(settings.ZIFFR_SITE_URL ?? "").replace(/\/+$/, "");
  const back = redirectInside(data.redirect_to, site);
  if (!site || !back) throw new AuthEmailRefused("redirect_outside");
  if (!mailEnabled(settings) || !authAddress()) throw new AuthEmailRefused("mail_off");
  const link = (hash: unknown, type: string) => {
    if (typeof hash !== "string" || !TOKEN_HASH.test(hash)) throw new AuthEmailRefused("bad_payload");
    return `${authAddress()}/auth/v1/verify?token=${encodeURIComponent(hash)}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(back)}`;
  };
  const mails: ReturnType<typeof authMail>[] = [];
  if (kind === "email_change") {
    // Auth's names are crossed for backward compatibility: token_hash goes to the new address, token_hash_new to the
    // current one. Both must confirm when Auth asks for both.
    const fresh = typeof p?.user?.new_email === "string" ? p.user.new_email.toLowerCase() : "";
    if (!isAddress(fresh)) throw new AuthEmailRefused("bad_payload");
    mails.push(authMail(fresh, "Confirm your new address for Ziffr", `Open this link to use ${fresh} for Ziffr from now on:`, "Confirm the new address", link(data.token_hash, "email_change")));
    if (data.token_hash_new) mails.push(authMail(email, "Confirm the change of your Ziffr address", `Open this link to confirm that ${fresh} replaces this address for Ziffr:`, "Confirm the change", link(data.token_hash_new, "email_change")));
  } else {
    const w = WORDS[kind as Exclude<AuthEmailKind, "email_change">];
    mails.push(authMail(email, w.subject, w.lead, w.button, link(data.token_hash, kind as string)));
  }
  for (const m of mails) {
    try {
      await sendMail(m, transport);
    } catch {
      // The mail server's own words stay out of Auth's log and the browser alike.
      throw new AuthEmailRefused("send_failed");
    }
  }
}
