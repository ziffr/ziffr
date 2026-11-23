// The Setup Guide's state through the core (spec 0052; GLOSSARY: Setup Guide, Business Function, Trial Guide). The
// Workspace's progress is one row shared by its Owners and Admins; each person's side (first seen, hidden, a Member's
// own skips) is theirs. Steps are ticked from what the Workspace has (setup-steps.ts), never from a stored flag; only
// skipping a step and "Explore on my own" are stored. Everyone reads and writes only through these functions: a
// Guest has no guide, the demo never has one, and what is returned is the viewer's own steps and the counts behind
// them, never another person's details.
import type { Actor } from "./actor";
import { Forbidden } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { canSee } from "./sharing";
import { DEMO_WORKSPACE_ID } from "./team";
import { whatWorksHere } from "./what-works-here";
import { openOne } from "./sealed-columns";
import { SETUP_STEPS, MEMBER_STEPS, setupSteps, stepsFor, type SetupFacts, type SetupStepId, type SetupSteps } from "./setup-steps";

/** The Sources whose value, entered by the viewer, counts as "in" for the First Metric step. */
const IN_SOURCES = ["mail", "slack", "telegram", "web_form", "api"] as const;

/** What the guide shows the viewer. Their own steps; the Workspace's progress only as counts and ticks. */
export type SetupGuide = SetupSteps & {
  /** Whether the Workspace has a guide row yet (Workspaces made before the guide get one when it is opened). */
  started: boolean;
  /** The Workspace's guide is finished (every step an Owner sees was ticked or skipped), for everyone. */
  workspaceFinished: boolean;
  /** The viewer hid the guide. */
  hidden: boolean;
  /** The viewer has opened the guide before. */
  seen: boolean;
  startingPoint: "scratch" | "pack" | null;
  /** The Metric the guide tries both ways, only when the viewer may see it. */
  firstMetric: { id: number; name: string } | null;
  /** Whether the Setup line is drawn for the viewer: they have steps left, did not hide it, and it is not finished. */
  lineShown: boolean;
};

/** Whether this actor may have a guide at all: not a Guest, not in the demo. */
function hasGuide(actor: Actor): boolean {
  return !actor.key && actor.workspaceId !== DEMO_WORKSPACE_ID && stepsFor(actor.role).length > 0;
}

const isStep = (s: unknown): s is SetupStepId => typeof s === "string" && (SETUP_STEPS as readonly string[]).includes(s);

/** Makes the Workspace's guide row when it has none (a new Workspace, or one that opens the guide from Help). Never
 * for the demo. Nothing is changed when the row is there. */
export async function startSetupGuide(actor: Actor): Promise<void> {
  if (actor.workspaceId === DEMO_WORKSPACE_ID || (actor.role !== "owner" && actor.role !== "admin")) return;
  const { error } = await db().from("setup_guides").upsert({ workspace_id: actor.workspaceId }, { onConflict: "workspace_id", ignoreDuplicates: true });
  if (error) throw new Error("The Setup Guide could not be started.");
}

