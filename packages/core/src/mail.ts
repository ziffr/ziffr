// Sending email (spec 0004, ticket #71; GLOSSARY: Delivery, Connector). The Email Connector has always worded each
// Delivery; this sends it as plain text through SMTP (ZIFFR_SMTP_URL, from ZIFFR_MAIL_FROM, as the settings in
// effect have them: the environment, else the Installation Settings page). Only to a member or Contact of the
// Delivery's workspace, at the address that workspace keeps, never in the demo, and nothing at all without settings.
// Addresses are looked up when sending and never stored with the Delivery.
import { randomBytes } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "./db";
import { openRows } from "./sealed-columns";
import { archivedMetricHolds, failForGood, FORM_LINK, withFormLink } from "./internal/delivery-send";
import { checkedMailHost } from "./mail-hosts";
import { effectiveLimit } from "./limits";
import { sendingLimit } from "./sending-limit";
import { sendingLimitDefault } from "./sending-limits";
import { settingsInEffect, type Settings } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { signDigestToken } from "./usage-digest-token";
import { emailHtml, emailLogo, LOGO_CID } from "./branded-email";
import { workspaceLook } from "./workspace-look";
import { claimTrialSend, keepInOutbox, trialHoldsBack } from "./trials";

/** How often a message is tried before it counts as failed, unless ZIFFR_LIMIT_SEND_ATTEMPTS says otherwise (the default). */
export const MAX_ATTEMPTS = sendingLimitDefault("sendAttempts");

/** What a send did: sent, failed (and will be retried, or not after MAX_ATTEMPTS), or nothing to do. */
export type SendResult = "sent" | "failed" | "skipped" | "waiting";

/** Emails one workspace may send in 24 hours, unless ZIFFR_LIMIT_EMAILS_PER_WORKSPACE_PER_DAY says otherwise (the default); the rest wait in the queue. */
export const MAIL_PER_WORKSPACE_PER_DAY = sendingLimitDefault("mailPerWorkspace");
/** Emails one inbox may get in an hour, from all workspaces together (counted by mailboxKey); the rest wait. */
export const MAIL_PER_RECIPIENT_PER_HOUR = 20;
/** Emails one person may cause in 24 hours (as the sender of Prompts, questions, notices), from all their workspaces, unless ZIFFR_LIMIT_EMAILS_PER_PERSON_PER_DAY says otherwise (the default). */
export const MAIL_PER_SENDER_PER_DAY = sendingLimitDefault("mailPerPerson");

/** Stands in a Prompt's stored text for the recipient's personal form link, which is added only when it is sent. */
export { FORM_LINK };

/** The kinds of Delivery a person can stop by email with one click: asking for values and reminding. */
export const OPT_OUT_KINDS = ["prompt", "reminder"];

/** An email ready to go out: always the plain text, and with the Workspace's Theme also the same words as HTML (branded-email.ts)
 * and its logo as a picture to attach (shown as cid:ziffr-logo). `replyTo` is the Delivery's own reply address, when replies come back. */
export type OutgoingMail = { to: string; subject: string; text: string; html?: string; logo?: { content: Buffer; contentType: string }; fromName?: string; replyTo?: string; unsubscribe?: string };

/** Who really stands behind a message that goes to someone outside the Workspace, for its footer: the person, how to
 * reach them, and what they did ("invited you to", "shared a dashboard with you from"). */
export type SentBy = { name: string; email?: string | null; did: string };

/** The line that says so, in Ziffr's own words (also added to the plain text): the Workspace's brand never replaces it. */
export const sentByLine = (by: SentBy, workspace: string) => `Sent by Ziffr for ${headerSafe(by.name)}${by.email ? ` (${headerSafe(by.email)})` : ""}, who ${by.did} ${headerSafe(workspace)}.`;

/** The HTML part, logo and sender name of an email in a Workspace's Theme (GLOSSARY: Theme), for the words in `text`. The
 * From name is always "<Workspace> via <Installation's sender name>", so the brand never passes for Ziffr itself. */
