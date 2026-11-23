// The Workflow step Tell, for people (GLOSSARY: Tell, Workflow, Group; spec 0032, ticket #377): what the editor needs
// before it saves ("Cora cannot see Sales and will not be told") and each person's "stop telling me" per Workflow.
// Firing is tell-firing.ts. Every function takes the Actor first.
// Security: a recipient may stop a Workflow they are told by, and only see its name while they are one of its recipients
// and see one of its Metrics; the editor's list of who is skipped names only Metrics the owner sees and people the owner
// chose themselves. A person unknown to the Workflow is answered like a Workflow that is not there.
import { openWorkflowRow, openWorkflowRows } from "./workflow-rows";
import { Forbidden, type Actor } from "./actor";
import { getGroups, visibleMetricIds } from "./access";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { tellRecipients, type TellStep } from "./tell-firing";
import { listWebhooks, mayManageWebhooks } from "./webhooks";
import { getMetrics } from "./workspace-data";
import { infoItems } from "./checklist-rules";
import type { WorkflowStep } from "./types";

const NOT_FOUND = "That Workflow was not found.";

/** The Tell steps of a stored config. */
const tellSteps = (config: unknown): TellStep[] => ((config as { steps?: WorkflowStep[] } | null)?.steps ?? []).filter((s): s is TellStep => s.type === "tell");

/** A Group a Tell step can name: its id, name and how many people it holds. */
export type TellGroup = { id: number; name: string; members: number };

/** What the Workflow editor shows about its Tell steps: the Groups to pick from, and for a saved Workflow of the actor
 * who is told and who is left out for lack of sight of a Metric. `skipped` lists only Metrics the actor sees. */
export type TellEditorFacts = {
  groups: TellGroup[];
  /** The Webhooks a step may name, for an Owner or Admin only (empty for anyone else): the name and whether it is on and
   * chose `alert.fired`; never the address or the secret. */
  webhooks: { id: string; name: string; enabled: boolean; hearsAlerts: boolean }[];
  steps: { id: string; skipped: { person: string; metric: string }[] }[];
};

/** The Groups and, for a saved Workflow the actor owns, who each Tell step reaches and who it skips. */
export async function tellEditorFacts(actor: Actor, workflowId: number | null): Promise<TellEditorFacts> {
  // A Guest makes no Workflows, so they are not shown the Workspace's Groups to tell (rule 3).
  if (actor.role === "guest") return { groups: [], webhooks: [], steps: [] };
  const groups = (await getGroups(actor.workspaceId)).map((g) => ({ id: g.id, name: g.name, members: g.members.length }));
  const webhooks = mayManageWebhooks(actor) ? (await listWebhooks(actor)).map((w) => ({ id: w.id, name: w.name, enabled: w.enabled, hearsAlerts: w.events.includes("alert.fired") })) : [];
  if (workflowId === null || !Number.isInteger(workflowId)) return { groups, webhooks, steps: [] };
  const wf = await openWorkflowRow(actor.workspaceId, (await db().from("workflows").select("id, owner_id, config").eq("id", workflowId).eq("workspace_id", actor.workspaceId).maybeSingle()).data);
  if (!wf || wf.owner_id !== actor.personId) return { groups, webhooks, steps: [] };
  const steps = tellSteps(wf.config);
  if (!steps.length) return { groups, webhooks, steps: [] };
  const [metrics, { data: on }] = await Promise.all([getMetrics(actor.workspaceId), db().from("metrics").select("id").eq("workspace_id", actor.workspaceId).eq("workflow_id", workflowId).is("archived_at", null).is("formula", null)]);
  const mine = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  const onIt = metrics.filter((m) => (on ?? []).some((o) => o.id === m.id) && mine.has(m.id));
  const out: TellEditorFacts["steps"] = [];
  for (const step of steps) {
    const all = await tellRecipients(actor.workspaceId, workflowId, step);
    const skipped: { person: string; metric: string }[] = [];
    for (const person of all) {
      const sees = await visibleMetricIds(actor.workspaceId, person, metrics);
      for (const m of onIt) if (!sees.has(m.id)) skipped.push({ person, metric: m.name });
    }
    out.push({ id: step.id, skipped });
  }
  return { groups, webhooks, steps: out };
}

/** A Workflow that tells the person, as Your settings lists it. */
export type TellSubscription = { workflowId: number; name: string; stopped: boolean };

/** The Workflows whose Tell steps tell the actor (named or through a Group) and that have a Metric the actor sees, with
 * whether they said "stop telling me". Only the actor's own. */
export async function listTellSubscriptions(actor: Actor): Promise<TellSubscription[]> {
  const [{ data: sealedFlows }, { data: stops }, groups] = await Promise.all([
    db().from("workflows").select("id, name, config").eq("workspace_id", actor.workspaceId),
    db().from("tell_stops").select("workflow_id").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId),
    getGroups(actor.workspaceId),
  ]);
  const flows = await openWorkflowRows(actor.workspaceId, sealedFlows);
  const stopped = new Set((stops ?? []).map((s) => Number(s.workflow_id)));
  const mineGroups = new Set(groups.filter((g) => g.members.includes(actor.personId)).map((g) => g.id));
  const told = (flows ?? []).filter((w) => tellSteps(w.config).some((s) => s.people.includes(actor.personId) || s.groups.some((g) => mineGroups.has(g))));
  // A Checklist Item for information (spec 0045) tells by the same switch: the person is named, so they got its words
  // already and may stop the next ones, whether or not they see any Metric of the Workflow.
  const itemTold = (flows ?? []).filter((w) => infoItems((w.config as { steps?: { type: string }[] } | null)?.steps ?? []).some((i) => i.people.includes(actor.personId) || i.groups.some((g) => mineGroups.has(g))));
  const out = new Map<number, TellSubscription>();
  for (const w of itemTold) out.set(Number(w.id), { workflowId: Number(w.id), name: String(w.name), stopped: stopped.has(Number(w.id)) });
  if (told.length) {
    const metrics = await getMetrics(actor.workspaceId);
    const seen = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
    const { data: on } = await db().from("metrics").select("id, workflow_id").eq("workspace_id", actor.workspaceId).in("workflow_id", told.map((w) => w.id)).is("archived_at", null).is("formula", null);
    const open = new Set((on ?? []).filter((m) => seen.has(Number(m.id))).map((m) => Number(m.workflow_id)));
    for (const w of told.filter((x) => open.has(Number(x.id)))) out.set(Number(w.id), { workflowId: Number(w.id), name: String(w.name), stopped: stopped.has(Number(w.id)) });
  }
  return [...out.values()].sort((x, y) => x.workflowId - y.workflowId);
}

/** The actor says "stop telling me" for a Workflow, or lets it tell them again. Only the actor's own, only for a Workflow
 * that tells them; never in the demo. */
export async function setTellStopped(actor: Actor, workflowId: number, stopped: boolean): Promise<void> {
  refuseInDemo(actor);
  if (!Number.isInteger(workflowId) || typeof stopped !== "boolean") throw new Forbidden(NOT_FOUND);
  if (!stopped) {
    await db().from("tell_stops").delete().eq("workflow_id", workflowId).eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId);
    return;
  }
  if (!(await listTellSubscriptions(actor)).some((w) => w.workflowId === workflowId)) throw new Forbidden(NOT_FOUND);
  await db().from("tell_stops").upsert({ workflow_id: workflowId, person_id: actor.personId, workspace_id: actor.workspaceId }, { onConflict: "workflow_id,person_id", ignoreDuplicates: true });
}
