// Routing a reply to a Delivery (spec 0004, spec 0007, spec 0016, spec 0064; GLOSSARY: Delivery, Prompt, Thread,
// Correction), whichever real Connector it came back through. The Connector has already checked that the reply is from
// the person the Delivery went to; this takes it where it belongs: a reply to a request, for one figure or several, to
// the reply reading (prompt-reply.ts), a reply about a question or task into its Thread, a "Correction:" line as a
// proposed Correction.
import { parseReply } from "./connectors/index";
import { db } from "./db";
import { questionsSentAs } from "./note-question";
import { takePromptReply, withoutFormLinks, type OfferChoice, type PromptReplyOutcome } from "./prompt-reply";
import { offerAnsweredAs } from "./reply-offers";
import { submissionEffects, type SubmissionEffects } from "./submissions";
import { postReply } from "./threads";
import { personBlocked } from "./user-block";

/** How long a reply address works, in days. */
export const REPLY_DAYS = 30;

/** A Delivery a reply came back for, as stored. */
export type RepliedDelivery = { id: number; workspace_id: string; recipient_id: string; kind: string; action_id: number | null; prompt_id: number | null; combined?: boolean | null };

/** Where a reply came from: its Source, the sender as that Source knows them, and how to answer them there. */
export type ReplyChannel = {
  source: "mail" | "slack" | "telegram";
  sender: string;
  /** The recipient, when the Connector proved who wrote (Slack signs it, Telegram sends it with the webhook's
   * secret); else they are recognised by `sender`. */
  provenPersonId?: string;
  /** The answer is read on the page that confirms a Held Reply, not sent: it is given also where an email would not
   * be, and asks for no note, since that page had a field for it. */
  onPage?: boolean;
  /** The notes typed on that page, by figure number: untrusted. */
  notes?: Record<number, string>;
  /** The Prompts of the question this reply answers, where the way says which message it replies to. */
  about?: number[];
  /** `link` is the address Ziffr put at the end of its answer, which an email draws as its button. `bare` says a chat
   * shows the words alone, `invites` that they ask for a further reply (an email then carries the reply address), and
   * `ask` that they end with the question for a note, which a chat gives its reply box or buttons. A chat may answer
   * with the id of the message it sent, where a reply or a button can name it. */
  answer: (subject: string, text: string, link?: string, how?: { bare?: boolean; invites?: boolean; ask?: boolean }) => Promise<number | string | void>;
};

/** What became of a reply. */
export type RouteOutcome = PromptReplyOutcome | "replied" | "corrected";

/** Whether a Delivery asks for one figure or several, so that a reply to it is read as values and notes. */
export const asksForValues = (d: Pick<RepliedDelivery, "kind" | "prompt_id" | "combined">): boolean => d.kind === "prompt" && Boolean(d.prompt_id || d.combined);

/** Takes one reply to a Delivery from the person it went to. `offers` says what becomes of an offer a note makes. */
export async function routeReply(d: RepliedDelivery, reply: string, via: ReplyChannel, submission: SubmissionEffects = submissionEffects, offers: OfferChoice = "keep"): Promise<RouteOutcome> {
  const text = withoutFormLinks(reply);
  // A Blocked User's reply changes nothing and is not answered (spec 0066).
  if (await personBlocked(d.recipient_id)) return "refused";
  // An Alert is never answerable (spec 0032): nothing said back to it is a value, a reply or a Correction.
  if (d.kind === "alert" || d.kind === "heads_up") {
    await via.answer("Not recorded", d.kind === "alert" ? "Alerts cannot be answered; open the Metric in Ziffr." : "Heads-ups cannot be answered; open Ziffr.");
    return "refused";
  }
  // Nor is a Checklist Item's message (spec 0045).
  if (d.kind === "checklist") {
    await via.answer("Not recorded", "A checklist message cannot be answered; open the Workflow in Ziffr.");
    return "refused";
  }
  // Nor is a Test Message (spec 0052): it asks for nothing.
  if (d.kind === "test") {
    await via.answer("Not recorded", "This was a test message; nothing is recorded from a reply.");
    return "refused";
  }
  // Nor is the message that tells someone a value was entered for them (spec 0046): they replace it in Ziffr.
  if (d.kind === "filled_in") {
    await via.answer("Not recorded", "This message cannot be answered; to replace the value, open the Metric in Ziffr.");
    return "refused";
  }
  if (asksForValues(d)) {
    const done = await takePromptReply(d, text, via, { submission, offers, ask: !via.onPage, typed: via.notes });
    // A message with several figures counts as answered once each is in, which closing its Prompts sees to.
    if (done.outcome === "recorded" && !d.combined) await db().from("deliveries").update({ status: "answered" }).eq("id", d.id);
    // The person learns what became of their reply. A saved note with nothing else to say sends no email back.
    if (done.text && !(via.source === "mail" && done.noEmail && !via.onPage)) {
      const sent = await via.answer(done.subject, done.text, done.link, { bare: done.bare, invites: done.invites, ask: Boolean(done.asked) });
      if (done.offered && typeof sent === "number") await offerAnsweredAs(d.workspace_id, d.id, sent);
      if (done.asked && sent !== undefined && sent !== null) await questionsSentAs(d.workspace_id, d.id, done.asked, String(sent));
    }
    return done.outcome;
  }
  if (d.action_id) {
    const { body, correction } = parseReply(text);
    if (!body && correction === null) return "empty";
    await postReply(d.workspace_id, d.action_id, d.recipient_id, body, correction, { type: via.source === "mail" ? "email" : via.source });
    await db().from("deliveries").update({ status: "answered" }).eq("id", d.id);
    return correction === null ? "replied" : "corrected";
  }
  return "unknown_token";
}
