// Replies by email (spec 0004, ticket #73; GLOSSARY: Delivery, Thread, Prompt, Correction). A provider forwards a
// raw message to the webhook; it is taken only for a known reply token, from the address the Delivery went to,
// within 30 days, once. Then it goes the way a simulated reply always went (reply-routing.ts, shared with Slack): a
// Prompt's answer through submitValue (source mail), a reply about a question or task into its Thread, a
// "Correction:" line as a proposed Correction.
import { createHmac, timingSafeEqual } from "node:crypto";
import PostalMime from "postal-mime";
import { db } from "./db";
import { addressIn, brandedParts, headerSafe, isAddress, mailOn, sendMail, type MailTransport } from "./mail";
import { settingsInEffect } from "./settings-in-effect";
import { REPLY_DAYS, routeReply } from "./reply-routing";
import type { SubmissionEffects } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { trialEnded } from "./trials";
import { inboxOf } from "./sign-in-limits";
import { createHash } from "node:crypto";
import { takeReplyTest } from "./installation-replies";
import { holdReply } from "./held-replies";

/** Largest raw message taken, in bytes. */
export const MAX_INBOUND_BYTES = 1024 * 1024;
/** Replies taken for one Delivery; more are ignored. */
export const MAX_REPLIES_PER_DELIVERY = 20;
/** Messages taken from one sender in an hour: far more than a person replies, few enough that a flood stops soon. */
export const INBOUND_PER_SENDER = 30;
/** Messages looked at by the whole Installation in an hour, counted apart for vouched and unvouched mail: a ceiling on the work a flood can cause, set
 * far above what real replies need, which have their own total below. */
export const INBOUND_ALL = 10_000;
/** Refusals recorded for one Delivery in an hour (wrong sender, expired, unvouched); beyond it they are not written. */
export const REFUSALS_PER_DELIVERY = 50;
/** Messages naming a real reply address for their recipient, taken by the whole Installation in an hour. */
export const INBOUND_TOTAL = 1000;

/** What the webhook found in a message: the reply tokens it was sent to, who sent it, its new text, its Message-ID,
 * whether it was written by a machine (an out-of-office reply), which is never taken, and whether the receiving
 * provider vouched for the sender (see senderVerified). */
export type InboundEmail = { tokens: string[]; from: string | null; text: string; messageId: string | null; automatic: boolean; verified: boolean;
  /** The named provider said, in its own topmost Authentication-Results, that DMARC failed for the sender's domain: a positive sign of forgery (see senderFailed). */
  failed?: boolean };

/** What became of an inbound email, for the provider's logs; it never says more than the outcome's name. */
export type InboundOutcome =
  | "recorded" | "refused" | "form_link" | "replied" | "corrected"
  | "held" | "unknown_token" | "expired" | "wrong_sender" | "unverified" | "automatic" | "duplicate" | "too_many" | "empty" | "limited" | "test";

/** An Authentication-Results value (RFC 8601) as its parts: the authserv-id, then one result per method, lower case.
 * Comments in parentheses and quoted strings are taken out first, so text the sender controls inside them (an
 * envelope address such as "a;dkim=pass"@x, a comment) can never read as a separator or a result of its own. */
export function authResults(value: string): string[] {
  let out = "";
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\" && (quoted || depth > 0)) { i++; continue; }
    if (quoted) { if (c === '"') quoted = false; continue; }
    if (depth > 0) { if (c === "(") depth++; else if (c === ")") depth--; continue; }
    if (c === '"') { quoted = true; out += "q"; continue; }
    if (c === "(") { depth = 1; out += " "; continue; }
    out += c;
  }
  return out.split(";").map((part) => part.replace(/\s+/g, " ").trim().toLowerCase());
}

/** Whether the provider that received the message vouched for its From address. A From header is written by whoever
 * sends, so on its own it proves nothing: only the topmost Authentication-Results header counts, and only when it is
 * by the provider named in ZIFFR_INBOUND_AUTHSERV_ID (it adds it above all others), with DMARC passed for the
 * From address's domain, or DKIM passed for that very domain. False when the setting is not there. */
