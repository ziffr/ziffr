// The Setup Guide's state through the core (spec 0052, spec 0067; GLOSSARY: Setup Guide, Business Function): the two
// steps of a Member. Owners and Admins have none: a new Owner has First Steps. The Workspace has one row, made with the
// Workspace or with its first Metric to send a value for; each person's side (first seen, hidden, own skips) is theirs.
// Steps are ticked from what the viewer has (setup-steps.ts), never from a stored flag; only skipping a step is stored.
// A Guest has no guide, the demo never has one, and what is returned is the viewer's own steps.
import type { Actor } from "./actor";
import { Forbidden } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { canSee } from "./sharing";
import { DEMO_WORKSPACE_ID } from "./team";
import { whatWorksHere } from "./what-works-here";
import { openOne } from "./sealed-columns";
import { setupSteps, stepsFor, type SetupFacts, type SetupStepId, type SetupSteps } from "./setup-steps";

/** What the guide shows the viewer: their own steps. */
export type SetupGuide = SetupSteps & {
  /** The viewer hid the guide. */
  hidden: boolean;
  /** The viewer has opened the guide before. */
  seen: boolean;
  /** Whether the Setup line is drawn for the viewer: they have steps left, did not hide it, and it is not finished. */
  lineShown: boolean;
};

/** Whether this actor may have a guide at all: a Member, not through a key, not in the demo. */
function hasGuide(actor: Actor): boolean {
  return !actor.key && actor.workspaceId !== DEMO_WORKSPACE_ID && stepsFor(actor.role).length > 0;
}

/** Makes the Workspace's guide row when it has none, for an Owner or Admin: it holds the first Metric picked. Never for
 * the demo. Nothing is changed when the row is there. */
export async function startSetupGuide(actor: Actor): Promise<void> {
  if (actor.workspaceId === DEMO_WORKSPACE_ID || (actor.role !== "owner" && actor.role !== "admin")) return;
  const { error } = await db().from("setup_guides").upsert({ workspace_id: actor.workspaceId }, { onConflict: "workspace_id", ignoreDuplicates: true });
  if (error) throw new Error("The Setup Guide could not be started.");
}

// Every fact is about the viewer's own rows.
async function readFacts(actor: Actor): Promise<SetupFacts> {
  const ws = actor.workspaceId;
  const me = actor.personId;
  const head = { count: "exact" as const, head: true };
  const [bf, pref, here, test] = await Promise.all([
    db().from("business_functions").select("person_id", head).eq("workspace_id", ws).eq("person_id", me),
    db().from("delivery_preferences").select("connector").eq("workspace_id", ws).eq("user_id", me).eq("kind", "reminder").order("position").limit(1).maybeSingle(),
    whatWorksHere(actor),
    db().from("deliveries").select("id", head).eq("workspace_id", ws).eq("recipient_id", me).eq("kind", "test").eq("mail_state", "sent"),
  ]);
  const first = pref.data?.connector as string | undefined;
  return {
    preferenceReal: Boolean(first) && here.some((x) => x.way === first && x.state === "real"),
    testMessageSent: (test.count ?? 0) > 0,
    businessFunctionSet: (bf.count ?? 0) > 0,
  };
}

/** The viewer's own side of the guide: whether they have opened it, whether they hid its line, and what they skipped. */
export async function guidePerson(actor: Actor): Promise<{ seen: boolean; hidden: boolean; skipped: string[] }> {
  const { data, error } = await db().from("setup_guide_people").select("first_seen_at, hidden_at, skipped").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  if (error) throw new Error("The Setup Guide could not be read.");
  return { seen: Boolean(data?.first_seen_at), hidden: Boolean(data?.hidden_at), skipped: (data?.skipped as string[] | null) ?? [] };
}

// The Workspace's row, if any. A Workspace whose guide was finished before stays quiet for everyone.
async function guideRow(workspaceId: string): Promise<{ finished: boolean } | null> {
  const { data } = await db().from("setup_guides").select("finished_at").eq("workspace_id", workspaceId).maybeSingle();
  return data ? { finished: Boolean(data.finished_at) } : null;
}

/** The guide for the actor, or null when they have none (anyone but a Member, and the demo). The steps are worked out
 * from what the viewer has now. */
export async function setupGuide(actor: Actor): Promise<SetupGuide | null> {
  if (!hasGuide(actor)) return null;
  const [row, person, facts] = await Promise.all([guideRow(actor.workspaceId), guidePerson(actor), readFacts(actor)]);
  const steps = setupSteps(facts, actor.role, person.skipped);
  return { ...steps, hidden: person.hidden, seen: person.seen, lineShown: row !== null && !row.finished && !person.hidden && !steps.finished };
}

/** The Metric with that id as the one to send a first value for: only when the viewer may see it (visibility is the product) and it
 * is not archived. */
