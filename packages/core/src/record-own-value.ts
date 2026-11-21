// Record a value from the Metric's own page (GLOSSARY: Submitter, Token, Submission Rule, Lock, Approval, Breakdown).
// A signed-in person who submits a Metric on the web form types its value for the current or an earlier period. It goes
// through submitValue with their own Token, exactly as their form link or a paste does, so the Submission Rule, Locks,
// the Metric's Workflow (checks and Approvals), Retention's refusals and the intake log all apply and the answer is the
// one in plain words. Who may: only someone who holds a valid Token for the Metric (their own, or a Stand-in's while
// they stand in) and sees it; an Owner or Admin who does not submit it does not record it here either. Nothing is
// recorded in a demo.
import { Forbidden, type Actor } from "./actor";
import { assertSeesMetrics } from "./sharing";
import { visibleMetricIds } from "./access";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { yearStartOf } from "./fiscal-year";
import { formatValue, RULE_LABEL } from "./format";
import { readNumber } from "./numbers";
import type { NumberStyle } from "./number-style";
import { parseBreakdown } from "./parse";
import { JANUARY, periodLabel, periodStart, shiftPeriod, type YearStart } from "./periods";
import { submissionEffects, submitValue, type SubmissionEffects, type SubmissionResult } from "./submissions";
import { tokenValid, type TokenRow } from "./tokens";
import type { Metric } from "./types";
import { getLatestObservations, getMetrics } from "./workspace-data";
import { numberStyleOf } from "./workspace-settings";

/** How many periods the form offers: the current one and the ones before it. */
export const RECORDABLE_PERIODS = 12;
/** The longest text of a total or a Breakdown the form takes; more is cut off, as on the form link. */
const MAX_VALUE_TEXT = 40;
const MAX_BREAKDOWN_TEXT = 5000;

/** What the form needs, and nothing about anyone else: the Metric's name and rule, the periods it may be recorded for
 * with the value each already has, and how to read numbers. */
export type RecordingOffer = {
  metricId: number;
  name: string;
  /** What a second value for the same period does, in words. */
  rule: string;
  placeholder: string;
  numberStyle: NumberStyle;
  /** The newest period first; `has` is the value it holds now, written the way the Workspace writes values. */
  periods: { start: string; label: string; has: string | null }[];
};

type Own = { metric: Metric; code: string; yearStart: YearStart };

/** The Metric and the Token code the actor records with, or null: a signed-in person, a Metric they see that takes
 * values on the web form and is neither Derived nor archived, and a valid Token of theirs for it. */
async function ownToken(actor: Actor, metricId: number): Promise<Own | null> {
  if (actor.key || !actor.personId) return null;
  const metric = (await getMetrics(actor.workspaceId)).find((m) => m.id === metricId);
  if (!metric || metric.formula || metric.archived_at || !metric.sources.includes("web_form")) return null;
  try { await assertSeesMetrics(actor, [metricId]); } catch (e) { if (e instanceof Forbidden) return null; throw e; }
  const { data } = await db().from("tokens").select("code, metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").eq("workspace_id", actor.workspaceId).eq("metric_id", metricId);
  const all = (data ?? []) as (TokenRow & { code: string })[];
  const mine = all.filter((t) => t.submitter_id === actor.personId);
  // Their own Token first: a Stand-in's is used only when they hold no Token of their own for the Metric.
  const ordered = [...mine].sort((a, b) => Number(Boolean(a.stands_in_for)) - Number(Boolean(b.stands_in_for)));
  const token = ordered.find((t) => tokenValid(t, all));
  if (!token) return null;
  const ys = metric.period === "quarter" || metric.period === "year" ? await yearStartOf(actor.workspaceId) : JANUARY;
  return { metric, code: token.code, yearStart: ys };
}

/** What the Record a value form offers the actor for a Metric, or null when they do not submit it (the page then shows
 * no button). The same check as recording, so a button is shown only to someone who can use it. */
export async function recordingOffer(actor: Actor, metricId: number): Promise<RecordingOffer | null> {
  return (await recordingOffers(actor, [metricId]))[metricId] ?? null;
}

/** The offers for several Metrics at once (the Metrics list), keyed by Metric id, with one entry only for each the actor
 * submits: the same checks as recording, made with a few reads for all of them instead of a few for each. */
