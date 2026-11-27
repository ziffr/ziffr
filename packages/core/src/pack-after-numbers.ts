// After a Pack's set-up: "Set quotas for a new quarter" (spec 0068, #1345; GLOSSARY: Pack, Target Series, Total). The
// numbers a Pack asks at set-up are asked again, for the running span or the next one, and written unchanged as the
// target of each period of that span. A target of an earlier span is never written over.
// Security: only Owners and Admins, only Metrics the set-up made whose targets this person may change (their own, or as
// Editor), written through saveSeriesRows with its checks. A browser names ids, numbers and "this" or "next", all
// checked here.
import { Forbidden, Refused, type Actor } from "./actor";
import { db } from "./db";
import { yearStartFor } from "./fiscal-year";
import { saveSeriesRows } from "./metrics";
import { assertStillOpen, packAfter, type AfterMetric, type PackAfter } from "./pack-after";
import { targetPeriods } from "./pack-start-plan";
import { askFits } from "./pack-start-steps";
import { periodEnd, periodLabel, periodStart, shiftPeriod, type YearStart } from "./periods";
import type { Metric, Period } from "./types";
import { localTime, workspaceClock } from "./workspace-clock";

/** The running span of a number asked, or the one after it. */
export type PackSpan = "this" | "next";
const NUMBER_MAX = 1e15;

type Asked = AfterMetric & { entry: NonNullable<AfterMetric["entry"]> & { ask: NonNullable<NonNullable<AfterMetric["entry"]>["ask"]> } };

/** The Metrics made whose asked number this person may set. */
export const askedMetrics = (a: PackAfter): Asked[] =>
  a.metrics.filter((m): m is Asked => Boolean(m.entry?.ask && m.entry.takesValues && m.edits && !m.metric.formula && askFits(m.metric.period, m.entry.ask.every)));

/** The words of the way to set them again, such as "Set quotas for a new quarter"; null where nothing is asked. */
export function numbersLabel(rows: ReturnType<typeof askedMetrics>): string | null {
  if (!rows.length) return null;
  const kinds = new Set(rows.map((m) => `${m.entry.ask.name} ${m.entry.ask.every}`));
  if (kinds.size > 1) return "Set targets for a new period";
  const { name, every } = rows[0].entry.ask;
  const word = name.toLowerCase();
  return `Set ${word.endsWith("s") ? word : `${word}s`} for a new ${every}`;
}

/** What setting the asked numbers again shows. */
export type PackNumbers = {
  pack: string;
  label: string | null;
  /** One for each number the Pack asks; a row for each Metric, named by its line where it has one. */
  asks: { metric: string; question: string; field: string; total: string | null; rows: { id: number; label: string; unit: Pick<Metric, "unit" | "unit_position"> }[] }[];
  spans: { span: PackSpan; label: string }[];
  /** "next" once every number of the running span is set to its end. */
  preselected: PackSpan;
};

const today = async (actor: Actor) => localTime(new Date(), (await workspaceClock(actor)).timeZone).day;

/** The first day of the span asked, and the first period of the Metric that has a day in it. */
async function spanOf(actor: Actor, day: string, period: Period, every: "month" | "quarter" | "year", span: PackSpan) {
  const [own, year]: YearStart[] = await Promise.all([yearStartFor(actor.workspaceId, period), yearStartFor(actor.workspaceId, every)]);
  const running = periodStart(day, every, year);
  const from = span === "next" ? shiftPeriod(running, every, 1) : running;
  return { own, year, from, first: periodStart(from, period, own) };
}

/** Which of these periods have a target already. */
async function targeted(metricId: number, periods: string[]): Promise<Set<string>> {
  const { data, error } = await db().from("series_values").select("period_start").eq("metric_id", metricId).eq("kind", "target").in("period_start", periods);
  if (error) throw new Error("The targets could not be read.");
  return new Set((data ?? []).map((r) => String(r.period_start)));
}