export async function seenFirstMetric(actor: Actor, id: number | null): Promise<{ id: number; name: string } | null> {
  if (id === null || !(await canSee(actor, "metric", id))) return null;
  const { data } = await db().from("metrics").select("id, name").eq("id", id).eq("workspace_id", actor.workspaceId).is("archived_at", null).maybeSingle();
  const m = await openOne("metrics", actor.workspaceId, data);
  return m ? { id: m.id as number, name: m.name as string } : null;
}

function assertGuide(actor: Actor): void {
  if (!hasGuide(actor)) throw new Forbidden("There is no Setup Guide here.");
}

/** Skips one of the actor's own steps. The Audit Log records the step's name only. */
export async function skipSetupStep(actor: Actor, step: unknown): Promise<void> {
  assertGuide(actor);
  const known = stepsFor(actor.role).find((s) => s === step);
  if (!known) throw new Forbidden();
  const { data, error } = await db().rpc("setup_guide_person_skip", { p_workspace: actor.workspaceId, p_person: actor.personId, p_step: known });
  if (error) throw new Error("The step could not be skipped.");
  if (data === true) await audit(actor, { kind: "setup.step_skipped", object: { type: "workspace", id: actor.workspaceId }, details: { step: known } });
}

/** Hides the Setup line for the actor only. */
export async function hideSetupGuide(actor: Actor): Promise<void> {
  assertGuide(actor);
  await setGuidePerson(actor, { hidden_at: new Date().toISOString() });
}

/** Shows the Setup line again for the actor. */
export async function reopenSetupGuide(actor: Actor): Promise<void> {
  assertGuide(actor);
  await setGuidePerson(actor, { hidden_at: null });
}

/** Notes that the actor has opened the guide, once: it opens by itself only until then. */
export async function markSetupGuideSeen(actor: Actor): Promise<void> {
  assertGuide(actor);
  if (!(await guidePerson(actor)).seen) await setGuidePerson(actor, { first_seen_at: new Date().toISOString() });
}

/** Writes the actor's own side of the guide, never another person's. Callers check who may. */
export async function setGuidePerson(actor: Actor, change: { first_seen_at?: string; hidden_at?: string | null }): Promise<void> {
  const { error } = await db().from("setup_guide_people").upsert({ workspace_id: actor.workspaceId, person_id: actor.personId, ...change }, { onConflict: "workspace_id,person_id" });
  if (error) throw new Error("The Setup Guide could not be saved.");
}

/** What the layout draws for the actor: whether the guide applies to them at all (the menus offer to reopen it), and, when
 * the Setup line is to be drawn, how far they are and what is next. Cheap when the line is not shown (no row, finished or
 * hidden): the steps are only worked out when the line needs them. Never throws for a Guest or the demo: it says no. */
export type SetupLine = { applies: boolean; shown: boolean; done: number; total: number; next: SetupStepId | null };

/** The Setup line's facts for the actor (see SetupLine). */
export async function setupLine(actor: Actor): Promise<SetupLine> {
  const none = { applies: false, shown: false, done: 0, total: 0, next: null };
  if (!hasGuide(actor)) return none;
  const quiet = { ...none, applies: true };
  const [row, person] = await Promise.all([guideRow(actor.workspaceId), guidePerson(actor)]);
  if (!row || row.finished || person.hidden) return quiet;
  const guide = await setupGuide(actor);
  if (!guide || !guide.lineShown) return quiet;
  // Done is ticked or skipped, so the count and "next" agree.
  return { applies: true, shown: true, done: guide.steps.filter((x) => x.done).length, total: guide.total, next: guide.next };
}

/** Whether the actor's home should lead to the guide by itself: the Workspace has a guide row, the actor is a Member
 * outside the demo, and they have not opened it yet. False for everyone else. */
export async function setupGuidePending(actor: Actor): Promise<boolean> {
  if (!hasGuide(actor)) return false;
  const [row, person] = await Promise.all([guideRow(actor.workspaceId), guidePerson(actor)]);
  return row !== null && !person.seen;
}

/** Sets the Metric a first value is sent for, or clears it (Owners and Admins, never through a key or in the demo).
 * Only a Metric of the Workspace that the actor sees: anything else is refused. */
export async function setSetupFirstMetric(actor: Actor, metricId: number | null): Promise<void> {
  if (actor.key || actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("There is no Setup Guide here.");
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins set up the Workspace.");
  if (metricId !== null) {
    if (!Number.isInteger(metricId) || metricId <= 0) throw new Forbidden();
    const { data } = await db().from("metrics").select("id").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
    if (!data || !(await canSee(actor, "metric", metricId))) throw new Forbidden();
  }
  await startSetupGuide(actor);
  const { error } = await db().from("setup_guides").update({ first_metric_id: metricId, updated_at: new Date().toISOString() }).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The choice could not be saved.");
}
