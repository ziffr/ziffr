// First Steps through the core (spec 0067; GLOSSARY: First Steps, Workspace, Workspace Profile, Business Function): making
// a Workspace from the answers, saving them again after Start over, and where its Owner resumes. First Steps belongs to
// the Owner: Admins, Members, Guests, Access Keys and the demo are refused. Answers come from a browser and are
// untrusted: every one is checked against its fixed list or size before anything is written. What is read back is the
// Workspace's own answers and the asker's own Business Function, nothing of another person.
import { isBusinessFunction } from "@ziffr/pack/business-functions";
import { Forbidden, type Actor, Refused } from "./actor";
import { myBusinessFunction, setMyBusinessFunction } from "./business-function";
import { db } from "./db";
import { NO_ANSWERS, TOPICS, USED_BY, type FirstStepsAnswers, type FirstStepsResume } from "./first-steps-screens";
import { ownerHasOwnValue } from "./invite-gate";
import { createWorkspace } from "./page-data";
import { HIDDEN_CHARACTERS } from "./profile";
import { markSetupGuideSeen } from "./setup-guide";
import { DEMO_WORKSPACE_ID } from "./team";
import { knownTimeZone, setWorkspaceClock, workspaceClock } from "./workspace-clock";
import { COUNTRIES, CURRENCIES, INDUSTRIES, SEGMENTS } from "./workspace-profile";
import { MAX_WORKSPACE_NAME, renameWorkspace, setWorkspaceProfile, workspaceName, workspaceProfile } from "./workspace-settings";

/** An answer refused, in words for the person. */
export class AnswerRefused extends Refused {}

const LISTS = { role: null, industry: INDUSTRIES, segment: SEGMENTS, topic: TOPICS, country: COUNTRIES, currency: CURRENCIES } as const;

/** The answers from untrusted input, all of them checked; throws AnswerRefused at the first that is not on its list or
 * too long, and for any field this does not know. The name comes back with its spaces collapsed. */
export function checkFirstStepsAnswers(input: unknown): FirstStepsAnswers & { who: "team" | "me" } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AnswerRefused("Answer the questions again.");
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some((k) => !Object.hasOwn(NO_ANSWERS, k))) throw new AnswerRefused("Answer the questions again.");
  const who = USED_BY.find((u) => u === raw.who);
  if (!who) throw new AnswerRefused("Say who will use Ziffr.");
  const out: Record<string, unknown> = { who };
  for (const [field, list] of Object.entries(LISTS) as [keyof typeof LISTS, readonly string[] | null][]) {
    const v = raw[field] ?? null;
    const known = v === null || (typeof v === "string" && (list ? list.includes(v) : isBusinessFunction(v)));
    if (!known) throw new AnswerRefused("Pick one of the choices.");
    out[field] = v;
  }
  // Each branch of the first question has its own questions; an answer to the other one is not accepted.
  const other = who === "me" ? ["role", "industry", "segment"] : ["topic"];
  if (other.some((f) => out[f] !== null)) throw new AnswerRefused("Answer the questions again.");
  // The length is bounded before any work on the text.
  if (typeof raw.name !== "string" || raw.name.length > MAX_WORKSPACE_NAME * 4) throw new AnswerRefused(`Keep the name to ${MAX_WORKSPACE_NAME} characters.`);
  if (HIDDEN_CHARACTERS.test(raw.name)) throw new AnswerRefused("Give the Workspace a name without hidden characters.");
  const name = raw.name.trim().replace(/\s+/g, " ");
  if (!name) throw new AnswerRefused("Give the Workspace a name.");
  if (name.length > MAX_WORKSPACE_NAME) throw new AnswerRefused(`Keep the name to ${MAX_WORKSPACE_NAME} characters.`);
  const timeZone = raw.timeZone ?? null;
  if (timeZone !== null && !(typeof timeZone === "string" && timeZone.length <= 64 && knownTimeZone(timeZone))) throw new AnswerRefused("Pick a time zone from the list.");
  const weekStart = raw.weekStart ?? null;
  if (weekStart !== null && weekStart !== 0 && weekStart !== 1) throw new AnswerRefused("Pick Monday or Sunday as the first day of the week.");
  return { ...(out as Pick<FirstStepsAnswers, "role" | "industry" | "segment" | "topic" | "country" | "currency">), who, name, timeZone, weekStart };
}

// Writes what the answers say about a Workspace that exists, through the same operations the settings pages use, so
// their checks and Audit Log lines apply.
async function save(actor: Actor, a: FirstStepsAnswers & { who: "team" | "me" }): Promise<void> {
  const { error } = await db().from("workspaces").update({ used_by: a.who }).eq("id", actor.workspaceId);
  if (error) throw new Error("Your answers could not be saved.");
  if ((await workspaceName(actor)) !== a.name) await renameWorkspace(actor, a.name);
  // The profile is saved whole: company size and revenue are not asked here and stay as they are.
  const profile = await workspaceProfile(actor);
  await setWorkspaceProfile(actor, { ...profile, industry: a.industry, segment: a.segment, country: a.country, currency: a.currency });
  if (a.timeZone !== null) {
    const clock = await workspaceClock(actor);
    await setWorkspaceClock(actor, { timeZone: a.timeZone, runHour: clock.runHour, weekStart: a.weekStart ?? undefined });
  }
  await setMyBusinessFunction(actor, a.role);
}

