// @ts-nocheck
// Condensed Values (GLOSSARY: Condensed Value, Retention; spec 0033, ticket #380): the storage of the one value that
// stands for a longer period, the loader that gives it to the charts, and the refusal of a value for a period it
// stands for. A Condensed Value is made at a moment and never edited; what makes one (the setting, the job that
// deletes the originals after checking the numbers) comes in later tickets. Security: its numbers are sealed with the
// Workspace Key (spec 0028); the loader answers only the Metrics it is asked about, so the caller (access.ts) asks for
// the ones the viewer sees; writing is for the Metric's owner and Owners and Admins, never a key, never the demo.
import { randomUUID } from "node:crypto";
import { format } from "date-fns";
import { type CondensedPoint, type CondensedSpan, type TargetPart } from "./condensed-parts";
import { latestOfEach } from "./display-periods";
import { db } from "./db";
import { yearStartFor } from "./fiscal-year";
import { condense, condensedTarget, keptFrom, MIN_KEEP_MONTHS, retentionProblem, type CondenseInto } from "./retention-rules";
import { isPeriodStart, periodEnd } from "./periods";
import { openRows, sealRow } from "./sealed-columns";
import { allRows } from "./workspace-data";
import type { Metric } from "./types";

/** The database's code for a value refused because its period was condensed (trigger observations_not_condensed). */
export const CONDENSED_CODE = "ZF446";
/** The database's code for a span that overlaps one condensed already (trigger condensed_values_no_overlap). */
const OVERLAP_CODE = "ZF442";

/** What every Source answers for a value for a condensed period, in the same words: the day it was condensed. */
export function condensedRefusal(on: string): string {
  return `This period was condensed on ${format(new Date(`${on}T12:00:00`), "d MMMM yyyy")}.`;
}

/** The most Metrics one lookup of spans asks about at once (the database's filter list, not a limit of Ziffr's). */
const AT_A_TIME = 200;

/** The condensed spans of some Metrics of a Workspace: where a period lies in one, and since when. No numbers, so it
 * is cheap; a value for a period inside one is refused. */
export async function condensedSpans(ws: string, metricIds: readonly number[]): Promise<{ metric_id: number; period_start: string; period_end: string; condensed_on: string }[]> {
  const out: { metric_id: number; period_start: string; period_end: string; condensed_on: string }[] = [];
  for (let i = 0; i < metricIds.length; i += AT_A_TIME) {
    const ids = metricIds.slice(i, i + AT_A_TIME);
    out.push(...await allRows<{ metric_id: number; period_start: string; period_end: string; condensed_on: string }>((from, to) =>
      db().from("condensed_values").select("metric_id, period_start, period_end, condensed_on").eq("workspace_id", ws).in("metric_id", ids).order("metric_id").order("period_start").range(from, to)));
  }
  return out;
}

/** The day the Metric's period was condensed, or null when it was not (a value for it is refused when not null). */
export async function condensedOn(ws: string, metricId: number, period: string): Promise<string | null> {
  const { data } = await db().from("condensed_values").select("condensed_on").eq("workspace_id", ws).eq("metric_id", metricId).lte("period_start", period).gte("period_end", period).limit(1).maybeSingle();
  return data ? String(data.condensed_on) : null;
}

/** The refusal for a period the database found condensed, with the day (today when the lookup finds none: it was
 * condensed a moment ago, or the span was removed since). */
export async function condensedWords(ws: string, metricId: number, period: string): Promise<string> {
  return condensedRefusal((await condensedOn(ws, metricId, period)) ?? format(new Date(), "yyyy-MM-dd"));
}

const DECIMAL = /^-?\d{1,60}(\.\d{1,30})?$/;
const SPANS: readonly CondensedSpan[] = ["week", "month", "quarter", "year"];
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 1 && (v as number) <= 100_000;

/** A target part read from what was stored, or null when it is not one: nothing stored is trusted as a shape. */
function targetFrom(v: unknown): TargetPart | null {
  const t = v as { held?: unknown; sum?: unknown; last?: { value?: unknown; day?: unknown } } | null;
  if (!t || !isCount(t.held) || typeof t.sum !== "string" || !DECIMAL.test(t.sum) || !t.last || typeof t.last.value !== "string" || !DECIMAL.test(t.last.value) || !isDay(t.last.day)) return null;
  return { held: t.held, sum: t.sum, last: { value: t.last.value, day: t.last.day } };
}

/** A Condensed Value read from a row, or null when its sealed numbers do not open or are not the shape stored: it
 * then reads as missing, never as a made-up number. */
