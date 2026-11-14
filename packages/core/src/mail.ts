// Sending email (spec 0004, ticket #71; GLOSSARY: Delivery, Connector). The Email Connector has always worded each
// Delivery; this sends it as plain text through SMTP (ZIFFR_SMTP_URL, from ZIFFR_MAIL_FROM). Only to a member or
// Contact of the Delivery's workspace, at the address that workspace keeps, never in the demo, and nothing at all
// without settings. Addresses are looked up when sending and never stored with the Delivery.
import { randomBytes } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";

/** How often a message is tried before it counts as failed. */
export const MAX_ATTEMPTS = 5;

/** What a send did: sent, failed (and will be retried, or not after MAX_ATTEMPTS), or nothing to do. */
export type SendResult = "sent" | "failed" | "skipped" | "waiting";

/** Emails one workspace may send in 24 hours; the rest wait in the queue. */
export const MAIL_PER_WORKSPACE_PER_DAY = 500;
/** Emails one inbox may get in an hour, from all workspaces together (counted by mailboxKey); the rest wait. */
export const MAIL_PER_RECIPIENT_PER_HOUR = 20;
/** Emails one person may cause in 24 hours (as the sender of Prompts, questions, notices), from all their workspaces. */
export const MAIL_PER_SENDER_PER_DAY = 300;

/** Stands in a Prompt's stored text for the recipient's personal form link, which is added only when it is sent. */
export const FORM_LINK = "[your personal form link]";

/** The kinds of Delivery a person can stop by email with one click: asking for values and reminding. */
export const OPT_OUT_KINDS = ["prompt", "reminder"];

/** A plain-text email ready to go out; `replyTo` is the Delivery's own reply address, when replies come back. */
export type OutgoingMail = { to: string; subject: string; text: string; replyTo?: string; unsubscribe?: string };

/** Sends one email and returns the provider's Message-ID; tests pass their own. */
export type MailTransport = (mail: OutgoingMail) => Promise<{ messageId: string }>;

// An address as a person types it, with nothing that could start another header or name a second recipient.
const ADDRESS = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/;

/** Whether this is one plain email address, safe to put in a header. */
export const isAddress = (s: unknown): s is string => typeof s === "string" && s.length <= 254 && ADDRESS.test(s) && !/\.\.|\.$|@\./.test(s);

/** A header value, or a name people chose put into a message, on one line: line breaks (Unicode ones too) and other
 * control characters become spaces, at most 200 characters. */
export const headerSafe = (s: string) => String(s).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

/** The mailbox an address reaches, for counting mail to one person: lower case, no "+tag", and for Gmail no dots
 * (Gmail ignores both), so the same inbox is not counted as many. */