export function senderVerified(headers: { key: string; value: string }[], from: string | null, authservId: string | undefined): boolean {
  if (!authservId || !from) return false;
  const fromDomain = from.split("@")[1] ?? "";
  // Only the topmost one: the receiving provider adds its own above everything the sender wrote, and a sender can
  // write one that names the provider further down.
  const top = headers.find((h) => h.key.toLowerCase() === "authentication-results");
  if (!top) return false;
  const [id, ...results] = authResults(top.value);
  if (id.split(/\s+/)[0] !== authservId.toLowerCase()) return false;
  return results.some((r) => {
    const method = /^(dmarc|dkim)\s*=\s*([a-z]+)/.exec(r);
    if (!method || method[2] !== "pass") return false;
    const domain = new RegExp(`(?:^|\\s)${method[1] === "dmarc" ? "header\\.from" : "header\\.d"}\\s*=\\s*([^\\s]+)`).exec(r)?.[1];
    return domain === fromDomain;
  });
}

/** Whether the provider named in ZIFFR_INBOUND_AUTHSERV_ID said, in the topmost Authentication-Results it wrote, that DMARC
 * failed for the From address's domain. That is a verdict against the sender, not just a missing vouch: such mail is
 * refused and no one is emailed about it, so a forger cannot make Ziffr send the person a link to confirm. */
export function senderFailed(headers: { key: string; value: string }[], from: string | null, authservId: string | undefined): boolean {
  if (!authservId || !from) return false;
  const top = headers.find((h) => h.key.toLowerCase() === "authentication-results");
  if (!top) return false;
  const [id, ...results] = authResults(top.value);
  if (id.split(/\s+/)[0] !== authservId.toLowerCase()) return false;
  const fromDomain = from.split("@")[1] ?? "";
  return results.some((r) => /^dmarc\s*=\s*fail\b/.test(r) && /(?:^|\s)header\.from\s*=\s*([^\s]+)/.exec(r)?.[1] === fromDomain);
}

/** Whether a forwarded body was signed a moment ago (within five minutes) with ZIFFR_INBOUND_SECRET of the settings
 * in effect: `sha256=<hex>` of the HMAC-SHA256 of "<timestamp>.<body>", compared in constant time. */
