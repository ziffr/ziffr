// @ts-nocheck
// Routing a reply to a Delivery (spec 0004, spec 0007, spec 0016; GLOSSARY: Delivery, Prompt, Thread, Correction), whichever
// real Connector it came back through. The Connector has already checked that the reply is from the person the
// Delivery went to; this takes it the way a simulated reply always went: a Prompt's answer through submitValue, a
// reply about a question or task into its Thread, a "Correction:" line as a proposed Correction.
import { parseReply } from "./connectors/index";
import { db } from "./db";
import { linkTo } from "./deliveries";
import { submitValue, submissionEffects, type SubmissionEffects } from "./submissions";
import { postReply } from "./threads";
import { answerSourceOf } from "./prompt-ways";

/** How long a reply address works, in days. */
export const REPLY_DAYS = 30;

/** A Delivery a reply came back for, as stored. */
export type RepliedDelivery = { id: number; workspace_id: string; recipient_id: string; kind: string; action_id: number | null; prompt_id: number | null };

/** Where a reply came from: its Source, the sender as that Source knows them, and how to answer them there. */
export type ReplyChannel = {
  source: "mail" | "slack" | "telegram";
  sender: string;
  /** The recipient, when the Connector proved who wrote (Slack signs it, Telegram sends it with the webhook's
   * secret); else they are recognised by `sender`. */
  provenPersonId?: string;
  answer: (subject: string, text: string) => Promise<void>;
};

/** What became of a reply. */
export type RouteOutcome = "recorded" | "refused" | "form_link" | "replied" | "corrected" | "unknown_token" | "empty";

/** Takes one reply to a Delivery from the person it went to. */
export async function routeReply(d: RepliedDelivery, text: string, via: ReplyChannel, submission: SubmissionEffects = submissionEffects): Promise<RouteOutcome> {
  // An Alert is never answerable (spec 0032): nothing said back to it is a value, a reply or a Correction.
  if (d.kind === "alert") {
    await via.answer("Not recorded", "Alerts cannot be answered; open the Metric in Ziffr.");
    return "refused";
  }
  if (d.kind === "prompt" && d.prompt_id) {
    const { data: prompt } = await db().from("prompts").select("id, source, metric_id, submitter_id").eq("id", d.prompt_id).eq("workspace_id", d.workspace_id).maybeSingle();
    if (!prompt || prompt.submitter_id !== d.recipient_id) return "unknown_token";
    if (!text) return "empty";
    // What this Delivery offered: the Source its own message asked to be answered on. With several ways a Prompt has one
    // Delivery per way, and each takes the reply of its own way only (prompt-ways.ts).
    if ((await answerSourceOf(d, prompt.source)) !== via.source) {
      // The Metric does not take values from here: the answer is not recorded, and the person gets their form link.
      const { data: token } = await db().from("tokens").select("code").eq("workspace_id", d.workspace_id).eq("metric_id", prompt.metric_id).eq("submitter_id", d.recipient_id).is("stands_in_for", null).limit(1).maybeSingle();
      await via.answer("Your value was not recorded", token ? `This Metric takes values only through your form:\n${linkTo(`/submit/${token.code}`)}` : `This Metric does not take values ${via.source === "mail" ? "by email" : via.source === "telegram" ? "by Telegram" : "on Slack"}.`);
      return "form_link";
    }
    const r = await submitValue({ source: via.source, sender: via.sender, text, promptId: prompt.id, workspaceId: d.workspace_id }, submission, via.provenPersonId);
    if (r.ok) await db().from("deliveries").update({ status: "answered" }).eq("id", d.id);
    // The person learns what became of their number, as the simulator shows it.
    await via.answer(r.ok ? "Recorded" : "Not recorded", r.detail);
    return r.ok ? "recorded" : "refused";
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
