// Reading the facts for a Filled-in Value (GLOSSARY: Filled-in Value, Stand-in, Away, Due Date; spec 0046) and asking
// the rules (fill-in-rules.ts) once, for every way a value can come in for someone else: fillInValue (fill-in.ts) for the
// Metric's owner and the Workflow's owner, and the submission path (submissions.ts) for a Stand-in answering a Prompt.
// Internal to the core: it checks no Actor; the callers have established who `by` is. Everything is read inside the
// Workspace of the Metric.
import { db } from "./db";
import { visibleMetricIds } from "./access";
import { feedIdsAmong } from "./feed-people";
import { condensedOn } from "./condensed-values";
import { mayFillIn, type FillInFacts, type FillInVerdict } from "./fill-in-rules";
import { openWorkflowRow } from "./workflow-rows";
import { dueDate } from "./workflow-rules";
import { localTime } from "./workspace-clock";
import { getMetrics } from "./workspace-data";
import { isArchived } from "./metric-row";
import type { Metric, Workflow } from "./types";

/** Who enters, as the core knows them: a person (never a key here: a key is refused before anything is read). */
export type FilledInBy = { id: string; viaKey: boolean };

/** Whether Ziffr asked `personId`, in `submitterId`'s place, for this Metric and period: a Prompt of theirs says whom it
 * stands in for. Never guessed from the Tokens, so someone who also submits the Metric records each answer rightly. */
export async function standInWasAsked(ws: string, metricId: number, personId: string, submitterId: string, period: string): Promise<boolean> {
  const { data } = await db().from("prompts").select("id").eq("workspace_id", ws).eq("metric_id", metricId).eq("submitter_id", personId).eq("stands_in_for", submitterId).eq("period_start", period).limit(1);
  return Boolean(data?.length);
}

/** The verdict of mayFillIn for `by` entering a value for `submitterId` for a period of a Metric, with the facts read now. */
export async function fillInVerdict(ws: string, metric: Metric, period: string, by: FilledInBy, submitterId: string, demo = false): Promise<FillInVerdict> {
  const [{ data: membership }, feeds, { data: standIns }, asked, { data: row }, { data: state }, condensed, { data: workspace }] = await Promise.all([
    db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", by.id).maybeSingle(),
    feedIdsAmong([submitterId]),
    db().from("tokens").select("id").eq("workspace_id", ws).eq("metric_id", metric.id).eq("submitter_id", submitterId).eq("stand_in_id", by.id).is("stands_in_for", null).limit(1),
    standInWasAsked(ws, metric.id, by.id, submitterId, period),
    metric.workflow_id ? db().from("workflows").select("*").eq("id", metric.workflow_id).eq("workspace_id", ws).maybeSingle() : Promise.resolve({ data: null }),
    db().from("period_states").select("state").eq("metric_id", metric.id).eq("period_start", period).maybeSingle(),
    condensedOn(ws, metric.id, period),
    db().from("workspaces").select("time_zone").eq("id", ws).maybeSingle(),
  ]);
  const workflow = (await openWorkflowRow(ws, row)) as Workflow | null;
  const today = localTime(new Date(), String(workspace?.time_zone ?? "UTC")).day;
  const [{ data: away }, { count: values }] = await Promise.all([
    db().from("away").select("user_id").eq("user_id", submitterId).lte("starts", today).gte("ends", today).limit(1),
    db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("metric_id", metric.id).eq("period_start", period),
  ]);
  // Only a Workflow owner needs to see the Metric (the owner of the Metric sees it by owning it), asked only then.
  const needsSight = workflow !== null && workflow.owner_id === by.id && metric.owner_id !== by.id;
  const bySeesMetric = needsSight ? (await visibleMetricIds(ws, by.id, await getMetrics(ws))).has(metric.id) : true;
  const facts: FillInFacts = {
    by: { id: by.id, role: (membership?.role as FillInFacts["by"]["role"] | undefined) ?? "contact", viaKey: by.viaKey },
    submitterId,
    submitterIsFeed: feeds.has(submitterId),
    metric: { ownerId: metric.owner_id, derived: Boolean(metric.formula), archived: isArchived(metric), rule: metric.submission_rule },
    workflow: workflow ? { ownerId: workflow.owner_id, dueDate: dueDate(period, metric.period, workflow.config) } : null,
    isStandIn: Boolean(standIns?.length),
    standInAsked: asked,
    bySeesMetric,
    today,
    submitterAway: Boolean(away?.length),
    periodHasValue: (values ?? 0) > 0,
    periodLocked: state?.state === "locked",
    periodCondensed: condensed !== null,
    demo,
  };
  return mayFillIn(facts);
}
