// Condensed Values (GLOSSARY: Condensed Value, Retention; spec 0033, ticket #380): the storage of the one value that
// stands for a longer period, the loader that gives it to the charts, and the refusal of a value for a period it
// stands for. A Condensed Value is made at a moment and never edited; what makes one (the setting, the job that
// deletes the originals after checking the numbers) comes in later tickets. Security: its numbers are sealed with the
// Workspace Key (spec 0028); the loader answers only the Metrics it is asked about, so the caller (access.ts) asks for
// the ones the viewer sees; writing is for the Metric's owner and Owners and Admins, never a key, never the demo.
import { randomUUID } from "node:crypto";
import { format } from "date-fns";
import { Forbidden, type Actor } from "./actor";
import { type CondensedPoint, type CondensedSpan, type TargetPart } from "./condensed-parts";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { yearStartFor } from "./fiscal-year";
import { condense, condensedTarget, retentionProblem, type CondenseInto } from "./retention-rules";
import { isPeriodStart, periodEnd } from "./periods";
import { openRows, sealRow } from "./sealed-columns";
import { allRows, getMetrics } from "./workspace-data";
import type { Point } from "./types";

/** The database's code for a value refused because its period was condensed (trigger observations_not_condensed). */
export const CONDENSED_CODE = "ZF441";

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
    payload = JSON.parse(String(row.payload));
  } catch {
    return null;
  }
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

/** What storing a Condensed Value needs: the Metric, the span, the values (and Targets) of its periods as they stand. */
export type CondensedInput = { metricId: number; into: CondenseInto; span: string; values: readonly Point[]; targets?: readonly Point[]; locked?: boolean };

/** Why a Condensed Value was not stored. */
export class NotCondensed extends Error {}

/** Stores the Condensed Value of one span of a Metric (the Metric's owner, Owners and Admins): made by the rule of
 * retention-rules.ts from the values given, with the Target of the span kept beside it. It writes the one row and
 * nothing else: the originals are deleted by the job after it has checked that the numbers come out the same. A span
 * that overlaps one already condensed, a period that is not a span of its kind, or a Metric that cannot be condensed
 * is refused. Returns the id. */
export async function storeCondensed(actor: Actor, input: CondensedInput): Promise<string> {
  if (actor.key) throw new Forbidden("A key cannot condense values.");
  refuseInDemo(actor);
  if (!Number.isInteger(input.metricId)) throw new Forbidden("That Metric was not found.");
  const metrics = await getMetrics(actor.workspaceId);
  const metric = metrics.find((m) => m.id === input.metricId);
  const may = actor.role === "owner" || actor.role === "admin" || (actor.role !== "guest" && metric?.owner_id === actor.personId);
  // A Metric of another Workspace and a missing one are refused alike.
  if (!metric || !may) throw new Forbidden("That Metric was not found, or its values are not yours to condense.");
  const ys = await yearStartFor(actor.workspaceId, input.into);
  const problem = retentionProblem({ keep_months: 13, then: "condense", into: input.into }, metric);
  if (problem) throw new NotCondensed(problem);
  if (!isPeriodStart(input.span, input.into, ys)) throw new NotCondensed(`${String(input.span)} is not the first day of a ${input.into}.`);
  const made = condense(metric, input.into, input.span, input.values, ys, input.locked === true);
  if (!made) throw new NotCondensed("There are no values in that span to condense.");
  const end = periodEnd(input.span, input.into);
  const target = condensedTarget(metric, input.into, input.span, input.targets ?? [], ys);
  const id = randomUUID();
  const payload = JSON.stringify({ sum: made.sum, last: made.last, target });
  const sealed = await sealRow("condensed_values", actor.workspaceId, { id, payload });
  const { error } = await db().from("condensed_values").insert({
    id, workspace_id: actor.workspaceId, metric_id: metric.id, period_start: input.span, period_end: end, span: input.into,
    held: made.held, of: made.of, locked: made.locked, payload: sealed.payload,
  });
  if (error) {
    // The unique key on (metric, span): that span is condensed already. Anything else stays in the server log.
    if (error.code === "23505") throw new NotCondensed("That span is condensed already.");
    console.error("condensed_values insert failed:", error.message);
    throw new Error("The Condensed Value could not be saved. Try again in a moment.");
  }
  return id;
}
