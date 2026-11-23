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
import { isGuest } from "./fill-in-tell";
import type { FillInRole } from "./fill-in-rules";
import type { Metric, SourceId, Token, Workflow } from "./types";

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
  const workflowId = (metric as Metric & { workflow_id?: number | null }).workflow_id;
  const [{ data: membership }, feeds, { data: standIns }, asked, { data: row }, { data: state }, condensed, { data: workspace }] = await Promise.all([
    db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", by.id).maybeSingle(),
    feedIdsAmong([submitterId]),
    db().from("tokens").select("id").eq("workspace_id", ws).eq("metric_id", metric.id).eq("submitter_id", submitterId).eq("stand_in_id", by.id).is("stands_in_for", null).limit(1),
    standInWasAsked(ws, metric.id, by.id, submitterId, period),
    workflowId ? db().from("workflows").select("*").eq("id", workflowId).eq("workspace_id", ws).maybeSingle() : Promise.resolve({ data: null }),
    db().from("period_states").select("state").eq("metric_id", metric.id).eq("period_start", period).maybeSingle(),
    condensedOn(ws, metric.id, period),
    db().from("workspaces").select("time_zone").eq("id", ws).maybeSingle(),
  ]);
  const workflow = (await openWorkflowRow(ws, row)) as Workflow | null;
  const today = localTime(new Date(), String(workspace?.time_zone ?? "UTC")).day;
  const [{ data: away }, { count: values }] = await Promise.all([
    db().from("away").select("user_id, set_by").eq("user_id", submitterId).lte("starts", today).gte("ends", today).limit(1),
    db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("metric_id", metric.id).eq("period_start", period),
  ]);
  // Only a Workflow owner needs to see the Metric (the owner of the Metric sees it by owning it), asked only then.
  const needsSight = workflow !== null && workflow.owner_id === by.id && metric.owner_id !== by.id;
  const bySeesMetric = needsSight ? (await visibleMetricIds(ws, by.id, await getMetrics(ws))).has(metric.id) : true;
  const awaySetBy = (away?.[0]?.set_by as string | null | undefined) ?? null;
  const awayCounts = away?.length ? await awayMayOpen(ws, submitterId, awaySetBy) : false;
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
    submitterAway: awayCounts,
    awaySetBy: awayCounts ? awaySetBy : null,
    periodHasValue: (values ?? 0) > 0,
    periodLocked: state?.state === "locked",
    periodCondensed: condensed !== null,
    demo,
  };
  return mayFillIn(facts);
}

/** Whether an Away entry opens filling in: Away is global, so only one the person set themselves, or an Owner or Admin of this
 * Workspace set, counts; one set by anyone else (an Admin of another Workspace, say) does not. */
async function awayMayOpen(ws: string, personId: string, setBy: string | null): Promise<boolean> {
  if (!setBy) return false;
  if (setBy === personId) return true;
  const { data } = await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", setBy).maybeSingle();
  return data?.role === "owner" || data?.role === "admin";
}

/** A Filled-in Value as the submission path records it: who enters it, for whom, and in which role. */
export type Filled = { by: string; forId: string; as: FillInRole; /** Who set the submitter's Away entry that opened it, if one did. */ awayBy: string | null };
/** What asking found: nothing is filled in, the words of a refusal, or the Filled-in Value to record. */
export type FillStage = null | { refused: string } | { filled: Filled };

const NOT_BY_KEY = "Values for someone else are entered in the app or by answering the Prompt.";

/** The Metric's or the Workflow's owner `by` entering a value for the person whose own Token is used (fillInValue, on the
 * web form with a value read already): null when this submission is no such value. Asked before a locked period is looked at,
 * since a locked period is refused here and not proposed as a Correction in the submitter's name. */
export async function ownerFillStage(ws: string, metric: Metric, period: string, i: { by: string | undefined; source: SourceId; given: boolean; preview: boolean }, senderId: string | null, token: Token): Promise<FillStage> {
  if (!i.by || i.source !== "web_form" || !i.given || i.preview || !senderId) return null;
  // Entered for the submitter by their own Token only, never by a Stand-in's.
  if (token.stands_in_for) return { refused: "A value is entered for the person whose own Token it is." };
  const v = await fillInVerdict(ws, metric, period, { id: i.by, viaKey: false }, senderId);
  return v.ok ? { filled: { by: i.by, forId: senderId, as: v.as, awayBy: v.awayBy } } : { refused: v.refusal };
}

/** A Stand-in's answer to a Prompt sent in someone's place (its Token or the Prompt says whom for): the submitter's value,
 * entered by the Stand-in. Asked after the Lock, so a late one is still proposed as a Correction as any late value is. A Guest
 * who is a Stand-in keeps recording their own value, as before; nothing is filled in by a preview, which saves nothing. */
export async function standInFillStage(ws: string, metric: Metric, period: string, i: { source: SourceId; preview: boolean }, senderId: string | null, standsFor: string | null): Promise<FillStage> {
  if (!standsFor || !senderId || i.preview || (await isGuest(ws, senderId))) return null;
  // Through an Access Key it is refused for good: the app and the Prompt's answer are the ways (spec 0046).
  if (i.source === "api") return { refused: NOT_BY_KEY };
  const v = await fillInVerdict(ws, metric, period, { id: senderId, viaKey: false }, standsFor);
  return v.ok ? { filled: { by: senderId, forId: standsFor, as: v.as, awayBy: v.awayBy } } : { refused: v.refusal };
}
