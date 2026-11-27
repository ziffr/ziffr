// Held Replies (ticket #513 part b; GLOSSARY: Held Reply, Delivery). A reply by email that no provider vouched for
// (ZIFFR_INBOUND_AUTHSERV_ID empty, or the provider's Authentication-Results did not pass) changes nothing yet: it waits
// here while Ziffr emails the address the Workspace keeps for the person it went to, never the address it came from,
// with a one-time link. Only the person who can read that mailbox can confirm it, so a forged sender never sees the
// link. The link's token is 32 random bytes; the table keeps its hash only, and the reply's words sealed with a key made
// from the token itself, so a copy of the table alone confirms and reads nothing (the email's own words, which carry the
// link, are sealed with the Workspace Key like every Delivery's). A link works once, for HELD_REPLY_HOURS,
// and answers the same ("not known") when the token is unknown, expired or used. Confirming then takes the reply the way
// a vouched-for one always went (reply-routing.ts). A reply to a request for one figure or several is read first without
// writing anything (prompt-reply.ts): the page lists what confirming would record and which notes it would save, and an
// offer a note makes is a second button instead of a "yes" by email (spec 0064).
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { parseReply } from "./connectors/index";
import { deliverNotice, refFor } from "./deliveries";
import { addressIn } from "./mail";
import { recordAudit } from "./audit-log";
import { asksForValues, REPLY_DAYS, routeReply, type RepliedDelivery } from "./reply-routing";
import { NOTE_FIELD_QUESTION } from "./ask-note";
import { takePromptReply, withoutFormLinks, type NoteField, type OfferChoice } from "./prompt-reply";
import { submissionEffects } from "./submissions";
import { answerSourceOf } from "./prompt-ways";
import { DEMO_WORKSPACE_ID } from "./team";
import { trialEnded } from "./trials";

/** How long the confirmation link works. */
export const HELD_REPLY_HOURS = 48;
/** Replies of one Delivery that may wait at once; more are refused, so a holder of a forwarded copy cannot fill the person's inbox. */
export const HELD_PER_DELIVERY = 3;
/** The longest reply held. The confirm page shows all of it, so what the person confirms is exactly what is taken. */
const HELD_CHARS = 5000;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Seals a reply's text so it opens only with the token: AES-256-GCM, bound to its Delivery, as base64 of iv, tag and text. */
function seal(token: string, deliveryId: number, text: string): string {
  const key = Buffer.from(hkdfSync("sha256", token, "", "ziffr held reply", 32));
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(`held-reply:${deliveryId}`));
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

