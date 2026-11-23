// Feedback (spec 0049, ticket #915; GLOSSARY: Feedback): what a signed-in person tells the Ziffr team from the app, and
// the list of what they sent (My feedback). CENTRAL ONLY: every function answers Forbidden unless this is hosted Ziffr
// (the same test as cloud-api.ts), and nothing else in the core, the web app, the API, the SDK or the MCP server imports
// this file yet; the form, the bridge to GitHub and the review queue come in the later tickets of the spec.
// Visibility: the store is outside every Workspace and reached by the service role only. A person is answered with
// their own feedback and nothing else: no function here takes a person other than the Actor, nothing returns the
// Workspace it was sent from or the public reference, and the words, route and version are the only things stored; a
// Metric's name, a value or any Workspace data is never read to fill a field.
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import {
  cleanAppVersion, cleanFeedbackWords, FEEDBACK_PER_PERSON_PER_DAY, FEEDBACK_PER_WORKSPACE_PER_DAY, feedbackKind, feedbackMode, newFeedbackStatus, normalizeRoute,
  type FeedbackKind, type FeedbackMode, type FeedbackStatus,
} from "./feedback-rules";
import { hostedByCloud } from "./installation-days";
import { settingsInEffect, settingsInEffectStrict } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";

/** One message under a feedback: what the person wrote, or what came back from the Ziffr team. */
export type FeedbackMessage = { fromTeam: boolean; words: string; at: string };

/** A feedback as its sender sees it. */
export type MyFeedback = { id: string; kind: FeedbackKind; words: string; route: string | null; appVersion: string | null; status: FeedbackStatus; createdAt: string };

/** One feedback with its conversation. */
export type MyFeedbackThread = MyFeedback & { messages: FeedbackMessage[] };

/** How many of a person's feedback the list shows, newest first. */
const LIST_MAX = 50;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COLUMNS = "id, kind, words, route, app_version, status, created_at";

type Row = { id: string; kind: string; words: string; route: string | null; app_version: string | null; status: string; created_at: string };
const view = (r: Row): MyFeedback => ({
  id: r.id, kind: r.kind as FeedbackKind, words: r.words, route: r.route, appVersion: r.app_version, status: r.status as FeedbackStatus, createdAt: r.created_at,
});

// Hosted Ziffr only, and only a person who signed in (has a login), in a real Workspace they belong to: not a key, a
// Contact, a View Link viewer or someone in the demo. Checked in front of every operation, reads included.
async function assertMayUse(actor: Actor): Promise<void> {
  if (!hostedByCloud(await settingsInEffect())) throw new Forbidden();
  if (actor.key || actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden();
  const [{ data: profile }, { data: member }] = await Promise.all([
    db().from("profiles").select("auth_user_id").eq("id", actor.personId).maybeSingle(),
    db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle(),
  ]);
  if (!profile?.auth_user_id || !member) throw new Forbidden();
}

/** The actor sends feedback: a kind, their words, and optionally the page route and app version the form adds. Every
 * value is checked here; the route is cut down to a plain path and dropped when it is not one. At most a few a day per
 * person and per Workspace, counted in the database. Returns the new feedback: open when the Installation posts
 * directly (the default), waiting for review when its setting says review first. */
export async function createFeedback(actor: Actor, input: { kind?: unknown; words?: unknown; route?: unknown; appVersion?: unknown }): Promise<MyFeedback> {
  await assertMayUse(actor);
  const mode = await currentMode();
  const kind = feedbackKind(input?.kind);
  if (!kind) throw new Error("Choose what kind of feedback this is.");
  const clean = cleanFeedbackWords(input.words);
  if (!clean.ok) throw new Error(clean.reason);
  const { data, error } = await db().rpc("feedback_create", {
    p_person: actor.personId, p_workspace: actor.workspaceId, p_kind: kind, p_words: clean.words, p_route: normalizeRoute(input.route),
    p_version: cleanAppVersion(input.appVersion), p_per_person: FEEDBACK_PER_PERSON_PER_DAY, p_per_workspace: FEEDBACK_PER_WORKSPACE_PER_DAY,
  });
  if (error) throw new Error("Your feedback could not be saved.");
  // A set: no row means a limit was reached. Checked by the id so an empty answer can never pass for a feedback.
  const made = (data as Row[] | null)?.[0];
  if (!made?.id) throw new Error("That is enough feedback for today. Please try again tomorrow.");
  return view(await settle(made, mode));
}

// The mode is read here, on the server, when the feedback is made: a change affects only feedback made after it, and
// what waits stays waiting. Fails closed: when the setting cannot be read the feedback waits for review.
async function currentMode(): Promise<FeedbackMode> {
  try { return feedbackMode(await settingsInEffectStrict()); } catch { return "review"; }
}

// The store makes every feedback waiting for review; in direct mode it is opened right after, only if it still waits.
// If that step fails the feedback simply waits: safe, and a maintainer can approve it.
async function settle(made: Row, mode: FeedbackMode): Promise<Row> {
  if (newFeedbackStatus(mode) !== "open") return made;
  const { data } = await db().from("feedback").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", made.id).eq("status", "waiting_for_review").select(COLUMNS).maybeSingle();
  return (data as Row | null) ?? made;
}

/** My feedback: what the actor sent, newest first, with its status. Never anyone else's. */
export async function listMyFeedback(actor: Actor): Promise<MyFeedback[]> {
  await assertMayUse(actor);
  const { data, error } = await db().from("feedback").select(COLUMNS).eq("person_id", actor.personId).order("created_at", { ascending: false }).limit(LIST_MAX);
  if (error) throw new Error("Your feedback could not be loaded.");
  return (data as Row[]).map(view);
}

/** One of the actor's feedback with its conversation, or null when there is none with that id that is theirs (someone
 * else's looks the same as one that does not exist). */
export async function getMyFeedback(actor: Actor, id: string): Promise<MyFeedbackThread | null> {
  await assertMayUse(actor);
  if (typeof id !== "string" || !ID.test(id)) return null;
  const { data } = await db().from("feedback").select(COLUMNS).eq("id", id).eq("person_id", actor.personId).maybeSingle();
  if (!data) return null;
  const { data: messages } = await db().from("feedback_messages").select("from_team, words, created_at").eq("feedback_id", id).order("created_at");
  return { ...view(data as Row), messages: (messages ?? []).map((m) => ({ fromTeam: m.from_team === true, words: String(m.words), at: String(m.created_at) })) };
}