export async function brandedParts(workspaceId: string, content: { text: string; stop?: { label: string; url: string } }, by?: SentBy): Promise<Pick<OutgoingMail, "html" | "logo" | "fromName">> {
  // A Theme that cannot be read never holds a message back: it goes out as plain text.
  try {
    const look = await workspaceLook(workspaceId);
    const logo = emailLogo(look) ?? undefined;
    return { html: emailHtml(look, { ...content, ...(by ? { sentBy: sentByLine(by, look.name) } : {}) }, { logo: Boolean(logo) }), ...(logo ? { logo } : {}), fromName: look.name };
  } catch {
    return {};
  }
}

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

/** Whether these settings send email: the SMTP server, a sender that is one plain address, and ZIFFR_SITE_URL, since
 * an email whose links lead nowhere is worse than none. Pass the settings in effect (or use mailOn). */
export function mailEnabled(env: Settings): boolean {
  return Boolean(env.ZIFFR_SMTP_URL) && isAddress(fromAddress(env)) && /^https?:\/\/[^\s/]+/.test(env.ZIFFR_SITE_URL ?? "");
}

// ZIFFR_MAIL_FROM may be "Ziffr <ziffr@example.com>" or just the address.
function fromAddress(env: Record<string, string | undefined>): string {
  const raw = env.ZIFFR_MAIL_FROM ?? "";
  return raw.match(/<([^>]+)>\s*$/)?.[1] ?? raw.trim();
}

/** Whether this Ziffr sends email now, by the settings in effect. */
export const mailOn = async (): Promise<boolean> => mailEnabled(await settingsInEffect());

/** The SMTP connection a mail server address names, built field by field: host, port, TLS from `smtps:`, and the
 * user and password decoded. Nothing else in the address becomes an option, so a query such as `?logger=true` or
 * `?tls.rejectUnauthorized=false` does nothing, wherever the address comes from. Null for anything that is not an
 * smtp: or smtps: address with a host. */
export function smtpOptions(address: string): { host: string; port: number; secure: boolean; auth?: { user: string; pass: string } } | null {
  let url: URL;
  try { url = new URL(address); } catch { return null; }
  if ((url.protocol !== "smtp:" && url.protocol !== "smtps:") || !url.hostname) return null;
  const secure = url.protocol === "smtps:";
  const port = url.port ? Number(url.port) : secure ? 465 : 587;
  let user = "";
  let pass = "";
  try { user = decodeURIComponent(url.username); pass = decodeURIComponent(url.password); } catch { return null; }
  // A literal IPv6 host keeps its brackets in URL.hostname; the socket wants it without.
  const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  return { host, port, secure, ...(user ? { auth: { user, pass } } : {}) };
}

let transporter: { key: string; t: Transporter } | null = null;

/** Sends through the SMTP server of these settings; the transport is made again only when the server changes. A
 * server that is not the environment's own (`ZIFFR_SMTP_URL` or its default) is resolved and checked at every send,
 * and the connection goes to the address that was checked, with TLS checking the name. */