export async function inboundSigned(timestamp: string, signature: string, body: Uint8Array): Promise<boolean> {
  const sig = /^sha256=([0-9a-f]{64})$/i.exec(signature)?.[1];
  if (!/^\d{9,11}$/.test(timestamp) || !sig || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const secret = (await settingsInEffect()).ZIFFR_INBOUND_SECRET;
  if (!secret) return false;
  const mac = createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest();
  const given = Buffer.from(sig, "hex");
  return given.length === mac.length && timingSafeEqual(given, mac);
}

/** Reads a raw message (RFC 5322). Throws for anything that cannot be parsed. */
export async function parseInbound(raw: ArrayBuffer | Uint8Array | string): Promise<InboundEmail> {
  const email = await PostalMime.parse(raw, { maxNestingDepth: 20 });
  const settings = await settingsInEffect();
  const domain = String(settings.ZIFFR_INBOUND_DOMAIN ?? "").toLowerCase();
  const recipients = [...(email.to ?? []), ...(email.cc ?? [])].flatMap((a) => ("group" in a && a.group ? a.group : [a])).map((m) => ("address" in m ? m.address : "") ?? "");
  if (email.deliveredTo) recipients.push(email.deliveredTo);
  // The token's letters keep their case (it is base64url); only the domain is compared without it.
  const tokens = [...new Set(recipients.flatMap((r) => {
    const m = /^reply\+([A-Za-z0-9_-]{32})@([^@\s]+)$/.exec(r.trim());
    return m && m[2].toLowerCase() === domain ? [m[1]] : [];
  }))];
  const from = email.from && "address" in email.from && isAddress(email.from.address?.toLowerCase()) ? email.from.address!.toLowerCase() : null;
  const header = (name: string) => email.headers.find((h) => h.key === name)?.value?.toLowerCase() ?? "";
  // RFC 3834 and the usual markers of auto-replies: answering those would start a loop.
  const automatic = (header("auto-submitted") !== "" && header("auto-submitted") !== "no") || /^(auto_reply|bulk|junk|list)$/.test(header("precedence")) || header("x-autoreply") !== "" || header("x-autorespond") !== "";
  const text = newText(email.text ?? stripHtml(email.html ?? ""));
  const parts = email.headers.map((h) => ({ key: h.key, value: h.value }));
  const verified = senderVerified(parts, from, settings.ZIFFR_INBOUND_AUTHSERV_ID);
  const failed = !verified && senderFailed(parts, from, settings.ZIFFR_INBOUND_AUTHSERV_ID);
  return { tokens, from, text, messageId: email.messageId ? headerSafe(email.messageId).slice(0, 300) : null, automatic, verified, failed };
}

/** HTML as plain text, for replies that have no text part. */
function stripHtml(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** What the person wrote now: the text above the quoted message ("On … wrote:", "> …", "-----Original Message-----",
 * the German "Am … schrieb") and above a signature ("-- "), at most 5,000 characters. */
export function newText(text: string): string {
  const out: string[] = [];
  for (const line of String(text).replace(/\r\n?/g, "\n").split("\n")) {
    if (/^>/.test(line) || /^-- ?$/.test(line) || /^-{2,}\s*(Original Message|Ursprüngliche Nachricht)/i.test(line) || /^(On|Am) .+ (wrote|schrieb)\b.*:\s*$/i.test(line) || /^From: .+/i.test(line) && out.length > 0) break;
    out.push(line);
  }
  return out.join("\n").trim().slice(0, 5000);
}

/** Whether one more message may be counted against this key this hour, and counts it if so. A database that does not
 * answer takes nothing: failing open would turn the limit off when it is needed. */
async function claimInbound(what: string, limit: number): Promise<boolean> {
  const key = createHash("sha256").update(`ziffr-inbound:${what}`).digest("hex");
  const { data, error } = await db().rpc("claim_inbound_email", { p_key: key, p_limit: limit });
  return !error && data === true;
}

/** Takes one inbound email. Every check that can refuse it comes before anything is changed. */
export async function receiveEmail(email: InboundEmail, effects: { submission?: SubmissionEffects; transport?: MailTransport } = {}): Promise<InboundOutcome> {
  if (email.automatic) return "automatic";
  // A flood from one sender stops here, before any reply token is looked up. Counted by the inbox it comes from, in a
  // bucket of its own when the receiving provider did not vouch for it: mail forged in someone's name only uses up
  // the forged bucket, never theirs.
  // Mail without a sender is answered by nobody and counted against nobody's bucket.
  if (!email.from) return "wrong_sender";
  // The sender's own count first, so a sender past it stops counting anywhere else; then the ceiling on work, kept
  // apart for mail the provider vouched for, so a flood of forged mail never uses up what real senders rely on.
  const vouched = email.verified ? "vouched" : "unvouched";
  if (!(await claimInbound(`${vouched}:${inboxOf(email.from)}`, INBOUND_PER_SENDER))) return "limited";
  if (!(await claimInbound(`all:${vouched}`, INBOUND_ALL))) return "limited";
  const token = email.tokens[0];
  if (!token) return "unknown_token";
  const { data: d } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, prompt_id, connector, created_at").eq("reply_token", token).maybeSingle();
  // A reply to an Installation Admin's test of replies (installation-replies.ts) is no Delivery's and reaches no Workspace.
  if (!d && (await takeReplyTest(token, email))) return "test";
  if (!d || d.connector !== "email" || d.workspace_id === DEMO_WORKSPACE_ID) return "unknown_token";
  // An ended trial takes no reply and answers none, as if the message were too old (spec 0021).
  if (Date.now() - new Date(d.created_at).getTime() > REPLY_DAYS * 86_400_000 || (await trialEnded(d.workspace_id))) return log(d, "expired");
  // Only the person it went to, at the address the workspace keeps for them now: a forwarded copy answers nothing.
  const address = await addressIn(d.workspace_id, d.recipient_id);
  if (!address || !email.from || email.from !== address.toLowerCase()) return log(d, "wrong_sender");
  // A From header can be forged by anyone holding the email (a forwarded copy). Approvals, which change what is
  // published, are only given in Ziffr, or by email when the provider vouched for the sender. Anything else from a
  // sender nobody vouched for (no provider named, or its Authentication-Results did not pass) is held: it changes
  // nothing until the person confirms it with a link sent to the address on file (held-replies.ts, ticket #513).
  // A provider that says DMARC failed has told us it is forged: refused, with nobody emailed.
  if (!email.verified && (email.failed || (d.action_id && (await isApproval(d.workspace_id, d.action_id))))) return log(d, "unverified");
  // The Installation's total counts only mail that got this far, naming a real reply address for its own recipient:
  // junk to made-up addresses cannot use up what real replies need.
  if (!(await claimInbound("total", INBOUND_TOTAL))) return log(d, "limited");
  // Only replies that were taken count, so refused ones (from someone else) cannot use up the person's own.
  const { count } = await db().from("inbound_emails").select("id", { count: "exact", head: true }).eq("delivery_id", d.id).not("outcome", "in", "(expired,wrong_sender,unverified,too_many,limited,held)");
  if ((count ?? 0) >= MAX_REPLIES_PER_DELIVERY) return log(d, "too_many");
  // Claimed by its Message-ID first, so the same message delivered twice is taken once.
  const { data: claim, error } = await db().from("inbound_emails").insert({ message_id: email.messageId, delivery_id: d.id, workspace_id: d.workspace_id, outcome: "taken" }).select("id").single();
  if (error?.code === "23505") return "duplicate";
  if (error || !claim) throw new Error("The email could not be recorded.");
  const say = (subject: string, text: string, link?: string) => answer(d.workspace_id, address, subject, text, link, effects.transport);
  if (email.verified) {
    const outcome = await routeReply(d, email.text, { source: "mail", sender: address, answer: say }, effects.submission);
    await db().from("inbound_emails").update({ outcome }).eq("id", claim.id);
    return outcome;
  }
  // Nobody vouched for the sender, who may be a forger holding a forwarded copy: the person is emailed only the
  // confirmation link of a reply that would change something, never a refusal, so nothing a forger sends can fill their
  // inbox with those; and only a held reply counts, to a limit of its own, against the Delivery's replies.
  const outcome = await holdReply(d, email.text, address, async () => {});
  await db().from("inbound_emails").update({ outcome: outcome === "held" ? "held" : "unverified" }).eq("id", claim.id);
  return outcome;
}

// A Self-check decides whether a value counts just as an Approval does, so it needs a verified sender too.
async function isApproval(ws: string, actionId: number): Promise<boolean> {
  const { data } = await db().from("actions").select("purpose").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  return data?.purpose === "approval" || data?.purpose === "self_check";
}

type DeliveryRow = { id: number; workspace_id: string; recipient_id: string; kind: string; action_id: number | null; prompt_id: number | null };

async function log(d: DeliveryRow, outcome: InboundOutcome): Promise<InboundOutcome> {
  // Someone holding a real reply address could otherwise write a refusal row per message: past the limit for this
  // Delivery, refusals are answered the same but no longer recorded.
  if (!(await claimInbound(`refused:${d.id}`, REFUSALS_PER_DELIVERY))) return outcome;
  // A refusal is noted once, without the Message-ID claim, so the real reply can still come in afterwards.
  await db().from("inbound_emails").insert({ message_id: null, delivery_id: d.id, workspace_id: d.workspace_id, outcome });
  return outcome;
}

/** A short answer to the person who wrote, from Ziffr's own address (no reply address: it needs no answer), in the
 * look of the Workspace whose message they answered. */
async function answer(workspaceId: string, to: string, subject: string, text: string, link?: string, transport?: MailTransport) {
  if (!(await mailOn())) return;
  const action = link ? { label: "Open your form", url: link } : undefined;
  try {
    await sendMail({ to, subject, text, action, ...(await brandedParts(workspaceId, { text, action })) }, workspaceId, transport);
  } catch {
    // The reply itself was taken; a lost confirmation is not worth failing it for.
  }
}
