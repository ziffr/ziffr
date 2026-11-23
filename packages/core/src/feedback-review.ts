// The review queue of Feedback (spec 0049, ticket #919; GLOSSARY: Feedback, Installation Admin): with the setting
// `ZIFFR_FEEDBACK_MODE=review`, new feedback waits and a maintainer approves it (it becomes open, so the bridge files
// it), edits its words and approves, or rejects it with a reason the person reads in My feedback. CENTRAL ONLY: every
// function answers Forbidden unless this is hosted Ziffr and the actor is an Installation Admin (the existing role of
// the people who run the central version; there is no other maintainer role). Imported by nothing but the queue page.
// Visibility: anonymous review. The queue shows the kind, the words, the route, the app version and the day, never the
// person, their Workspace or the public reference; what is written to the Installation's audit is the opaque
// reference, never the words.
import { Forbidden } from "./actor";
import { db } from "./db";
import { cleanFeedbackWords, cleanRejectionReason, storedRoute, type FeedbackKind } from "./feedback-rules";
import { assertInstallationAdmin, recordInstallationEvent, type InstallationActor } from "./installation-admins";
import { hostedByCloud } from "./installation-days";
import { settingsInEffect } from "./settings-in-effect";

/** One feedback waiting for a maintainer: what the person wrote and where, and nothing that says who they are. */
export type QueuedFeedback = { id: string; kind: FeedbackKind; words: string; route: string | null; appVersion: string | null; createdAt: string };
// createdAt is the day only (YYYY-MM-DD): a time to the millisecond would help match a post to a person's moment.

/** How many waiting feedback the queue shows, oldest first. */
const QUEUE_MAX = 100;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The central version only, and only an Installation Admin: checked in front of every operation, reads included.
async function assertMaintainer(actor: InstallationActor): Promise<void> {
  if (!hostedByCloud(await settingsInEffect())) throw new Forbidden();
  await assertInstallationAdmin(actor);
}

/** The feedback waiting for review, oldest first, without who sent it. A route is shown only when it is a plain stored
 * one. Installation Admins of the central version only. */
export async function listFeedbackQueue(actor: InstallationActor): Promise<QueuedFeedback[]> {
  await assertMaintainer(actor);
  const { data, error } = await db().from("feedback").select("id, kind, words, route, app_version, created_at").eq("status", "waiting_for_review").order("created_at").limit(QUEUE_MAX);
  if (error) throw new Error("The queue could not be loaded.");
  return (data ?? []).map((r) => ({ id: r.id as string, kind: r.kind as FeedbackKind, words: r.words as string, route: storedRoute(r.route), appVersion: (r.app_version as string | null) ?? null, createdAt: String(r.created_at).slice(0, 10) }));
}

// One decision, in one database step; only a feedback still waiting changes. Audited by its opaque reference.
async function decide(actor: InstallationActor, id: string, status: "open" | "closed", words: string | null, message: string | null, event: (edited: boolean) => string): Promise<void> {
  await assertMaintainer(actor);
  if (typeof id !== "string" || !ID.test(id)) throw new Error("That feedback is not waiting for review.");
  const { data, error } = await db().rpc("feedback_review", { p_id: id, p_status: status, p_words: words, p_message: message });
  if (error) throw new Error("The feedback could not be updated. Try again.");
  const result = data as { ref?: unknown; edited?: unknown } | null;
  if (typeof result?.ref !== "string") throw new Error("That feedback is not waiting for review any more.");
  // Audited by what really happened: an "edit" that changed nothing is an approval.
  await recordInstallationEvent(actor.personId, event(result.edited === true), result.ref);
}

/** Approves a feedback: it becomes open, so the bridge files it. With `words` the maintainer edits them first; the
 * person is told the words were edited. */
export async function approveFeedback(actor: InstallationActor, id: string, edit?: { words?: unknown }): Promise<void> {
  await assertMaintainer(actor);
  if (edit?.words === undefined) return decide(actor, id, "open", null, null, () => "feedback.approved");
  const clean = cleanFeedbackWords(edit.words);
  if (!clean.ok) throw new Error(clean.reason);
  return decide(actor, id, "open", clean.words, null, (edited) => (edited ? "feedback.edited" : "feedback.approved"));
}

/** Rejects a feedback with a required reason: it becomes closed, is never filed, and the person reads the reason in My
 * feedback. */
export async function rejectFeedback(actor: InstallationActor, id: string, reason: unknown): Promise<void> {
  await assertMaintainer(actor);
  const clean = cleanRejectionReason(reason);
  if (!clean.ok) throw new Error(clean.message);
  return decide(actor, id, "closed", null, `The Ziffr team did not post this. Reason: ${clean.reason}`, () => "feedback.rejected");
}