// Every fact is a count or an existence check about the Workspace, or the viewer's own rows.
async function readFacts(actor: Actor, guide: { started_at: string; first_metric_id: number | null; starting_point: string | null } | null): Promise<SetupFacts> {
  const ws = actor.workspaceId;
  const me = actor.personId;
  const head = { count: "exact" as const, head: true };
  const metricId = guide?.first_metric_id ?? null;
  const [w, packs, metrics, members, invitations, contacts, bf, pref, here, test] = await Promise.all([
    db().from("workspaces").select("industry, country, clock_set_at, join_domain").eq("id", ws).single(),
    db().from("pack_installs").select("id", head).eq("workspace_id", ws),
    db().from("metrics").select("id", head).eq("workspace_id", ws),
    db().from("memberships").select("user_id", head).eq("workspace_id", ws),
    db().from("invitations").select("id", head).eq("workspace_id", ws).is("revoked_at", null).is("accepted_at", null).is("held_at", null).gt("expires_at", new Date().toISOString()),
    db().rpc("setup_guide_contact_submits", { p_workspace: ws }),
    db().from("business_functions").select("person_id", head).eq("workspace_id", ws).eq("person_id", me),
    db().from("delivery_preferences").select("connector").eq("workspace_id", ws).eq("user_id", me).eq("kind", "reminder").order("position").limit(1).maybeSingle(),
    whatWorksHere(actor),
    db().from("deliveries").select("id", head).eq("workspace_id", ws).eq("recipient_id", me).eq("kind", "test").eq("mail_state", "sent"),
  ]);
  const first = pref.data?.connector as string | undefined;
  let promptOut = false;
  let valueIn = false;
  if (metricId !== null && guide) {
    const { data: prompts } = await db().from("prompts").select("id").eq("workspace_id", ws).eq("metric_id", metricId).eq("submitter_id", me).order("id", { ascending: false }).limit(50);
    const ids = (prompts ?? []).map((p) => p.id as number);
    const [out, inn] = await Promise.all([
      ids.length
        // Sent, or held only by the viewer's Quiet Hours (queued with a time to wait for): either way it was asked.
        ? db().from("deliveries").select("id", head).eq("workspace_id", ws).eq("recipient_id", me).eq("kind", "prompt").in("prompt_id", ids)
          .or("mail_state.eq.sent,and(mail_state.eq.queued,not_before.not.is.null)")
        : Promise.resolve({ count: 0 }),
      db().from("observations").select("id", head).eq("workspace_id", ws).eq("metric_id", metricId).eq("submitter_id", me).in("source", [...IN_SOURCES]).gte("created_at", guide.started_at),
    ]);
    promptOut = (out.count ?? 0) > 0;
    valueIn = (inn.count ?? 0) > 0;
  }
  return {
    profileAnswered: Boolean(w.data?.industry) && Boolean(w.data?.country),
    clockSet: Boolean(w.data?.clock_set_at),
    packInstalled: (packs.count ?? 0) > 0,
    metrics: metrics.count ?? 0,
    startedFromScratch: guide?.starting_point === "scratch",
    preferenceReal: Boolean(first) && here.some((x) => x.way === first && x.state === "real"),
    testMessageSent: (test.count ?? 0) > 0,
    promptOut,
    valueIn,
    hasOtherMember: (members.count ?? 0) > 1,
    openInvitation: (invitations.count ?? 0) > 0,
    domainJoining: Boolean(w.data?.join_domain),
    contactSubmits: contacts.data === true,
    businessFunctionSet: (bf.count ?? 0) > 0,
  };
}

/** The guide for the actor, or null when they have none (a Guest, or the demo). The steps are worked out from what the
 * Workspace has now. The first time an Owner's or Admin's steps are all done, the Workspace's guide is marked
 * finished (and the Audit Log says so) and its Setup line goes away for everyone. */
