// A template file for Paste values (spec 0026; GLOSSARY: Observation, Metric, Number Style): a CSV the person opens in
// their spreadsheet, fills in and pastes or drops back on the Paste values page, already naming the Metrics they may paste
// for and the periods those Metrics are waiting for. Read only: it records nothing. Only the Metrics the page itself
// offers (pasteMetrics: seen, submitted for, taking the web form), by slug, never a name, so two Metrics of one name cannot
// be confused and no name from the Workspace can start a spreadsheet formula. Periods are written as days (2026-10-01), so
// a spreadsheet does not turn them into numbers.
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { yearStartOf } from "./fiscal-year";
import { NUMBER_STYLE_MARKS } from "./number-style";
import { pasteMetrics } from "./paste-values";
import { periodStart, shiftPeriod, type Span } from "./periods";
import { getMetrics } from "./workspace-data";
import { numberStyleOf } from "./workspace-settings";

/** Which layout the file has: one value per row for each Metric's current period, Metrics down and periods across, or one
 * Metric's periods that still have no value. */
export type PasteTemplateKind = "rows" | "matrix" | "history";

/** What a person asks for. `metricId` is for "history"; `period` and `periods` are for "matrix" (the Metrics of one period
 * length, and how many periods across) and "history" (how far back to look). */
export type PasteTemplateInput = { kind: PasteTemplateKind; metricId?: number | null; period?: string | null; periods?: number | null };

/** The file: a name, the text, and how many Metrics and periods it names. */
export type PasteTemplate = { fileName: string; text: string; metrics: number; periods: number };

/** Most periods across a matrix, or back in a history. */
const MAX_PERIODS = 60;
/** Most Metrics in a file: what one paste may hold (spec 0026). */
const MAX_METRICS = 500;
const SPANS: readonly string[] = ["day", "week", "month", "quarter", "half", "year"];

const BOM = String.fromCharCode(0xfeff);
const cell = (text: string, sep: string) => (/["\r\n]/.test(text) || text.includes(sep) ? `"${text.replace(/"/g, '""')}"` : text);

/** The template for a person's Metrics, in the Workspace's Number Style's list separator (a semicolon where numbers are
 * written with a decimal comma, as a spreadsheet there expects). */
export async function pasteTemplate(actor: Actor, input: PasteTemplateInput): Promise<PasteTemplate> {
  if (actor.key || !actor.personId) throw new Forbidden();
  const kind = input?.kind;
  if (kind !== "rows" && kind !== "matrix" && kind !== "history") throw new Error("Pick one of the templates offered.");
  const ws = actor.workspaceId;
  const [offered, all, style, yearStart] = await Promise.all([pasteMetrics(actor), getMetrics(ws), numberStyleOf(ws), yearStartOf(ws)]);
  const periodOf = new Map(all.map((m) => [m.id, m.period as Span]));
  const metrics = offered.slice(0, MAX_METRICS).map((m) => ({ ...m, span: periodOf.get(m.id)! }));
  if (!metrics.length) throw new Error("There is no Metric you can paste values for.");
  const sep = NUMBER_STYLE_MARKS[style].decimal === "," ? ";" : ",";
  const line = (cells: string[]) => cells.map((c) => cell(c, sep)).join(sep);
  const today = new Date();
  const currentOf = (span: Span) => periodStart(today, span, yearStart);
  const wanted = (n: unknown, fallback: number) => (Number.isSafeInteger(n) && (n as number) >= 1 ? Math.min(MAX_PERIODS, n as number) : fallback);
  const file = (name: string, rows: string[][], metricCount: number, periodCount: number): PasteTemplate => ({ fileName: name, text: BOM + rows.map(line).join("\r\n") + "\r\n", metrics: metricCount, periods: periodCount });

  if (kind === "rows") {
    return file("ziffr-paste-values.csv", [["metric", "period", "value"], ...metrics.map((m) => [m.slug, currentOf(m.span), ""])], metrics.length, 1);
  }

  if (kind === "matrix") {
    // One period length for the whole file: the one asked for, else the one most of the Metrics have.
    const counts = new Map<Span, number>();
    for (const m of metrics) counts.set(m.span, (counts.get(m.span) ?? 0) + 1);
    const asked = typeof input.period === "string" && SPANS.includes(input.period) ? (input.period as Span) : null;
    const span = asked ?? [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] === "month" ? -1 : 1))[0][0];
    const rows = metrics.filter((m) => m.span === span);
    if (!rows.length) throw new Error("No Metric you can paste values for has that period.");
    const n = wanted(input.periods, 12);
    const columns = Array.from({ length: n }, (_, i) => shiftPeriod(currentOf(span), span, i - (n - 1)));
    return file("ziffr-paste-matrix.csv", [["", ...columns], ...rows.map((m) => [m.slug, ...columns.map(() => "")])], rows.length, n);
  }

  const m = metrics.find((x) => x.id === Number(input.metricId));
  if (!m) throw new Error("Pick one of the Metrics you can paste values for.");
  const n = wanted(input.periods, 24);
  const from = shiftPeriod(currentOf(m.span), m.span, -(n - 1));
  const { data, error } = await db().from("observations").select("period_start").eq("workspace_id", ws).eq("metric_id", m.id).gte("period_start", from);
  if (error) throw new Error("The values could not be read. Try again in a moment.");
  const have = new Set((data ?? []).map((r) => String(r.period_start)));
  const missing = Array.from({ length: n }, (_, i) => shiftPeriod(currentOf(m.span), m.span, i - (n - 1))).filter((p) => !have.has(p));
  return file(`ziffr-paste-history-${m.slug}.csv`, [["period", "value"], ...missing.map((p) => [p, ""])], 1, missing.length);
}