/** What "Set quotas for a new quarter" shows (Owners and Admins). Writes nothing. */
export async function packNumbers(actor: Actor, installId: number): Promise<PackNumbers> {
  const a = await packAfter(actor, installId);
  const rows = askedMetrics(a);
  const day = await today(actor);
  const full = await Promise.all(rows.map(async (m) => {
    const s = await spanOf(actor, day, m.metric.period, m.entry.ask.every, "this");
    const last = periodStart(periodEnd(s.from, m.entry.ask.every), m.metric.period, s.own);
    return (await targeted(m.id, [last])).size > 0;
  }));
  const everies = new Set(rows.map((m) => m.entry.ask.every));
  const spans: PackNumbers["spans"] = await Promise.all((["this", "next"] as const).map(async (span) => {
    if (everies.size !== 1) return { span, label: span === "this" ? "The running period" : "The next period" };
    const [every] = everies;
    const s = await spanOf(actor, day, rows[0].metric.period, every, span);
    return { span, label: `${span === "this" ? "This" : "Next"} ${every}: ${periodLabel(s.from, every, s.year)}` };
  }));
  const asks = new Map<string, PackNumbers["asks"][number]>();
  for (const m of rows) {
    const { ask } = m.entry;
    const total = a.declarations.metrics.find((x) => x.total?.of === m.key && x.total.targets === "parts");
    const one = asks.get(m.key) ?? { metric: m.key, question: ask.question, field: ask.name, total: total?.name ?? null, rows: [] };
    one.rows.push({ id: m.id, label: m.line?.name ?? m.name, unit: { unit: m.metric.unit, unit_position: m.metric.unit_position } });
    asks.set(m.key, one);
  }
  return { pack: a.name, label: numbersLabel(rows), asks: [...asks.values()], spans, preselected: rows.length > 0 && full.every(Boolean) ? "next" : "this" };
}

/** The answers as a browser sends them: the span, and a number for each Metric named, once. */
function cleanNumbers(input: unknown, offered: ReturnType<typeof askedMetrics>) {
  const raw = (input && typeof input === "object" ? input : {}) as { span?: unknown; numbers?: unknown };
  if (raw.span !== "this" && raw.span !== "next") throw new Refused("Choose which period the numbers are for.");
  if (!Array.isArray(raw.numbers) || !raw.numbers.length || raw.numbers.length > 200) throw new Refused("Enter at least one number.");
  const seen = new Set<number>();
  const numbers = raw.numbers.map((v) => {
    const n = (v && typeof v === "object" ? v : {}) as { id?: unknown; value?: unknown };
    const metric = offered.find((m) => m.id === n.id);
    if (!metric || seen.has(metric.id)) throw new Forbidden("Set only the numbers this set-up asks. Reload this page.");
    seen.add(metric.id);
    if (typeof n.value !== "number" || !Number.isFinite(n.value) || Math.abs(n.value) > NUMBER_MAX) throw new Refused(`Enter a number for ${metric.name}.`);
    return { metric, value: n.value };
  });
  return { span: raw.span as PackSpan, numbers };
}

/** Writes each number as the target of every period of the span chosen: from the running span's last ended period, or
 * from the next span's start. A period that began before the span keeps a target it has. */
export async function setPackNumbers(actor: Actor, installId: number, input: unknown): Promise<{ set: number }> {
  const a = await packAfter(actor, installId);
  await assertStillOpen(actor);
  const { span, numbers } = cleanNumbers(input, askedMetrics(a));
  const day = await today(actor);
  for (const { metric, value } of numbers) {
    const period = metric.metric.period;
    const every = metric.entry.ask.every;
    const s = await spanOf(actor, day, period, every, span);
    const periods = targetPeriods(span === "next" ? s.from : day, period, every, s.own, s.year);
    const has = await targeted(metric.id, periods);
    const write = periods.filter((p) => p >= s.from || ((span === "this" || p >= s.first) && !has.has(p)));
    await saveSeriesRows(actor, metric.id, "target", write.map((p) => ({ period: p, value })), `From the set-up of ${a.name}`);
  }
  return { set: numbers.length };
}
