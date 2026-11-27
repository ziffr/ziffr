// What a Pack set up, as it stands now (spec 0068, #1345; GLOSSARY: Pack, Metric, Submitter, Workflow, Contact): the
// one read everything after the set-up starts from. The record of the Set ups says where to look; what is still there,
// what the person sees and what they may change is asked of the Workspace as it is.
// Security: only Owners and Admins, never through a key, never in the demo, and only an install of their own
// Workspace. The record grants nothing: every change after the set-up goes through the operation a person uses by hand,
// which checks the right again. Only Metrics the person sees are handed on. A guided set-up that is not finished is
// left out, so nothing changes what its next step is still making.
import { Refused, type Actor } from "./actor";
import { getShares, visibleMetricIds } from "./access";
import { db } from "./db";
import { assertSetsUp, installedForSetup, type InstalledForSetup } from "./pack-setup-install";
import { setupStates, stillMade, type MadeThing } from "./pack-setup-record";
import { ended, installedSource } from "./pack-start";
import type { StartDeclarations, StartMetric } from "./pack-start-steps";
import type { Metric } from "./types";
import { getMetrics } from "./workspace-data";

/** A Metric a Set up made that is still there, not archived, and that the person sees. */
export type AfterMetric = {
  id: number;
  name: string;
  key: string;
  /** The line of a Repeat it was made for. */
  line: MadeThing["line"];
  metric: Metric;
  /** The Pack's entry it was made from, where the install still declares it. */
  entry: StartMetric | null;
  /** The person owns it; `edits`: they own it or are its Editor. */
  mine: boolean;
  edits: boolean;
  /** Whether people or programs send its values: not computed, and the Pack does not set it as a target. */
  provided: boolean;
  /** The Workflow it follows now, or null. */
  workflowId: number | null;
};

/** Everything after a set-up reads. */
export type PackAfter = {
  installId: number;
  name: string;
  declarations: StartDeclarations;
  installed: InstalledForSetup;
  /** The Set ups whose record is read: every finished one, and those of the detailed form. */
  setups: number[];
  /** What they made that is still there, in the order it was made. */
  made: MadeThing[];
  metrics: AfterMetric[];
  /** Who submits those Metrics and who stands in for them. */
  submitters: { metric: number; person: string; standIn: string | null }[];
};

/** What an install's Set ups made, as it is now (Owners and Admins; Forbidden for another Workspace's install). */
export async function packAfter(actor: Actor, installId: number): Promise<PackAfter> {
  assertSetsUp(actor);
  const ws = actor.workspaceId;
  const installed = await installedForSetup(actor, installId);
  const [source, states] = await Promise.all([installedSource(actor, installed.install.id), setupStates(actor, installed.install.id)]);
  const setups = states.filter((s) => !(s.guided && !s.finished)).map((s) => s.id);
  const seenThings = new Set<string>();
  const made = (await Promise.all(setups.map((id) => stillMade(actor, id)))).flat().filter((m) => {
    const one = `${m.kind} ${m.id}`;
    return !seenThings.has(one) && Boolean(seenThings.add(one));
  });
  const all = await getMetrics(ws);
  const [seen, shares] = await Promise.all([visibleMetricIds(ws, actor.personId, all), getShares(ws)]);
  const byId = new Map(all.map((m) => [m.id, m]));
  const editor = new Set(shares.filter((s) => s.object_type === "metric" && s.user_id === actor.personId && s.role === "editor").map((s) => s.object_id));
  const entries = new Map(source.declarations.metrics.map((m) => [m.key, m]));
  const metrics = made.flatMap((x): AfterMetric[] => {
    const m = x.kind === "metric" && seen.has(x.id) ? byId.get(x.id) : undefined;
    if (!m || (m as { archived_at?: unknown }).archived_at) return [];
    const entry = entries.get(x.key) ?? null;
    const mine = m.owner_id === actor.personId;
    return [{ id: m.id, name: m.name, key: x.key, line: x.line, metric: m, entry, mine, edits: mine || editor.has(m.id), provided: !m.formula && Boolean(entry?.takesValues) && entry?.comesFrom !== "target", workflowId: null }];
  });
  const ids = metrics.map((m) => m.id);
  const [{ data, error }, { data: follows, error: unread }] = await Promise.all([
    db().from("tokens").select("metric_id, submitter_id, stand_in_id").eq("workspace_id", ws).is("stands_in_for", null).in("metric_id", ids),
    db().from("metrics").select("id, workflow_id").eq("workspace_id", ws).in("id", ids),
  ]);
  if (error || unread) throw new Error("What was set up could not be read.");
  const flows = new Map((follows ?? []).map((m) => [Number(m.id), (m.workflow_id as number | null) ?? null]));
  return {
    installId: installed.install.id, name: installed.install.name, declarations: source.declarations, installed, setups, made,
    metrics: metrics.map((m) => ({ ...m, workflowId: flows.get(m.id) ?? null })),
    submitters: (data ?? []).map((t) => ({ metric: Number(t.metric_id), person: String(t.submitter_id), standIn: (t.stand_in_id as string | null) ?? null })),
  };
}

/** Refuses a change in a trial that has ended. */
export async function assertStillOpen(actor: Actor): Promise<void> {
  const why = await ended(actor);
  if (why) throw new Refused(why);
}