export function smtpTransportWith(settings: Settings): MailTransport {
  return async (mail) => {
    const url = settings.ZIFFR_SMTP_URL!;
    const options = smtpOptions(url);
    if (!options) throw Object.assign(new Error("The mail server address is not an smtp: or smtps: address."), { code: "EBADADDRESS" });
    let connect: Parameters<typeof nodemailer.createTransport>[0] = options;
    // Decided by where the address came from, never by a second lookup that could fail open: only the one the
    // environment sets (or its default, Docker's Mailpit) is used as it is; every other one is checked.
    const fromEnvironment = [process.env.ZIFFR_SMTP_URL, process.env.ZIFFR_SMTP_URL_DEFAULT].some((v) => typeof v === "string" && v.trim() !== "" && v === url);
    if (!fromEnvironment) {
      const pinned = await checkedMailHost(options.host);
      connect = { ...options, host: pinned.address, ...(pinned.servername ? { tls: { servername: pinned.servername } } : {}) };
    }
    const key = `${url}\n${(connect as { host: string }).host}`;
    if (transporter?.key !== key) {
      transporter?.t.close();
      transporter = { key, t: nodemailer.createTransport(connect) };
    }
    const from = settings.ZIFFR_MAIL_FROM!;
    const name = from.match(/^\s*([^<]+?)\s*</)?.[1];
    const info = await transporter.t.sendMail({
      // "<Workspace> via Ziffr": the Workspace's name is a label, Ziffr's own sender name stays in it.
      from: mail.fromName ? { name: headerSafe(`${mail.fromName.replace(/["<>@]/g, "")} via ${name ?? "Ziffr"}`), address: fromAddress(settings) } : name ? { name: headerSafe(name), address: fromAddress(settings) } : fromAddress(settings),
      to: mail.to, subject: mail.subject, text: mail.text, ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
      ...(mail.html ? { html: mail.html } : {}),
      ...(mail.html && mail.logo ? { attachments: [{ filename: mail.logo.contentType === "image/png" ? "logo.png" : "logo.jpg", cid: LOGO_CID, content: mail.logo.content, contentType: mail.logo.contentType, contentDisposition: "inline" as const }] } : {}),
      // Automated mail: no out-of-office replies to it (RFC 3834). One-click unsubscribe where it applies (RFC 8058).
      headers: {
        "Auto-Submitted": "auto-generated",
        ...(mail.unsubscribe ? { "List-Unsubscribe": `<${mail.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}),
      },
    });
    return { messageId: String(info.messageId ?? "") };
  };
}

/** The SMTP transport of the settings in effect when it sends. */
export const smtpTransport: MailTransport = async (mail) => smtpTransportWith(await settingsInEffect())(mail);

/** Sends one email that is not a Delivery (an invitation, whose invitee is nobody's member yet). The address must
 * be one plain address and the subject is put on one line; returns the provider's Message-ID. */
export async function sendMail(mail: OutgoingMail, transport: MailTransport = smtpTransport): Promise<string> {
  if (!(await mailOn())) throw new Error("Email is not set up.");
  if (!isAddress(mail.to)) throw new Error("Not one plain email address.");
  return (await transport({ to: mail.to, subject: headerSafe(mail.subject), text: String(mail.text), ...(mail.html ? { html: mail.html } : {}), ...(mail.logo ? { logo: mail.logo } : {}), ...(mail.fromName ? { fromName: mail.fromName } : {}), ...(mail.unsubscribe ? { unsubscribe: mail.unsubscribe } : {}) })).messageId;
}

/** Whether replies by email come back into Ziffr with these settings (spec 0004, ticket #73): sending works,
 * ZIFFR_INBOUND_DOMAIN names the domain replies go to, and ZIFFR_INBOUND_SECRET (32 characters or more) signs what
 * the provider forwards. Pass the settings in effect (or use inboundOn). */
export function inboundEnabled(env: Settings): boolean {
  return mailEnabled(env) && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(env.ZIFFR_INBOUND_DOMAIN ?? "") && (env.ZIFFR_INBOUND_SECRET ?? "").length >= 32;
}

/** Whether replies by email come back now, by the settings in effect. */
export const inboundOn = async (): Promise<boolean> => inboundEnabled(await settingsInEffect());

/** The reply address of a Delivery's token, at the replies domain of these settings. */
export const replyAddress = (token: string, settings: Settings) => `reply+${token}@${String(settings.ZIFFR_INBOUND_DOMAIN).toLowerCase()}`;

/** The state a new Delivery starts in with these settings: queued when it will really be emailed, else it stays in
 * the Outbox. */
export function initialMailState(connector: string, workspaceId: string, settings: Settings): "queued" | "outbox" {
  return connector === "email" && workspaceId !== DEMO_WORKSPACE_ID && mailEnabled(settings) ? "queued" : "outbox";
}

/** The address a workspace keeps for a person: a Contact's stored one, or a member's own (proven at sign-in). Null
 * for anyone who is neither in that workspace, or has no usable address. */
export async function addressIn(workspaceId: string, personId: string): Promise<string | null> {
  const [{ data: contact }, { data: member }] = await Promise.all([
    db().from("contacts").select("person_id, email").eq("workspace_id", workspaceId).eq("person_id", personId).maybeSingle().then(async (r) => ({ data: r.data ? (await openRows("contacts", workspaceId, [r.data]))[0] : null })),
    db().from("memberships").select("user_id").eq("workspace_id", workspaceId).eq("user_id", personId).maybeSingle(),
  ]);
  let address: string | null = null;
  if (contact) address = contact.email ?? null;
  else if (member) address = ((await db().from("profiles").select("email").eq("id", personId).maybeSingle()).data?.email as string | null) ?? null;
  return isAddress(address) ? address : null;
}

/** Sends one queued Delivery. It is claimed first, so the immediate send and the retry job never both send it. */
export async function sendDelivery(id: number, transport: MailTransport = smtpTransport): Promise<SendResult> {
  const maxAttempts = await sendingLimit("sendAttempts");
  const { data: found } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, subject, body, attempts, reply_token, unsubscribe_token, form_token_id, prompt_id, action_id, alert_metric_id, alert_id, heads_up_metric_a, heads_up_metric_b, tell_workflow_id")
    // Email only: a queued Slack Delivery is sent by slack-send.ts, never as an email.
    .eq("id", id).eq("connector", "email").eq("mail_state", "queued").lt("attempts", maxAttempts).maybeSingle();
  if (!found) return "skipped";
  const [claimed] = await openRows("deliveries", found.workspace_id, [found]);
  // What never goes out, whatever the limits: it is marked failed for good, if it is still queued.
  const never = (why: string) => failForGood(id, why);
  // Words that do not open (changed in the database, or under a destroyed key) never go out, not even as "null".
  if (claimed.body === null || (found.subject !== null && claimed.subject === null)) return never("Its text cannot be read any more.");
  // Nothing goes out for an Archived Metric, also when it was archived after this was queued.
  const archived = await archivedMetricHolds(claimed);
  if (archived) return never(archived);
  // Settings may have gone, or the Delivery may be the demo's: nothing leaves then, and it does not try again.
  // A trial reaches only people who accepted, never a Contact, whatever is set up (ADR 0015).
  const held = await trialHoldsBack(claimed.workspace_id, claimed.recipient_id);
  if (held) return keepInOutbox(id, held);
  // One reading of the settings for the whole send, so it cannot change half way.
  const settings = await settingsInEffect();
  if (claimed.workspace_id === DEMO_WORKSPACE_ID || !mailEnabled(settings)) return never("Email is not set up.");
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
  // The usage digest (spec 0031): one switch per person for every Workspace, also for one queued before they used it.
  const digest = claimed.kind === "digest";
  if (digest) {
    const { data: out } = await db().from("usage_digest_opt_outs").select("person_id").eq("person_id", claimed.recipient_id).maybeSingle();
    if (out) return never("They stopped the usage digest.");
    // Owners only, also when they were demoted while it waited: it names what an Owner sees.
    const { data: role } = await db().from("memberships").select("role").eq("workspace_id", claimed.workspace_id).eq("user_id", claimed.recipient_id).maybeSingle();
    if (role?.role !== "owner") return never("They are not an Owner of this workspace.");
  }
  const trial = await claimTrialSend(id);
  if (trial === "wait") return "waiting";
  if (trial === "gone") return "skipped";
  const perWorkspace = await sendingLimit("mailPerWorkspace");
  // The share of the Workspace's daily emails that Alert messages may use (spec 0032, ticket #518); the rest is kept for Prompts, tasks and the like.
  const alertShare = await effectiveLimit("alertMailShare", claimed.workspace_id as string);
  const { data: claim, error } = await db().rpc("claim_delivery_send", {
    p_id: id, p_address_key: mailboxKey(to), p_per_workspace: perWorkspace, p_per_address: MAIL_PER_RECIPIENT_PER_HOUR, p_per_sender: await sendingLimit("mailPerPerson"), p_max_attempts: maxAttempts, p_alerts_per_workspace: Math.floor(perWorkspace * alertShare / 100),
  });
  if (error) throw new Error("The email could not be claimed for sending.");
  if (claim === "wait") return "waiting";
  if (claim !== "ok") return "skipped";
  const attempts = Number(claimed.attempts) + 1;
  const fail = async (why: string) => {
    await db().from("deliveries").update({ mail_state: attempts >= maxAttempts ? "failed" : "queued", attempts, last_error: why.slice(0, 200) }).eq("id", id);
    return "failed" as const;
  };
  let unsubscribe: string | undefined;
  let text = await withFormLink(String(claimed.body), claimed, String(settings.ZIFFR_SITE_URL));
  // The same words again as HTML in the Workspace's Theme; the plain text below is sent with it, always.
  const words = text;
  let stop: { label: string; url: string } | undefined;
  // An Alert email has a one-click link of its own that pauses that Alert only (email-opt-out.ts).
  // (the daily limit note names no Alert and has no link: deliveryFor would refuse it)
  if (stoppable || (claimed.kind === "alert" && (claimed.alert_id || claimed.tell_workflow_id))) {
    const token = claimed.unsubscribe_token ?? randomBytes(24).toString("base64url");
    if (!claimed.unsubscribe_token) await db().from("deliveries").update({ unsubscribe_token: token }).eq("id", id);
    unsubscribe = `${String(settings.ZIFFR_SITE_URL).replace(/\/+$/, "")}/api/unsubscribe/${token}`;
    stop = { label: claimed.tell_workflow_id ? "To stop being told by this Workflow" : claimed.kind === "alert" ? "To pause this Alert" : "To get no more of these by email", url: unsubscribe };
    text += `\n\n--\n${stop.label}: ${unsubscribe}`;
  }
  if (digest) {
    // A signed link that stops it with no sign-in (usage-digest-token.ts); an Installation with no key to sign it
    // sends none rather than one that cannot be stopped.
    const token = signDigestToken(claimed.recipient_id);
    if (!token) return fail("No key to sign the unsubscribe link.");
    unsubscribe = `${String(settings.ZIFFR_SITE_URL).replace(/\/+$/, "")}/api/unsubscribe/digest/${token}`;
    stop = { label: "To get no more of these emails", url: unsubscribe };
    text += `\n\n--\n${stop.label}: ${unsubscribe}`;
  }
  // Its own reply address, made the first time it is sent while replies come back (24 random bytes, unguessable).
  let replyTo: string | undefined;
  // An Alert cannot be answered (GLOSSARY: Alert): its email has no reply address of its own.
  if (!digest && inboundEnabled(settings) && claimed.kind !== "alert" && claimed.kind !== "heads_up") {
    const token = claimed.reply_token ?? randomBytes(24).toString("base64url");
    if (!claimed.reply_token) await db().from("deliveries").update({ reply_token: token }).eq("id", id);
    replyTo = replyAddress(token, settings);
  }
  try {
    const parts = await brandedParts(claimed.workspace_id, { text: words, stop });
    const { messageId } = await (transport === smtpTransport ? smtpTransportWith(settings) : transport)({ to, subject: headerSafe(claimed.subject), text, ...parts, replyTo, unsubscribe });
    await db().from("deliveries").update({ mail_state: "sent", attempts, sent_at: new Date().toISOString(), provider_id: messageId.slice(0, 300) || null, last_error: null }).eq("id", id);
    return "sent";
  } catch (e) {
    // The server's own words may hold addresses or settings: only its kind of failure is kept.
    // Workspace members read this on the Connectors page: the Installation's own checks of its mail host are none of
    // their business, so those codes become a plain "error".
    const code = (e as { code?: string }).code;
    return fail(`The mail server refused it (${code && !["EPRIVATEHOST", "EDNS", "EBADADDRESS"].includes(code) ? code : "error"}).`);
  }
}

/** Marks queued Deliveries of a Connector that already used as many tries as the limit now allows as failed, so a lowered
 * ZIFFR_LIMIT_SEND_ATTEMPTS never leaves a message queued forever: the Outbox shows it. */
export async function giveUpAfter(maxAttempts: number, connector: "email" | "telegram" | "slack"): Promise<void> {
  await db().from("deliveries").update({ mail_state: "failed", last_error: `Gave up after ${maxAttempts} tries.` }).eq("connector", connector).eq("mail_state", "queued").gte("attempts", maxAttempts);
}

/** Sends what is waiting: queued Deliveries whose wait after the last attempt is over (1, 2, 4, 8 minutes), and ones
 * left "sending" for over ten minutes by a stopped server. At most `limit` per run. */
export async function sendWaiting(limit = 50, transport: MailTransport = smtpTransport): Promise<{ sent: number; failed: number }> {
  const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
  await db().from("deliveries").update({ mail_state: "queued" }).eq("mail_state", "sending").lt("last_attempt_at", tenMinutesAgo);
  // Chosen in the database: ones waiting out a limit (not_before) or a failed attempt's wait are left out before the
  // run's limit, so however many must wait, they hold up nobody else's.
  const maxAttempts = await sendingLimit("sendAttempts");
  await giveUpAfter(maxAttempts, "email");
  const { data: ids, error } = await db().rpc("due_deliveries", { p_limit: limit, p_max_attempts: maxAttempts });
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