function pointFrom(row: Record<string, unknown>): CondensedPoint | null {
  let payload: { sum?: unknown; last?: { value?: unknown; day?: unknown } | null; target?: unknown };
  try {
    // A payload that does not open reads as null (a destroyed or changed key): such a row reads as missing.
    payload = typeof row.payload === "string" ? JSON.parse(row.payload) : null;
  } catch {
    return null;
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const into = row.span as CondensedSpan;
  const sum = payload.sum ?? null;
  const last = payload.last ?? null;
  const sumOk = sum === null || (typeof sum === "string" && DECIMAL.test(sum));
  const lastOk = last === null || (typeof last.value === "string" && DECIMAL.test(last.value) && isDay(last.day));
  // Exactly one of them: the sum for Aggregation sum and average, the last value for last value.
  if (!SPANS.includes(into) || !sumOk || !lastOk || (sum === null) === (last === null) || !isCount(row.held) || !isCount(row.of)) return null;
  return {
    period: String(row.period_start), periodEnd: String(row.period_end), into, held: Number(row.held), of: Number(row.of),
    sum: sum as string | null, last: last === null ? null : { value: String(last.value), day: String(last.day) }, target: targetFrom(payload.target),
    locked: row.locked === true, condensedOn: String(row.condensed_on),
  };
}

/** The Condensed Values of some Metrics of a Workspace, per Metric id, oldest span first, with their numbers opened.
 * It answers for the Metrics named and does not check who may see them: the caller asks only about those the viewer
 * sees (access.ts), as it does for the series. */
export async function condensedFor(ws: string, metricIds: readonly number[]): Promise<Record<number, CondensedPoint[]>> {
  const out: Record<number, CondensedPoint[]> = {};
  for (let i = 0; i < metricIds.length; i += AT_A_TIME) {
    const ids = metricIds.slice(i, i + AT_A_TIME);
    const rows = await allRows<Record<string, unknown>>((from, to) =>
      db().from("condensed_values").select("id, metric_id, period_start, period_end, span, held, of, locked, payload, condensed_on").eq("workspace_id", ws).in("metric_id", ids).order("metric_id").order("period_start").range(from, to));
    for (const row of await openRows("condensed_values", ws, rows)) {
      const point = pointFrom(row);
      if (point) (out[Number(row.metric_id)] ??= []).push(point);
    }
  }
  return out;
}

/** What storing a Condensed Value needs: the Metric and the span. The values, Targets and Locks are read here, never
 * handed in, so a Condensed Value can only stand for what the Metric holds. */
export type CondensedInput = { metricId: number; into: CondenseInto; span: string };

/** Why a Condensed Value was not stored. */
export class NotCondensed extends Error {}

/** The Condensed Value of one span of a Metric of this Workspace (`metric` was read from it), the one the Retention job
 * makes before it deletes the originals: by the rule of retention-rules.ts from the values the Metric holds now, with the
 * span's Targets kept beside it and locked when every period in it was. Deliberately not Actor-first and used by the job
 * only (tests go through the `storeCondensed` fixture): the job holds a Metric to a Retention a person confirmed, and no
 * one may freeze a span without one. The span must be over for at least the shortest keep time (13 months), must not
 * overlap one condensed already (also refused by the database) and must start a span of its kind. A rate, a Derived
 * Metric and a span without values are refused. It writes the one row and never touches an original. Returns the id. */
export async function storeCondensedFor(ws: string, metric: Metric, input: CondensedInput): Promise<string> {
  const ys = await yearStartFor(ws, input.into);
  const problem = retentionProblem({ keep_months: MIN_KEEP_MONTHS, then: "condense", into: input.into }, metric);
  if (problem) throw new NotCondensed(problem);
  if (!isPeriodStart(input.span, input.into, ys)) throw new NotCondensed(`${String(input.span)} is not the first day of a ${input.into}.`);
  const end = periodEnd(input.span, input.into);
  // No Retention keeps less than 13 months: a span not over that long ago is never condensed, whatever is asked.
  if (end >= keptFrom(format(new Date(), "yyyy-MM-dd"), MIN_KEEP_MONTHS)) throw new NotCondensed("That span is too recent to condense: values are kept for at least 13 months.");
  const [{ data: overlap }, { data: values }, { data: targets }, { data: locks }] = await Promise.all([
    db().from("condensed_values").select("id").eq("workspace_id", ws).eq("metric_id", metric.id).lte("period_start", end).gte("period_end", input.span).limit(1),
    db().from("observations").select("id, period_start, value, value_sealed").eq("workspace_id", ws).eq("metric_id", metric.id).gte("period_start", input.span).lte("period_start", end).order("period_start").order("created_at").order("id"),
    db().from("series_values").select("metric_id, kind, period_start, value, value_sealed").eq("workspace_id", ws).eq("metric_id", metric.id).eq("kind", "target").gte("period_start", input.span).lte("period_start", end).order("period_start"),
    db().from("period_states").select("period_start").eq("workspace_id", ws).eq("metric_id", metric.id).eq("state", "locked").gte("period_start", input.span).lte("period_start", end),
  ]);
  if (overlap?.length) throw new NotCondensed("That span overlaps one condensed already.");
  // Values are sealed with the Workspace Key. Condensing keeps only sums, so a value or Target that does not open
  // refuses it: it must never be left out of a sum.
  const valueRows = await openRows("observations", ws, (values ?? []) as Record<string, unknown>[]);
  const targetRows = await openRows("series_values", ws, (targets ?? []) as Record<string, unknown>[]);
  if ([...valueRows, ...targetRows].some((r) => typeof r.value !== "number")) throw new NotCondensed("Some values in that span could not be read, so they cannot be condensed.");
  const held = valueRows.map((r) => ({ period: String(r.period_start), value: r.value as number }));
  const locked = new Set((locks ?? []).map((r) => String(r.period_start)));
  const made = condense(metric, input.into, input.span, held, ys, held.length > 0 && latestOfEach(held).every((p) => locked.has(p.period)));
  if (!made) throw new NotCondensed("There are no values in that span to condense.");
  const target = condensedTarget(metric, input.into, input.span, targetRows.map((r) => ({ period: String(r.period_start), value: r.value as number })), ys);
  const id = randomUUID();
  const payload = JSON.stringify({ sum: made.sum, last: made.last, target });
  const sealed = await sealRow("condensed_values", ws, { id, payload });
  const { error } = await db().from("condensed_values").insert({
    id, workspace_id: ws, metric_id: metric.id, period_start: input.span, period_end: end, span: input.into,
    held: made.held, of: made.of, locked: made.locked, payload: sealed.payload,
  });
  if (error) {
    // The database refuses an overlap that slipped past the check above (two at once); anything else stays in the log.
    if (error.code === "23505" || error.code === OVERLAP_CODE) throw new NotCondensed("That span overlaps one condensed already.");
    console.error("condensed_values insert failed:", error.message);
    throw new Error("The Condensed Value could not be saved. Try again in a moment.");
  }
  return id;
}

/** One stored Condensed Value of a Workspace by its id, with its numbers opened, or null when there is none (or it does not
 * open). For the job's check of what it just stored against the originals it still holds. */
export async function condensedPointById(ws: string, id: string): Promise<CondensedPoint | null> {
  const { data } = await db().from("condensed_values").select("id, metric_id, period_start, period_end, span, held, of, locked, payload, condensed_on").eq("workspace_id", ws).eq("id", id).maybeSingle();
  if (!data) return null;
  const [row] = await openRows("condensed_values", ws, [data as Record<string, unknown>]);
  return pointFrom(row);
}

/** Takes back a Condensed Value the job made but did not go on with (a check that did not match, open work, values that
 * arrived): the span goes back to being shown from its originals. The database removes it only while the span still holds
 * the originals it stands for; one that stands alone is never removed. Returns whether it was. */
export async function discardCondensed(ws: string, id: string): Promise<boolean> {
  const { data, error } = await db().rpc("retention_discard_condensed", { p_ws: ws, p_id: id });
  if (error) throw new Error("A Condensed Value could not be taken back.");
  return data === true;
}

/** The Condensed Values of one Metric that touch the days from `from` to `to`, with their numbers opened, oldest first.
 * For the job's check of a span against the ones already condensed beside it; the caller names the Metric. */
export async function condensedBetween(ws: string, metricId: number, from: string, to: string): Promise<CondensedPoint[]> {
  const rows = await allRows<Record<string, unknown>>((a, b) =>
    db().from("condensed_values").select("id, metric_id, period_start, period_end, span, held, of, locked, payload, condensed_on").eq("workspace_id", ws).eq("metric_id", metricId).lte("period_start", to).gte("period_end", from).order("period_start").range(a, b));
  return (await openRows("condensed_values", ws, rows)).flatMap((r) => pointFrom(r) ?? []);
}