/** The text sealed by seal(), or null when the token or the Delivery is not the one it was sealed for. */
function open(token: string, deliveryId: number, sealed: string): string | null {
  try {
    const raw = Buffer.from(sealed, "base64");
    const key = Buffer.from(hkdfSync("sha256", token, "", "ziffr held reply", 32));
    const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    d.setAAD(Buffer.from(`held-reply:${deliveryId}`));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Removes held replies past their hours, for the job that sends waiting mail and for every new hold: nothing needs them. */
export async function purgeExpiredHeldReplies(): Promise<void> {
  await db().from("held_replies").delete().lt("expires_at", new Date().toISOString());
}

/** What happened to a reply that no provider vouched for, for the provider's logs. */
export type HoldOutcome = "held" | "refused" | "empty" | "unknown_token" | "limited";

/** Holds an unvouched reply from the person's own address for their confirmation, and emails them the link at the
 * address on file. Nothing is recorded, posted or proposed here. A reply that would change nothing anyway (no number
 * in it, a Metric that takes no value by email, an Alert) is answered as such and not held. `say` writes to the
 * address on file. The caller has checked the Delivery, the sender's address and the limits. */
export async function holdReply(d: RepliedDelivery, reply: string, address: string, say: (subject: string, text: string) => Promise<void>): Promise<HoldOutcome> {
  const text = withoutFormLinks(reply).slice(0, HELD_CHARS);
  let kind: "value" | "reply";
  if (d.kind === "alert" || d.kind === "heads_up") {
    await say("Not recorded", d.kind === "alert" ? "Alerts cannot be answered; open the Metric in Ziffr." : "Heads-ups cannot be answered; open Ziffr.");
    return "refused";
  }
  if (d.kind === "checklist") {
    await say("Not recorded", "A checklist message cannot be answered; open the Workflow in Ziffr.");
    return "refused";
  }
  if (d.kind === "test") {
    await say("Not recorded", "This was a test message; nothing is recorded from a reply.");
    return "refused";
  }
  if (d.kind === "filled_in") {
    await say("Not recorded", "This message cannot be answered; to replace the value, open the Metric in Ziffr.");
    return "refused";
  }
  if (asksForValues(d)) {
    if (!d.combined) {
      const { data: prompt } = await db().from("prompts").select("source, submitter_id").eq("id", d.prompt_id!).eq("workspace_id", d.workspace_id).maybeSingle();
      if (!prompt || prompt.submitter_id !== d.recipient_id) return "unknown_token";
      if (!text) return "empty";
      if ((await answerSourceOf(d, prompt.source)) !== "mail") {
        await say("Your value was not recorded", "This Metric does not take values by email. Use your form link.");
        return "refused";
      }
    }
    if (!text) return "empty";
    // What the reply would do, without doing it: one that changes nothing is not worth a confirmation.
    const would = await lookAt(d, text, address);
    if (would.outcome === "unknown_token") return "unknown_token";
    if (!would.changes) {
      if (would.text) await say(would.subject || "Not recorded", would.text);
      return would.outcome === "empty" ? "empty" : "refused";
    }
    kind = "value";
  } else if (d.action_id) {
    const { body, correction } = parseReply(text);
    if (!body && correction === null) return "empty";
    kind = "reply";
  } else {
    return "unknown_token";
  }
  const now = new Date();
  await purgeExpiredHeldReplies();
  const { count } = await db().from("held_replies").select("id", { count: "exact", head: true }).eq("delivery_id", d.id).gt("expires_at", now.toISOString());
  if ((count ?? 0) >= HELD_PER_DELIVERY) return "limited";
  const token = randomBytes(32).toString("base64url");
  const { data: row, error } = await db().from("held_replies").insert({
    workspace_id: d.workspace_id, delivery_id: d.id, token_hash: sha(token), address_hash: sha(address.toLowerCase()), kind,
    sealed_text: seal(token, d.id, text), expires_at: new Date(now.getTime() + HELD_REPLY_HOURS * 3_600_000).toISOString(),
  }).select("id").single();
  if (error || !row) throw new Error("The reply could not be held.");
  try {
    // Through the person's own address on file (deliveries.ts reads it when sending), never the sender's.
    await deliverNotice(d.workspace_id, {
      recipientId: d.recipient_id, senderId: null, via: "email", subject: "Confirm your reply to Ziffr",
      text: `Ziffr received a reply to one of its emails from your address, but your email provider did not vouch for the sender, so nothing has been recorded yet.\n\nIf you sent it, open the link and press Confirm. If you did not, ignore this email: nothing will happen, and the link stops working after ${HELD_REPLY_HOURS} hours.`,
      link: `/api/confirm-reply/${token}`,
    });
  } catch {
    await db().from("held_replies").delete().eq("id", row.id);
    return "refused";
  }
  // By Ziffr, not in the person's name: the sender of a held reply is not known to be them. Never the words.
  await recordAudit(d.workspace_id, null, { kind: "email_reply.held", object: { type: "person", id: d.recipient_id }, details: { kind, ...(d.action_id ? { ref: refFor(d.action_id) } : {}) } });
  return "held";
}

/** What a reply to a request would do, reading it as it will be read, writing nothing. */
const lookAt = (d: RepliedDelivery, text: string, address: string) => takePromptReply(d, text, { source: "mail", sender: address }, { dry: true });

type Found = { id: number; d: RepliedDelivery; address: string; text: string; kind: "value" | "reply" };

/** The held reply a token names, when it still may be confirmed: known, unexpired, unused, for a Workspace that is not
 * the demo and has not ended its trial, still going to the same address on file. Null in every other case, so the
 * answer never says which. */
async function find(token: string): Promise<Found | null> {
  if (!TOKEN.test(String(token))) return null;
  const hash = sha(token);
  const { data: row } = await db().from("held_replies").select("id, delivery_id, token_hash, address_hash, sealed_text, kind").eq("token_hash", hash).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!row || !equal(String(row.token_hash), hash)) return null;
  const { data: d } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, prompt_id, combined, connector, created_at").eq("id", row.delivery_id).maybeSingle();
  if (!d || d.connector !== "email" || d.workspace_id === DEMO_WORKSPACE_ID || (await trialEnded(d.workspace_id))) return null;
  // Held for the same reasons a reply is taken at all: within the days a reply address works, and never for an Approval or
  // Self-check (which an Action may have become since), whose answers are only given in Ziffr unvouched.
  if (Date.now() - new Date(d.created_at as string).getTime() > REPLY_DAYS * 86_400_000) return null;
  if (d.action_id) {
    const { data: a } = await db().from("actions").select("purpose").eq("id", d.action_id).eq("workspace_id", d.workspace_id).maybeSingle();
    if (a?.purpose === "approval" || a?.purpose === "self_check") return null;
  }
  const address = await addressIn(d.workspace_id, d.recipient_id);
  if (!address || !equal(sha(address.toLowerCase()), String(row.address_hash))) return null;
  const text = open(token, d.id, String(row.sealed_text));
  if (text === null) return null;
  return { id: row.id as number, d, address, text, kind: row.kind as "value" | "reply" };
}

/** Constant-time comparison of two hex digests. */
function equal(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** What the confirm page shows: the kind of reply, its words, what confirming would do (one line for each figure of a
 * reply to a request, with its note), the change a note offers, as a second button, and a note field for each value
 * that carries none, with the question where a Metric asks (whatever the value: this page is no sign-in). */
export type HeldReplyView = { kind: "value" | "reply"; text: string; effect: string; offer?: { take: string; label: string }; notes?: NoteField[]; question?: string };

/** What a token's held reply says and would do, for the page that asks first. Changes nothing. Null when the link
 * does not work, whatever the reason. Carries only what the person who holds the link needs. */
export async function heldReplyView(token: string): Promise<HeldReplyView | null> {
  const f = await find(token);
  if (!f) return null;
  const { body, correction } = parseReply(f.text);
  if (f.kind === "value") {
    if (!asksForValues(f.d)) return null;
    const would = await lookAt(f.d, f.text, f.address);
    if (would.outcome === "unknown_token") return null;
    const notes = would.noteFields;
    return { kind: "value", text: f.text, effect: would.text || "Nothing would change.", ...(would.offer ? { offer: would.offer } : {}), ...(notes ? { notes, ...(notes.some((n) => n.asks) ? { question: NOTE_FIELD_QUESTION } : {}) } : {}) };
  }
  // The whole text as it will be taken, and the Correction's number in words, so nothing taken is hidden from the person.
  return { kind: "reply", text: f.text, effect: correction === null ? `Posted as your reply in the Thread of ${refFor(f.d.action_id!)}.` : `${body ? "Posted as your reply, and proposes" : "Proposes"} a Correction to ${correction} in the Thread of ${refFor(f.d.action_id!)}.` };
}

/** Confirms a held reply: it is claimed first (deleted, so a second use finds nothing), then taken the way a reply
 * the provider vouched for is. `take` is the offered change the person pressed, as the page showed it (from a browser:
 * it takes effect only when the reply still offers exactly that). `notes` are the words typed in the page's fields, by
 * figure number, from a browser too: each goes only with a value this reply records without a note, and the intake
 * checks and cuts it. Returns what became of it in words for the page, or null when the link does not work. */
export async function confirmHeldReply(token: string, take?: string, notes?: Record<number, string>): Promise<{ ok: boolean; detail: string } | null> {
  const f = await find(token);
  if (!f) return null;
  const { data: claimed } = await db().from("held_replies").delete().eq("id", f.id).select("id");
  if (!claimed?.length) return null;
  let said = "";
  // No offer is left open: there is no message the person could say "yes" to.
  const offers: OfferChoice = take ? { take: String(take).slice(0, 80) } : "none";
  const outcome = await routeReply(f.d, f.text, { source: "mail", sender: f.address, onPage: true, notes, answer: async (_subject, text) => { said = text; } }, submissionEffects, offers);
  const ok = outcome === "recorded" || outcome === "noted" || outcome === "replied" || outcome === "corrected";
  await recordAudit(f.d.workspace_id, f.d.recipient_id, { kind: "email_reply.confirmed", details: { kind: f.kind, outcome } });
  return { ok, detail: said || (ok ? "Your reply was added." : "Nothing was recorded.") };
}
