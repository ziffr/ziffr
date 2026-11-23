// Feedback coming back from GitHub (spec 0049, ticket #918; GLOSSARY: Feedback): the operation behind the webhook. It acts
// for no person (the route has checked GitHub's signature) and only on hosted Ziffr (ZIFFR_CLOUD_KEY), like feedback.ts.
// A comment from the Ziffr team becomes a message in the conversation of the feedback filed as that issue or discussion,
// marks it answered and tells the person the way Tasks and Questions are told (a notice through their Connector); a post
// closed or reopened on GitHub is closed or open here. Replay-safe twice over: GitHub's delivery id is claimed first, and a
// comment is stored once by its own reference. Anonymity: the commenter's login is never kept, logged or shown (the reader
// in feedback-webhook-rules.ts does not return it), and the notice carries no words of the answer, only that there is one.
// Nothing is logged but fixed phrases: the words of an answer and of a feedback never reach a log.
import { Forbidden } from "./actor";
import { db } from "./db";
import { deliverNotice } from "./deliveries";
import { readGithubEvent } from "./feedback-webhook-rules";
import { hostedByCloud } from "./installation-days";
import { settingsInEffect } from "./settings-in-effect";

/** What the event came to: taken as a comment or a status, a repeat, or not ours. */
export type GithubEventOutcome = "comment" | "status" | "replay" | "ignored";

const DELIVERY_ID = /^[0-9A-Za-z-]{8,64}$/;
const SUBJECT = "The Ziffr team answered your feedback";

/** Takes one GitHub webhook event (its name, its delivery id and its parsed body) that the route has verified.
 * `repo` (owner/name) and `bot` (the bot's login) come from our own settings. Hosted Ziffr only. */
export async function receiveGithubFeedbackEvent(input: { deliveryId: string; event: string; payload: unknown }, ctx: { repo: string; bot: string }): Promise<GithubEventOutcome> {
  if (!hostedByCloud(await settingsInEffect())) throw new Forbidden();
  if (typeof input.deliveryId !== "string" || !DELIVERY_ID.test(input.deliveryId)) return "ignored";
  const event = readGithubEvent(input.event, input.payload, ctx);
  if (!event) return "ignored";
  const { data: claim, error: claimError } = await db().rpc("feedback_claim_github_delivery", { p_id: input.deliveryId });
  if (claimError) throw new Error("The delivery could not be recorded.");
  // Handled once before: nothing to do. Being handled right now: refused with an error, so GitHub shows a failure and the
  // delivery can be redelivered, rather than answering "replay" for work that may still fail.
  if (claim === "done") return "replay";
  if (claim !== "new") throw new Error("The delivery is being handled.");
  try {
    const outcome = await apply(event);
    // Counted as handled only now that it succeeded.
    await db().rpc("feedback_complete_github_delivery", { p_id: input.deliveryId });
    return outcome;
  } catch (e) {
    // Given back, so a redelivery from GitHub's page can try again.
    await db().rpc("feedback_release_github_delivery", { p_id: input.deliveryId });
    throw e;
  }
}

// What an event does to the store; throws when the database refuses.
async function apply(event: NonNullable<ReturnType<typeof readGithubEvent>>): Promise<GithubEventOutcome> {
  if (event.type === "status") {
    const { error } = await db().rpc("feedback_set_status_from_github", { p_kind: event.kind, p_number: event.number, p_status: event.status });
    if (error) throw new Error("The status could not be set.");
    return "status";
  }
  if (event.type === "edit" || event.type === "remove") {
    const { error } = event.type === "edit"
      ? await db().rpc("feedback_edit_team_comment", { p_kind: event.kind, p_number: event.number, p_ref: event.ref, p_words: event.words, p_updated: event.at })
      : await db().rpc("feedback_remove_team_comment", { p_kind: event.kind, p_number: event.number, p_ref: event.ref });
    if (error) throw new Error("The comment could not be changed.");
    return "comment";
  }
  const { data, error } = await db().rpc("feedback_take_team_comment", { p_kind: event.kind, p_number: event.number, p_ref: event.ref, p_words: event.words, p_updated: event.at });
  if (error) throw new Error("The comment could not be stored.");
  const row = (data as { person_id: string; workspace_id: string | null; told: boolean }[] | null)?.[0];
  if (row?.told) await tellPerson(row.person_id, row.workspace_id);
  return "comment";
}

// The same notice Tasks and Questions use, through the person's own Connector and quiet hours, in the Workspace the
// feedback was sent from (a notice belongs to one). It says that there is an answer and where to read it, never the answer.
// A person who has left that Workspace, or a feedback sent from none, gets no notice: the answer waits in My feedback.
async function tellPerson(personId: string, workspaceId: string | null): Promise<void> {
  if (!workspaceId) return;
  try {
    const { data: member } = await db().from("memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", personId).maybeSingle();
    if (!member) return;
    await deliverNotice(workspaceId, { recipientId: personId, senderId: null, subject: SUBJECT, text: `${SUBJECT}. Open My feedback to read it.`, link: "/?panel=feedback", quiet: true });
  } catch {
    // The answer is stored; a failed notice must not lose it or fail the event.
    console.error("Feedback notice failed");
  }
}