export async function recordingOffers(actor: Actor, metricIds: number[]): Promise<Record<number, RecordingOffer>> {
  if (actor.key || !actor.personId || !metricIds.length) return {};
  const ws = actor.workspaceId, person = actor.personId;
  const wanted = new Set(metricIds);
  const metrics = await getMetrics(ws);
  const visible = await visibleMetricIds(ws, person, metrics);
  const candidates = metrics.filter((m) => wanted.has(m.id) && visible.has(m.id) && !m.formula && !m.archived_at && m.sources.includes("web_form"));
  if (!candidates.length) return {};
  const { data } = await db().from("tokens").select("code, metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").eq("workspace_id", ws).in("metric_id", candidates.map((m) => m.id));
  const tokens = (data ?? []) as (TokenRow & { code: string })[];
  const submits = candidates.filter((m) => tokens.some((t) => t.metric_id === m.id && t.submitter_id === person && tokenValid(t, tokens.filter((o) => o.metric_id === m.id))));
  if (!submits.length) return {};
  const [style, yearStart] = await Promise.all([numberStyleOf(ws), yearStartOf(ws)]);
  const spans = submits.map((metric) => {
    const ys = metric.period === "quarter" || metric.period === "year" ? yearStart : JANUARY;
    const current = periodStart(new Date(), metric.period, ys);
    return { metric, ys, starts: Array.from({ length: RECORDABLE_PERIODS }, (_, i) => shiftPeriod(current, metric.period, -i)) };
  });
  // One read of the values for all: from the oldest period offered to the newest, then each Metric takes its own.
  const all = spans.flatMap((s) => s.starts).sort();
  const found = await getLatestObservations(ws, { metricIds: submits.map((m) => m.id), from: all[0], to: all[all.length - 1] });
  const offers: Record<number, RecordingOffer> = {};
  for (const { metric, ys, starts } of spans) {
    const have = new Map(found.filter((o) => o.metric_id === metric.id).map((o) => [o.period_start, Number(o.value)]));
    offers[metric.id] = {
      metricId: metric.id,
      name: metric.name,
      rule: RULE_LABEL[metric.submission_rule],
      placeholder: metric.unit || (metric.format === "currency" ? "€" : metric.format === "percent" ? "%" : "Value"),
      numberStyle: style,
      periods: starts.map((start) => ({ start, label: periodLabel(start, metric.period, ys), has: have.has(start) ? formatValue(metric, have.get(start)!, style) : null })),
    };
  }
  return offers;
}

/** What the form sends: the total as typed, the Breakdown as pasted lines, and the period start if not the current one. */
export type RecordInput = { value: string; breakdown?: string; period?: string };

const refused = (outcome: string, detail: string): SubmissionResult => ({ ok: false, outcome, detail });

/** Records a value for the actor from the Metric's page, with their own Token, through submitValue. The answer is the
 * intake's own words (a Lock, an Approval, a rule, Retention). Refuses, in words, whoever does not submit the Metric.
 * The text is read here with the Workspace's Number Style, the period must be one the form offers, and nothing a
 * browser sends reaches submitValue except as that read value. */
export async function recordOwnValue(actor: Actor, metricId: number, input: RecordInput, effects: SubmissionEffects = submissionEffects): Promise<SubmissionResult> {
  refuseInDemo(actor);
  const own = await ownToken(actor, Number(metricId));
  if (!own) throw new Forbidden("You do not submit this Metric, so you cannot record a value for it here.");
  const { metric, code, yearStart } = own;
  const style = await numberStyleOf(actor.workspaceId);
  const typed = String(input.value ?? "").trim().slice(0, MAX_VALUE_TEXT);
  const pasted = String(input.breakdown ?? "").trim().slice(0, MAX_BREAKDOWN_TEXT);
  const bd = pasted ? parseBreakdown(pasted, style) : null;
  if (pasted && !bd) return refused("rejected_no_value", "Couldn’t read the breakdown. Give at least two rows, each a label and a number.");
  const sum = bd ? bd.rows.reduce((a, r) => a + r.value, 0) : 0;
  const value = typed ? readNumber(typed, style) : bd ? (bd.total ?? sum) : null;
  if (value === null) return refused("rejected_no_value", typed ? "Couldn’t read a number in the value." : "Type a value, or paste a breakdown.");
  // Only a period the form offers: the current one, or one of the periods before it.
  const current = periodStart(new Date(), metric.period, yearStart);
  const period = input.period ? String(input.period) : current;
  const offered = Array.from({ length: RECORDABLE_PERIODS }, (_, i) => shiftPeriod(current, metric.period, -i));
  if (!offered.includes(period)) return refused("rejected_period", `Choose one of the ${metric.period}s the form lists.`);
  return submitValue({ source: "web_form", sender: code, workspaceId: actor.workspaceId, text: typed || "breakdown", typed: true, value: { value, ...(bd ? { breakdown: bd.rows } : {}) }, period }, effects);
}
