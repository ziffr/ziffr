// Sending email (spec 0004, ticket #71; GLOSSARY: Delivery, Connector). The Email Connector has always worded each
// Delivery; this sends it as plain text through SMTP (ZIFFR_SMTP_URL, from ZIFFR_MAIL_FROM). Only to a member or
// Contact of the Delivery's workspace, at the address that workspace keeps, never in the demo, and nothing at all
// without settings. Addresses are looked up when sending and never stored with the Delivery.
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";

/** How often a message is tried before it counts as failed. */
export const MAX_ATTEMPTS = 5;

/** What a send did: sent, failed (and will be retried, or not after MAX_ATTEMPTS), or nothing to do. */
export type SendResult = "sent" | "failed" | "skipped";

/** A plain-text email ready to go out. */
export type OutgoingMail = { to: string; subject: string; text: string };

/** Sends one email and returns the provider's Message-ID; tests pass their own. */
export type MailTransport = (mail: OutgoingMail) => Promise<{ messageId: string }>;

// An address as a person types it, with nothing that could start another header or name a second recipient.
const ADDRESS = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/;

/** Whether this is one plain email address, safe to put in a header. */
export const isAddress = (s: unknown): s is string => typeof s === "string" && s.length <= 254 && ADDRESS.test(s);

/** A header value on one line: line breaks and other control characters become spaces, at most 200 characters. */
export const headerSafe = (s: string) => String(s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

/** Whether this Ziffr sends email: the SMTP server, a sender that is one plain address, and ZIFFR_SITE_URL, since an
 * email whose links lead nowhere is worse than none. */
export function mailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ZIFFR_SMTP_URL) && isAddress(fromAddress(env)) && /^https?:\/\/[^\s/]+/.test(env.ZIFFR_SITE_URL ?? "");
}

// ZIFFR_MAIL_FROM may be "Ziffr <ziffr@example.com>" or just the address.
function fromAddress(env: Record<string, string | undefined>): string {
  const raw = env.ZIFFR_MAIL_FROM ?? "";
  return raw.match(/<([^>]+)>\s*$/)?.[1] ?? raw.trim();
}

let transporter: { url: string; t: Transporter } | null = null;

/** The SMTP transport from the settings, made once. */
export const smtpTransport: MailTransport = async (mail) => {
  const url = process.env.ZIFFR_SMTP_URL!;
  if (transporter?.url !== url) transporter = { url, t: nodemailer.createTransport(url) };
  const from = process.env.ZIFFR_MAIL_FROM!;
  const name = from.match(/^\s*([^<]+?)\s*</)?.[1];
  const info = await transporter.t.sendMail({
    from: name ? { name: headerSafe(name), address: fromAddress(process.env) } : fromAddress(process.env),
    to: mail.to, subject: mail.subject, text: mail.text,
    // Automated mail: no out-of-office replies to it (RFC 3834).
    headers: { "Auto-Submitted": "auto-generated" },
  });
  return { messageId: String(info.messageId ?? "") };
};

/** The state a new Delivery starts in: queued when it will really be emailed, else it stays in the Outbox. */
export function initialMailState(connector: string, workspaceId: string): "queued" | "outbox" {
  return connector === "email" && workspaceId !== DEMO_WORKSPACE_ID && mailEnabled() ? "queued" : "outbox";
}

/** The address a workspace keeps for a person: a Contact's stored one, or a member's own (proven at sign-in). Null
 * for anyone who is neither in that workspace, or has no usable address. */
export async function addressIn(workspaceId: string, personId: string): Promise<string | null> {
  const [{ data: contact }, { data: member }] = await Promise.all([
    db().from("contacts").select("email").eq("workspace_id", workspaceId).eq("person_id", personId).maybeSingle(),
    db().from("memberships").select("user_id").eq("workspace_id", workspaceId).eq("user_id", personId).maybeSingle(),
  ]);
  let address: string | null = null;
  if (contact) address = contact.email ?? null;
  else if (member) address = ((await db().from("profiles").select("email").eq("id", personId).maybeSingle()).data?.email as string | null) ?? null;
  return isAddress(address) ? address : null;
}

/** Sends one queued Delivery. It is claimed first, so the immediate send and the retry job never both send it. */
export async function sendDelivery(id: number, transport: MailTransport = smtpTransport): Promise<SendResult> {
  const now = new Date().toISOString();
  const { data: claimed } = await db().from("deliveries").update({ mail_state: "sending", last_attempt_at: now })
    .eq("id", id).eq("mail_state", "queued").lt("attempts", MAX_ATTEMPTS).select("id, workspace_id, recipient_id, subject, body, attempts").maybeSingle();
  if (!claimed) return "skipped";
  const attempts = Number(claimed.attempts) + 1;
  const fail = async (why: string, final = false) => {
    await db().from("deliveries").update({ mail_state: final || attempts >= MAX_ATTEMPTS ? "failed" : "queued", attempts, last_error: why.slice(0, 200) }).eq("id", id);
    return "failed" as const;
  };
  // Settings may have gone, or the Delivery may be the demo's: nothing leaves then, and it does not try again.
  if (claimed.workspace_id === DEMO_WORKSPACE_ID || !mailEnabled()) return fail("Email is not set up.", true);
  const to = await addressIn(claimed.workspace_id, claimed.recipient_id);
  if (!to) return fail("No usable email address for this person here.", true);
  try {
    const { messageId } = await transport({ to, subject: headerSafe(claimed.subject), text: String(claimed.body) });
    await db().from("deliveries").update({ mail_state: "sent", attempts, sent_at: new Date().toISOString(), provider_id: messageId.slice(0, 300) || null, last_error: null }).eq("id", id);
    return "sent";
  } catch (e) {
    // The server's own words may hold addresses or settings: only its kind of failure is kept.
    return fail(`The mail server refused it (${(e as { code?: string }).code ?? "error"}).`);
  }
}

/** Sends what is waiting: queued Deliveries whose wait after the last attempt is over (1, 2, 4, 8 minutes), and ones
 * left "sending" for over ten minutes by a stopped server. At most `limit` per run. */
export async function sendWaiting(limit = 50, transport: MailTransport = smtpTransport): Promise<{ sent: number; failed: number }> {
  const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
  await db().from("deliveries").update({ mail_state: "queued" }).eq("mail_state", "sending").lt("last_attempt_at", tenMinutesAgo);
  const { data } = await db().from("deliveries").select("id, attempts, last_attempt_at").eq("mail_state", "queued").lt("attempts", MAX_ATTEMPTS).order("id").limit(Math.min(Math.max(limit, 1), 500));
  const due = (data ?? []).filter((d) => !d.last_attempt_at || Date.now() - new Date(d.last_attempt_at).getTime() >= 60_000 * 2 ** Math.max(0, Number(d.attempts) - 1));
  let sent = 0;
  let failed = 0;
  for (const d of due) {
    const r = await sendDelivery(d.id, transport);
    if (r === "sent") sent++;
    else if (r === "failed") failed++;
  }
  return { sent, failed };
}

/** Sends a new Delivery at once if it is queued; a failure waits for the retry job and never fails the caller. */
export async function sendNow(id: number | null | undefined, state: string) {
  if (!id || state !== "queued") return;
  try {
    await sendDelivery(id);
  } catch {
    // The Delivery stays queued; sendWaiting tries again.
  }
}
