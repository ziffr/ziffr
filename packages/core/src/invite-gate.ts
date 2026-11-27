// Whether somebody can be invited right now, and if not, why (spec 0040; ADR 0015; GLOSSARY: Invitation, Trial
// Workspace, Trial Limit, Submitter, Ask me now, Record a value). The database keeps the rule and refuses whatever this
// says; this read only lets the invite forms say why they are closed and what opens them, before anyone presses.
// Visibility is the product: only Owners and Admins, who may invite, get an answer. The one Metric it names is the
// asking Owner's own: one they send values for, with what Record a value offers them. Nothing of anyone else is returned.
import { can, Forbidden, type Actor } from "./actor";
import { canAskNow } from "./ask-now";
import { db } from "./db";
import { recordingOffer, type RecordingOffer } from "./record-own-value";
import { openRows } from "./sealed-columns";
import { DEMO_WORKSPACE_ID } from "./team";
import { trialLimitsInEffect } from "./trial-limits-in-effect";
import { trialEndsAt } from "./trials";

/** How many of the Owner's Metrics are tried for one they can send a value for. */
const MAX_TRIED = 20;

/** A Metric the asking Owner can send a first value for: by Ask me now, by Record a value, or both. */
export type InviteMetric = { id: number; name: string; slug: string; canAsk: boolean; offer: RecordingOffer | null };

/** Open, or why invitations are refused: the trial ended, it waits for an Owner's first value (`you` when the asker is
 * an Owner, who can send it), or every place of the trial is taken. */
export type InviteGate =
  | { state: "open" }
  | { state: "ended" }
  | { state: "waiting"; you: boolean; metric: InviteMetric | null; firstSteps: boolean }
  | { state: "full"; limit: number };

/** Whether a Trial Workspace's Owner has recorded a first value of their own (never one that came in through a Feed or
 * an Import), which opens invitations in a trial. The same rule as the database's. */
export async function ownerHasOwnValue(ws: string): Promise<boolean> {
  const { data: owners } = await db().from("memberships").select("user_id").eq("workspace_id", ws).eq("role", "owner");
  const ids = (owners ?? []).map((o) => o.user_id as string);
  if (!ids.length) return false;
  const { count } = await db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).in("submitter_id", ids).eq("imported", false);
  return (count ?? 0) > 0;
}

// The Metric to offer an Owner: the Setup Guide's First Metric, then the trial's Test Metric, then their newest, taking
// the first they can really send a value for.
async function metricToSend(actor: Actor): Promise<InviteMetric | null> {
  const ws = actor.workspaceId;
  const [{ data: tokens }, { data: guide }, { data: space }] = await Promise.all([
    db().from("tokens").select("metric_id").eq("workspace_id", ws).eq("submitter_id", actor.personId),
    db().from("setup_guides").select("first_metric_id").eq("workspace_id", ws).maybeSingle(),
    db().from("workspaces").select("trial_test_metric_id").eq("id", ws).single(),
  ]);
  const ids = [...new Set((tokens ?? []).map((t) => t.metric_id as number))];
  if (!ids.length) return null;
  const { data: rows } = await db().from("metrics").select("id, name, slug").eq("workspace_id", ws).in("id", ids).is("archived_at", null).order("id", { ascending: false });
  const first = [guide?.first_metric_id, space?.trial_test_metric_id];
  const rank = (id: number) => first.indexOf(id) + 1 || first.length + 1;
  const ordered = [...(rows ?? [])].sort((a, b) => rank(a.id as number) - rank(b.id as number)).slice(0, MAX_TRIED);
  for (const row of ordered) {
    const id = row.id as number;
    const [canAsk, offer] = await Promise.all([canAskNow(actor, id), recordingOffer(actor, id)]);
    if (!canAsk && !offer) continue;
    const [open] = await openRows("metrics", ws, [row]);
    return { id, name: String(open.name), slug: String(open.slug), canAsk, offer };
  }
  return null;
}

/** Whether the actor (an Owner or Admin) can invite somebody now, and if not, why. Always open outside a trial and in
 * the demo, which refuses invitations in its own words. An Access Key and everyone else are refused. */
export async function inviteGate(actor: Actor): Promise<InviteGate> {
  if (!can(actor, "manage-members")) throw new Forbidden();
  const ws = actor.workspaceId;
  const ends = ws === DEMO_WORKSPACE_ID ? null : await trialEndsAt(ws);
  if (!ends) return { state: "open" };
  if (ends.getTime() <= Date.now()) return { state: "ended" };
  if (!(await ownerHasOwnValue(ws))) {
    const you = actor.role === "owner";
    // An Owner of a Workspace First Steps made is sent to its value screen.
    const [metric, guide] = you
      ? await Promise.all([metricToSend(actor), db().from("setup_guides").select("first_steps_at").eq("workspace_id", actor.workspaceId).maybeSingle()])
      : [null, null];
    return { state: "waiting", you, metric, firstSteps: Boolean(guide?.data?.first_steps_at) };
  }
  // Members, open invitations and just-accepted ones, counted by the function the database's own refusal uses.
  const [{ data: taken, error }, limits] = await Promise.all([db().rpc("trial_people", { p_workspace: ws }), trialLimitsInEffect()]);
  if (error) throw new Error("The trial's places could not be counted.");
  return Number(taken) >= limits.people ? { state: "full", limit: limits.people } : { state: "open" };
}