export async function setupGuide(actor: Actor): Promise<SetupGuide | null> {
  if (!hasGuide(actor)) return null;
  const ws = actor.workspaceId;
  const [{ data: g }, { data: p }] = await Promise.all([
    db().from("setup_guides").select("started_at, finished_at, starting_point, first_metric_id, skipped").eq("workspace_id", ws).maybeSingle(),
    db().from("setup_guide_people").select("first_seen_at, hidden_at, skipped").eq("workspace_id", ws).eq("person_id", actor.personId).maybeSingle(),
  ]);
  const facts = await readFacts(actor, g ? { started_at: g.started_at as string, first_metric_id: g.first_metric_id as number | null, starting_point: g.starting_point as string | null } : null);
  const steps = setupSteps(facts, actor.role, { workspace: (g?.skipped as string[] | undefined) ?? [], person: (p?.skipped as string[] | undefined) ?? [] });
  let finishedAt = (g?.finished_at as string | null | undefined) ?? null;
  if (g && !finishedAt && steps.finished && (actor.role === "owner" || actor.role === "admin")) {
    const { data: done } = await db().from("setup_guides").update({ finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("workspace_id", ws).is("finished_at", null).select("workspace_id");
    if (done?.length) {
      finishedAt = new Date().toISOString();
      await audit(actor, { kind: "setup.finished", object: { type: "workspace", id: ws }, details: {} });
    }
  }
  const hidden = Boolean(p?.hidden_at);
  return {
    ...steps,
    started: Boolean(g),
    workspaceFinished: Boolean(finishedAt),
    hidden,
    seen: Boolean(p?.first_seen_at),
    startingPoint: (g?.starting_point as "scratch" | "pack" | null | undefined) ?? null,
    firstMetric: await seenFirstMetric(actor, (g?.first_metric_id as number | null | undefined) ?? null),
    lineShown: Boolean(g) && !hidden && !finishedAt && !steps.finished,
  };
}

// The guide's Metric, only when the viewer may see it (visibility is the product); never an archived one's name wrongly.
async function seenFirstMetric(actor: Actor, id: number | null): Promise<{ id: number; name: string } | null> {
  if (id === null || !(await canSee(actor, "metric", id))) return null;
  const { data } = await db().from("metrics").select("id, name").eq("id", id).eq("workspace_id", actor.workspaceId).is("archived_at", null).maybeSingle();
  const m = await openOne("metrics", actor.workspaceId, data);
  return m ? { id: m.id as number, name: m.name as string } : null;
}

function assertGuide(actor: Actor): void {
  if (!hasGuide(actor)) throw new Forbidden("There is no Setup Guide here.");
}

function assertManagesGuide(actor: Actor): void {
  assertGuide(actor);
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins set up the Workspace.");
}

/** Skips one step. Owners and Admins skip for the Workspace (one statement, so two skipping at once lose neither);
 * a Member skips one of their own two steps. The Audit Log records the step's name only. */
export async function skipSetupStep(actor: Actor, step: unknown): Promise<void> {
  assertGuide(actor);
  if (!isStep(step)) throw new Forbidden();
  let added: boolean;
  if (actor.role === "member") {
    if (!(MEMBER_STEPS as readonly string[]).includes(step)) throw new Forbidden();
    const { data, error } = await db().rpc("setup_guide_person_skip", { p_workspace: actor.workspaceId, p_person: actor.personId, p_step: step });
    if (error) throw new Error("The step could not be skipped.");
    added = data === true;
  } else {
    await startSetupGuide(actor);
    const { data, error } = await db().rpc("setup_guide_skip", { p_workspace: actor.workspaceId, p_step: step });
    if (error) throw new Error("The step could not be skipped.");
    added = data === true;
  }
  if (added) await audit(actor, { kind: "setup.step_skipped", object: { type: "workspace", id: actor.workspaceId }, details: { step } });
}

/** Hides the Setup line for the actor only. */
export async function hideSetupGuide(actor: Actor): Promise<void> {
  assertGuide(actor);
  await setPerson(actor, { hidden_at: new Date().toISOString() });
}

/** Shows the Setup line again for the actor, and makes the Workspace's guide when it has none (a Workspace made
 * before the guide opens it from Help). */
export async function reopenSetupGuide(actor: Actor): Promise<void> {
  assertGuide(actor);
  if (actor.role === "owner" || actor.role === "admin") await startSetupGuide(actor);
  await setPerson(actor, { hidden_at: null });
}

/** Notes that the actor has opened the guide, once: it opens by itself only until then. */
export async function markSetupGuideSeen(actor: Actor): Promise<void> {
  assertGuide(actor);
  const { data } = await db().from("setup_guide_people").select("first_seen_at").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  if (!data?.first_seen_at) await setPerson(actor, { first_seen_at: new Date().toISOString() });
}

async function setPerson(actor: Actor, change: { first_seen_at?: string; hidden_at?: string | null }): Promise<void> {
  const { error } = await db().from("setup_guide_people").upsert({ workspace_id: actor.workspaceId, person_id: actor.personId, ...change }, { onConflict: "workspace_id,person_id" });
  if (error) throw new Error("The Setup Guide could not be saved.");
}

/** Whether the actor's home should lead to the guide by itself: the Workspace has a guide row, the actor is an Owner,
 * Admin or Member outside the demo, and they have not opened it yet. Never throws; false for everyone else. */
export async function setupGuidePending(actor: Actor): Promise<boolean> {
  if (!hasGuide(actor)) return false;
  const [{ data: g }, { data: p }] = await Promise.all([
    db().from("setup_guides").select("workspace_id").eq("workspace_id", actor.workspaceId).maybeSingle(),
    db().from("setup_guide_people").select("first_seen_at").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle(),
  ]);
  return Boolean(g) && !p?.first_seen_at;
}

/** Chooses "Explore on my own" as the Workspace's starting point (Owners and Admins). */
export async function chooseExploreOnMyOwn(actor: Actor): Promise<void> {
  assertManagesGuide(actor);
  await startSetupGuide(actor);
  const { error } = await db().from("setup_guides").update({ starting_point: "scratch", updated_at: new Date().toISOString() }).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The choice could not be saved.");
}

/** Sets the Metric the guide tries both ways, or clears it (Owners and Admins). Only a Metric of the Workspace that the
 * actor sees: anything else is refused. */
export async function setSetupFirstMetric(actor: Actor, metricId: number | null): Promise<void> {
  assertManagesGuide(actor);
  if (metricId !== null) {
    if (!Number.isInteger(metricId) || metricId <= 0) throw new Forbidden();
    const { data } = await db().from("metrics").select("id").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
    if (!data || !(await canSee(actor, "metric", metricId))) throw new Forbidden();
  }
  await startSetupGuide(actor);
  const { error } = await db().from("setup_guides").update({ first_metric_id: metricId, updated_at: new Date().toISOString() }).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The choice could not be saved.");
}
