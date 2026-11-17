// Replies by email (spec 0004, ticket #73; GLOSSARY: Delivery, Thread, Prompt, Correction). A provider forwards a
// raw message to the webhook; it is taken only for a known reply token, from the address the Delivery went to,
// within 30 days, once. Then it goes the way a simulated reply always went (reply-routing.ts, shared with Slack): a
// Prompt's answer through submitValue (source mail), a reply about a question or task into its Thread, a
// "Correction:" line as a proposed Correction.
import PostalMime from "postal-mime";
import { db } from "./db";
import { addressIn, headerSafe, isAddress, mailEnabled, sendMail, type MailTransport } from "./mail";
import { routeReply } from "./reply-routing";
import type { SubmissionEffects } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { trialEnded } from "./trials";

/** Largest raw message taken, in bytes. */
export const MAX_INBOUND_BYTES = 1024 * 1024;
/** Replies taken for one Delivery; more are ignored. */
export const MAX_REPLIES_PER_DELIVERY = 20;
/** How long a reply address works. */
const REPLY_DAYS = 30;

/** What the webhook found in a message: the reply tokens it was sent to, who sent it, its new text, its Message-ID,
 * whether it was written by a machine (an out-of-office reply), which is never taken, and whether the receiving
 * provider vouched for the sender (see senderVerified). */
export type InboundEmail = { tokens: string[]; from: string | null; text: string; messageId: string | null; automatic: boolean; verified: boolean };

/** What became of an inbound email, for the provider's logs; it never says more than the outcome's name. */
export type InboundOutcome =
  | "recorded" | "refused" | "form_link" | "replied" | "corrected"
  | "unknown_token" | "expired" | "wrong_sender" | "unverified" | "automatic" | "duplicate" | "too_many" | "empty";

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
export function senderVerified(headers: { key: string; value: string }[], from: string | null, authservId = process.env.ZIFFR_INBOUND_AUTHSERV_ID): boolean {
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

/** Reads a raw message (RFC 5322). Throws for anything that cannot be parsed. */
export async function parseInbound(raw: ArrayBuffer | Uint8Array | string): Promise<InboundEmail> {
  const email = await PostalMime.parse(raw, { maxNestingDepth: 20 });
  const domain = String(process.env.ZIFFR_INBOUND_DOMAIN ?? "").toLowerCase();
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
  const verified = senderVerified(email.headers.map((h) => ({ key: h.key, value: h.value })), from);
  return { tokens, from, text, messageId: email.messageId ? headerSafe(email.messageId).slice(0, 300) : null, automatic, verified };
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

/** Takes one inbound email. Every check that can refuse it comes before anything is changed. */
export async function receiveEmail(email: InboundEmail, effects: { submission?: SubmissionEffects; transport?: MailTransport } = {}): Promise<InboundOutcome> {
  if (email.automatic) return "automatic";
  const token = email.tokens[0];
  if (!token) return "unknown_token";
  const { data: d } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, prompt_id, connector, created_at").eq("reply_token", token).maybeSingle();
  if (!d || d.connector !== "email" || d.workspace_id === DEMO_WORKSPACE_ID) return "unknown_token";
  // An ended trial takes no reply and answers none, as if the message were too old (spec 0021).
  if (Date.now() - new Date(d.created_at).getTime() > REPLY_DAYS * 86_400_000 || (await trialEnded(d.workspace_id))) return log(d, "expired");
  // Only the person it went to, at the address the workspace keeps for them now: a forwarded copy answers nothing.
  const address = await addressIn(d.workspace_id, d.recipient_id);
  if (!address || !email.from || email.from !== address.toLowerCase()) return log(d, "wrong_sender");
  // A From header can be forged by anyone holding the email (a forwarded copy). With a provider named to vouch for
  // senders, nothing unvouched is taken; without one, Approvals, which change what is published, are only given in
  // Ziffr, never by email.
  if (!email.verified && (process.env.ZIFFR_INBOUND_AUTHSERV_ID || (d.action_id && (await isApproval(d.workspace_id, d.action_id))))) return log(d, "unverified");
  // Only replies that were taken count, so refused ones (from someone else) cannot use up the person's own.
  const { count } = await db().from("inbound_emails").select("id", { count: "exact", head: true }).eq("delivery_id", d.id).not("outcome", "in", "(expired,wrong_sender,unverified,too_many)");
  if ((count ?? 0) >= MAX_REPLIES_PER_DELIVERY) return log(d, "too_many");
  // Claimed by its Message-ID first, so the same message delivered twice is taken once.
  const { data: claim, error } = await db().from("inbound_emails").insert({ message_id: email.messageId, delivery_id: d.id, workspace_id: d.workspace_id, outcome: "taken" }).select("id").single();
  if (error?.code === "23505") return "duplicate";
  if (error || !claim) throw new Error("The email could not be recorded.");
  const outcome = await routeReply(d, email.text, { source: "mail", sender: address, answer: (subject, text) => answer(address, subject, text, effects.transport) }, effects.submission);
  await db().from("inbound_emails").update({ outcome }).eq("id", claim.id);
  return outcome;
}

async function isApproval(ws: string, actionId: number): Promise<boolean> {
  const { data } = await db().from("actions").select("purpose").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  return data?.purpose === "approval";
}

type DeliveryRow = { id: number; workspace_id: string; recipient_id: string; kind: string; action_id: number | null; prompt_id: number | null };

async function log(d: DeliveryRow, outcome: InboundOutcome): Promise<InboundOutcome> {
  // A refusal is noted once, without the Message-ID claim, so the real reply can still come in afterwards.
  await db().from("inbound_emails").insert({ message_id: null, delivery_id: d.id, workspace_id: d.workspace_id, outcome });
  return outcome;
}

/** A short answer to the person who wrote, from Ziffr's own address (no reply address: it needs no answer). */
async function answer(to: string, subject: string, text: string, transport?: MailTransport) {
  if (!mailEnabled()) return;
  try {
    await sendMail({ to, subject, text }, transport);
  } catch {
    // The reply itself was taken; a lost confirmation is not worth failing it for.
  }
}
