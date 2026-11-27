// Filling in a value for someone else (GLOSSARY: Filled-in Value, Stand-in, Metric owner, Workflow, Due Date, Away,
// Submission Rule, Lock; spec 0046): the Metric's owner or the owner of its Workflow enters a value for a Submitter who
// has not sent it, once the period's Due Date has passed or while the Submitter is Away. It is recorded as the
// Submitter's value, always marked with who entered it, and goes through the same submission as any value (the
// Submission Rule, Lock, Unusual Value check, Approvals, Tells, Alerts, Personal Webhooks). A Stand-in's answer to a
// Prompt sent in someone's place is a Filled-in Value too, but it arrives through that Prompt (submissions.ts), not here.
// Security (AGENTS.md rule 3 and 4): never for an Access Key, a Guest, oneself or a Feed; who may is decided by
// mayFillIn (fill-in-rules.ts) from facts read from the database, not from anything the browser says; the Metric must
// be one the actor sees; what comes back names no one else.
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { askedAfter, formNote, withNoteWords, type FormResult } from "./form-submit";
import { numberStyleOf } from "./workspace-settings";
import { readNumber } from "./numbers";
import { parseBreakdown } from "./parse";
import { assertSeesMetrics } from "./sharing";
import { submissionEffects, submitValue, type SubmissionEffects, type SubmissionResult } from "./submissions";
import { getMetrics } from "./workspace-data";

/** The longest text of a total or a Breakdown the form takes, as for the Metric's own page. */
const MAX_VALUE_TEXT = 40;
const MAX_BREAKDOWN_TEXT = 5000;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What the form sends: the Metric, the period's first day, the Submitter it is for, and the value as typed (or a number)
 * with an optional Breakdown as pasted lines and an optional note, which is the note of whoever enters the value. */
export type FillInInput = { metricId: number; period: string; for: string; value: string | number; breakdown?: string; note?: string };

const refused = (outcome: string, detail: string): SubmissionResult => ({ ok: false, outcome, detail });

/** The Metric's owner or its Workflow's owner fills in a value for a Submitter of the Metric (spec 0046). Returns the
 * submission's own words, a refusal in plain words included; throws Forbidden for an Access Key and for a Metric the actor does
 * not see. In the demo it is recorded only where visitors may change it (spec 0051). */
export async function fillInValue(actor: Actor, input: FillInInput, effects: SubmissionEffects = submissionEffects): Promise<FormResult> {
  refuseInDemo(actor, "fill-in-actions:fillInForSubmitter");
  // Never an Access Key, so neither the API nor the MCP Server fills in for anyone.
  if (actor.key || !actor.personId) throw new Forbidden("Values for someone else are entered in the app or by answering the Prompt.");
  const metricId = Number(input.metricId);
  const forId = String(input.for ?? "");
  const period = String(input.period ?? "");
  if (!Number.isInteger(metricId) || !ID.test(forId) || !DAY.test(period)) return refused("rejected_fill_in", "Choose a Metric, a period and the person to fill in for.");
  const metric = (await getMetrics(actor.workspaceId)).find((m) => m.id === metricId);
  if (!metric) throw new Forbidden();
  await assertSeesMetrics(actor, [metricId]);

  // The Submitter's own Token for the Metric: the value is theirs, recorded with it. Someone who does not submit it has none.
  const { data: tokens } = await db().from("tokens").select("code").eq("workspace_id", actor.workspaceId).eq("metric_id", metricId).eq("submitter_id", forId).is("stands_in_for", null).limit(1);
  const code = tokens?.[0]?.code as string | undefined;
  if (!code) return refused("rejected_fill_in", "This person does not submit this Metric.");

  const style = await numberStyleOf(actor.workspaceId);
  const pasted = String(input.breakdown ?? "").trim().slice(0, MAX_BREAKDOWN_TEXT);
  const bd = pasted ? parseBreakdown(pasted, style, { parents: true }) : null;
  if (pasted && !bd) return refused("rejected_no_value", "Couldn’t read the breakdown. Give at least two rows, each a label and a number.");
  // Only the rows at the top add up to the whole: a part is already in the row it is a part of (spec 0041, ticket 12).
  const sum = bd ? bd.rows.reduce((a, r) => (r.parent ? a : a + r.value), 0) : 0;
  const typed = typeof input.value === "number" ? "" : String(input.value ?? "").trim().slice(0, MAX_VALUE_TEXT);
  const value = typeof input.value === "number" ? (Number.isFinite(input.value) ? input.value : null) : typed ? readNumber(typed, style) : bd ? (bd.total ?? sum) : null;
  if (value === null) return refused("rejected_no_value", typed ? "Couldn’t read a number in the value." : "Type a value, or paste a breakdown.");

  const result = await submitValue({
    source: "web_form", sender: code, workspaceId: actor.workspaceId, text: typed || String(value), typed: true, filledIn: { by: actor.personId },
    value: { value, ...(bd ? { breakdown: bd.rows } : {}) }, period, ...formNote(input.note),
  }, effects);
  return askedAfter(withNoteWords(result), actor.workspaceId, { personId: actor.personId });
}