export function mailboxKey(address: string): string {
  const [local, raw = ""] = String(address).toLowerCase().trim().split("@");
  // One spelling per domain: no trailing dot, international names in their ASCII (punycode) form.
  let domain = raw.replace(/\.+$/, "");
  try { domain = new URL(`http://${domain}`).hostname; } catch { /* kept as typed; isAddress refuses most such */ }
  const gmail = domain === "gmail.com" || domain === "googlemail.com";
  const base = local.split("+")[0];
  return `${gmail ? base.replace(/\./g, "") : base}@${gmail ? "gmail.com" : domain}`;
}

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
    to: mail.to, subject: mail.subject, text: mail.text, ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    // Automated mail: no out-of-office replies to it (RFC 3834). One-click unsubscribe where it applies (RFC 8058).
    headers: {
      "Auto-Submitted": "auto-generated",
      ...(mail.unsubscribe ? { "List-Unsubscribe": `<${mail.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}),
    },
  });
  return { messageId: String(info.messageId ?? "") };
};

/** Sends one email that is not a Delivery (an invitation, whose invitee is nobody's member yet). The address must
 * be one plain address and the subject is put on one line; returns the provider's Message-ID. */
export async function sendMail(mail: OutgoingMail, transport: MailTransport = smtpTransport): Promise<string> {
  if (!mailEnabled()) throw new Error("Email is not set up.");
  if (!isAddress(mail.to)) throw new Error("Not one plain email address.");
  return (await transport({ to: mail.to, subject: headerSafe(mail.subject), text: String(mail.text) })).messageId;
}

/** Whether replies by email come back into Ziffr (spec 0004, ticket #73): sending works, ZIFFR_INBOUND_DOMAIN names
 * the domain replies go to, and ZIFFR_INBOUND_SECRET (32 characters or more) signs what the provider forwards. */
export function inboundEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return mailEnabled(env) && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(env.ZIFFR_INBOUND_DOMAIN ?? "") && (env.ZIFFR_INBOUND_SECRET ?? "").length >= 32;
}

/** The reply address of a Delivery's token. */
export const replyAddress = (token: string) => `reply+${token}@${String(process.env.ZIFFR_INBOUND_DOMAIN).toLowerCase()}`;

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
  const { data: claimed } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, subject, body, attempts, reply_token, unsubscribe_token, form_token_id")
    // Email only: a queued Slack Delivery is sent by slack-send.ts, never as an email.
    .eq("id", id).eq("connector", "email").eq("mail_state", "queued").lt("attempts", MAX_ATTEMPTS).maybeSingle();
  if (!claimed) return "skipped";
  // What never goes out, whatever the limits: it is marked failed for good, if it is still queued.
  const never = async (why: string) => {
    await db().from("deliveries").update({ mail_state: "failed", last_error: why }).eq("id", id).eq("mail_state", "queued");
    return "failed" as const;
  };
  // Settings may have gone, or the Delivery may be the demo's: nothing leaves then, and it does not try again.
  if (claimed.workspace_id === DEMO_WORKSPACE_ID || !mailEnabled()) return never("Email is not set up.");
  const to = await addressIn(claimed.workspace_id, claimed.recipient_id);
  if (!to) return never("No usable email address for this person here.");
  // Someone who stopped Prompts and reminders by email gets none, also ones queued before they stopped.
  const stoppable = OPT_OUT_KINDS.includes(claimed.kind);
  if (stoppable) {
    const { data: out } = await db().from("email_opt_outs").select("person_id").eq("workspace_id", claimed.workspace_id).eq("person_id", claimed.recipient_id).maybeSingle();
    if (out) return never("They stopped reminders by email.");
  }
  // Claimed in the database within the limits, counted by inbox and by sender across all workspaces, so neither
  // parallel sends nor many Contacts or workspaces for one inbox pass them; over a limit it waits.
  const { data: claim, error } = await db().rpc("claim_delivery_send", {
    p_id: id, p_address_key: mailboxKey(to), p_per_workspace: MAIL_PER_WORKSPACE_PER_DAY, p_per_address: MAIL_PER_RECIPIENT_PER_HOUR, p_per_sender: MAIL_PER_SENDER_PER_DAY, p_max_attempts: MAX_ATTEMPTS,
  });
  if (error) throw new Error("The email could not be claimed for sending.");
  if (claim === "wait") return "waiting";
  if (claim !== "ok") return "skipped";
  const attempts = Number(claimed.attempts) + 1;
  const fail = async (why: string) => {
    await db().from("deliveries").update({ mail_state: attempts >= MAX_ATTEMPTS ? "failed" : "queued", attempts, last_error: why.slice(0, 200) }).eq("id", id);
    return "failed" as const;
  };
  let unsubscribe: string | undefined;
  let text = String(claimed.body);
  if (text.includes(FORM_LINK)) {
    const { data: token } = claimed.form_token_id ? await db().from("tokens").select("code").eq("id", claimed.form_token_id).eq("workspace_id", claimed.workspace_id).maybeSingle() : { data: null };
    text = text.split(FORM_LINK).join(token ? `${String(process.env.ZIFFR_SITE_URL).replace(/\/+$/, "")}/submit/${token.code}` : `${String(process.env.ZIFFR_SITE_URL).replace(/\/+$/, "")}/`);
  }
  if (stoppable) {
    const token = claimed.unsubscribe_token ?? randomBytes(24).toString("base64url");
    if (!claimed.unsubscribe_token) await db().from("deliveries").update({ unsubscribe_token: token }).eq("id", id);
    unsubscribe = `${String(process.env.ZIFFR_SITE_URL).replace(/\/+$/, "")}/api/unsubscribe/${token}`;
    text += `\n\n--\nTo get no more of these by email: ${unsubscribe}`;
  }
  // Its own reply address, made the first time it is sent while replies come back (24 random bytes, unguessable).
  let replyTo: string | undefined;
  if (inboundEnabled()) {
    const token = claimed.reply_token ?? randomBytes(24).toString("base64url");
    if (!claimed.reply_token) await db().from("deliveries").update({ reply_token: token }).eq("id", id);
    replyTo = replyAddress(token);
  }
  try {
    const { messageId } = await transport({ to, subject: headerSafe(claimed.subject), text, replyTo, unsubscribe });
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
  // Chosen in the database: ones waiting out a limit (not_before) or a failed attempt's wait are left out before the
  // run's limit, so however many must wait, they hold up nobody else's.
  const { data: ids, error } = await db().rpc("due_deliveries", { p_limit: limit, p_max_attempts: MAX_ATTEMPTS });
  if (error) throw new Error("The waiting emails could not be read.");
  const due = ((ids ?? []) as (number | { due_deliveries: number })[]).map((r) => ({ id: typeof r === "number" ? r : r.due_deliveries }));
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