/** Makes a Workspace from the answers and returns its id; the person becomes its Owner. Every answer is checked first,
 * so a refused one makes nothing; the rules for trials and for how many Workspaces a person may own are those of
 * `createWorkspace`. `saved` is false when the Workspace was made but an answer could not be written: it is not made
 * again, and Start over saves the answers. */
export async function createFirstStepsWorkspace(personId: string, input: unknown): Promise<{ workspaceId: string; saved: boolean }> {
  const answers = checkFirstStepsAnswers(input);
  // One of the demo's made-up people makes nothing.
  const { data: demo, error: unread } = await db().from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("user_id", personId).maybeSingle();
  if (unread) throw new Error("The Workspace could not be created.");
  if (demo) throw new Forbidden("The demo's people make no Workspace.");
  const workspaceId = await createWorkspace(personId, answers.name);
  const actor: Actor = { personId, workspaceId, role: "owner" };
  // The mark that this flow made it comes first: with it the Owner can come back here whatever happens next.
  const { error } = await db().from("setup_guides").upsert({ workspace_id: workspaceId, first_steps_at: new Date().toISOString() }, { onConflict: "workspace_id" });
  if (error) throw new Error("Your Workspace was made, but First Steps could not be started for it.");
  try {
    // First Steps takes the place of the Setup Guide for its Owner: Home does not lead them there.
    await markSetupGuideSeen(actor);
    await save(actor, answers);
  } catch (e) {
    console.error("Saving the First Steps answers failed:", e);
    return { workspaceId, saved: false };
  }
  return { workspaceId, saved: true };
}

// The Owner themself, checked against the database, in a Workspace that is not the demo. True when First Steps made it.
async function ownersFirstSteps(actor: Actor): Promise<boolean> {
  if (actor.key || actor.role !== "owner" || actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("First Steps is for the Workspace's Owner.");
  const [{ data: me }, { data: guide, error }] = await Promise.all([
    db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle(),
    db().from("setup_guides").select("first_steps_at").eq("workspace_id", actor.workspaceId).maybeSingle(),
  ]);
  if (me?.role !== "owner") throw new Forbidden("First Steps is for the Workspace's Owner.");
  if (error) throw new Error("First Steps could not be read.");
  return Boolean(guide?.first_steps_at);
}

/** Saves the answers again after Start over, for the Owner of a Workspace First Steps made. It changes that Workspace
 * only: it never makes a second one and deletes no object. */
export async function saveFirstStepsAnswers(actor: Actor, input: unknown): Promise<void> {
  if (!(await ownersFirstSteps(actor))) throw new Forbidden("First Steps did not make this Workspace: change it in its settings.");
  await save(actor, checkFirstStepsAnswers(input));
}

// Worked out from facts, never from a stored screen: a Metric, an Owner's own value (the rule that opens a trial's
// invitations), and whether it was chosen who sends the values.
async function resumeAt(workspaceId: string): Promise<FirstStepsResume> {
  const [metrics, guide] = await Promise.all([
    db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("archived_at", null),
    db().from("setup_guides").select("providers_chosen_at").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (metrics.error || guide.error) throw new Error("First Steps could not be read.");
  if (!metrics.count) return "start";
  const own = await ownerHasOwnValue(workspaceId);
  const chosen = Boolean(guide.data?.providers_chosen_at);
  if (own) return chosen ? "finished" : "sender";
  return chosen ? "done" : "value";
}

/** Where the Owner resumes and the answers as the Workspace has them, or null when First Steps did not make this
 * Workspace. Refuses everyone but its Owner. */
export async function firstStepsState(actor: Actor): Promise<{ resume: FirstStepsResume; answers: FirstStepsAnswers } | null> {
  if (!(await ownersFirstSteps(actor))) return null;
  const [{ data: w, error }, profile, clock, role, resume] = await Promise.all([
    db().from("workspaces").select("name, used_by").eq("id", actor.workspaceId).single(),
    workspaceProfile(actor),
    workspaceClock(actor),
    myBusinessFunction(actor),
    resumeAt(actor.workspaceId),
  ]);
  if (error) throw new Error("First Steps could not be read.");
  const who = USED_BY.find((u) => u === w.used_by) ?? "team";
  return {
    resume,
    answers: {
      ...NO_ANSWERS, who, name: String(w.name), country: profile.country, currency: profile.currency, timeZone: clock.timeZone, weekStart: clock.weekStart,
      ...(who === "team" ? { role, industry: profile.industry, segment: profile.segment } : {}),
    },
  };
}
