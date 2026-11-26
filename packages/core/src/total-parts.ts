// The parts of Totals as stored (GLOSSARY: Total; spec 0058), and what the Metric loader makes of them. Every loader
// takes the workspace and reads nothing outside it; who is shown a Total's numbers is decided where they are worked out
// (totals.ts), from what the reader sees.
import { deletedOpenTotals } from "./deleted-metrics";
import { allowedBy, restsFor, type Allowed, type KeptData, type Rests } from "./total-views";
import { Refused } from "./actor";
import { db } from "./db";
import { formulaInputs } from "./formula";
import { allRows, getMetrics, mustRead } from "./workspace-data";
import { restsOnTotal, totalNote, totalUnapproved, type TotalPart, type TotalsRead, type TotalsReader } from "./totals";
import { seenList, type SeenList } from "./total-lists";
import { NOT_FINAL_STATES } from "./value-state";
import type { Metric, Point } from "./types";

/** The parts of every Total of a Workspace, by the Total's id. The read must be whole: with a part missing, a Total
 * would show a smaller sum, and to people who do not see that part. */
export async function readParts(ws: string): Promise<Record<number, TotalPart[]>> {
  const rows = await allRows<{ total_id: number; part_id: number; first_period: string; last_period: string | null }>((from, to) =>
    mustRead(db().from("total_parts").select("total_id, part_id, first_period, last_period").eq("workspace_id", ws).order("total_id").order("part_id").range(from, to), "Totals could not be read. Try again in a moment."),
  );
  const out: Record<number, TotalPart[]> = {};
  for (const r of rows) (out[r.total_id] ??= []).push({ part: r.part_id, first: r.first_period, last: r.last_period });
  return out;
}

type Row = { id: number; slug: string; formula: string | null; inputs_checked?: boolean; total_targets?: "own" | "parts" | null; total_opened_at?: string | null };

/** Metric rows as the loader hands them on: a Total is given `total` and a formula that only names its parts, ended
 * ones too, so that what holds for a calculated Metric holds for it (who may see its inputs' names, what its owner must
 * be able to share, what keeps an input from being deleted or removed by a Retention). A formula that reads a Total is
 * marked `reads_total`. Nothing is read where there is no Total. */
export async function asTotals<R extends Row>(ws: string, rows: R[]): Promise<(R & Pick<Metric, "total" | "reads_total">)[]> {
  if (!rows.some((r) => r.total_targets)) return rows;
  const parts = await readParts(ws);
  const slugs = new Map(rows.map((r) => [r.id, r.slug]));
  const totals = new Set(rows.filter((r) => r.total_targets).map((r) => r.slug));
  return rows.map((r) => {
    if (!r.total_targets) return r.formula && formulaInputs(r.formula).some((s) => totals.has(s)) ? { ...r, reads_total: true } : r;
    // A Total with no part left names none, with the mark no Metric's slug can be.
    const formula = (parts[r.id] ?? []).map((p) => `{${slugs.get(p.part)}}`).join(" ") || "{-}";
    return { ...r, formula, inputs_checked: true, total: { targets: r.total_targets, open: Boolean(r.total_opened_at) } };
  });
}

/** What working out the Totals among `metrics` needs for one reader: the reader, and each Total's parts. */
export async function totalParts(ws: string, metrics: readonly Pick<Metric, "total">[], reader: TotalsReader): Promise<TotalsRead> {
  return { ...reader, parts: metrics.some((m) => m.total) ? await readParts(ws) : {} };
}

/** The list of each Total among `shown` as one reader gets it, by the Total's id: only the Metrics they see, held to
 * the periods of the series they were sent (`series`, by slug). The caller passes only Totals the reader sees. */
export async function seenLists(ws: string, metrics: readonly Pick<Metric, "id" | "slug" | "total">[], shown: readonly number[], sees: (metricId: number) => boolean, series: Record<string, readonly Point[]>): Promise<Record<number, SeenList>> {
  const totals = metrics.filter((m) => m.total && shown.includes(m.id));
  if (!totals.length) return {};
  const parts = await readParts(ws);
  const slugs = new Map(metrics.map((m) => [m.id, m.slug]));
  const periodsOf = (id: number) => (series[slugs.get(id) ?? ""] ?? []).map((p) => p.period);
  return Object.fromEntries(totals.map((t) => [t.id, seenList({ parts: parts[t.id] ?? [] }, sees, periodsOf)]));
}

/** The periods not approved yet of each Total among `shown`, by its id: those among the periods it is shown with in
 * which a counted part waits for Approval or was sent back. */
export async function unapprovedTotals(ws: string, shown: readonly { metric: Pick<Metric, "id" | "total">; points: readonly Point[] }[]): Promise<Record<number, string[]>> {
  const totals = shown.filter((s) => s.metric.total && s.points.length);
  if (!totals.length) return {};
  const parts = await readParts(ws);
  const ids = [...new Set(totals.flatMap((t) => (parts[t.metric.id] ?? []).map((p) => p.part)))];
  const rows = await allRows<{ metric_id: number; period_start: string }>((from, to) =>
    mustRead(db().from("period_states").select("metric_id, period_start").eq("workspace_id", ws).in("state", [...NOT_FINAL_STATES]).in("metric_id", ids).order("metric_id").order("period_start").range(from, to), "Approvals could not be read. Try again in a moment."),
  );
  const open: Record<number, string[]> = {};
  for (const r of rows) (open[r.metric_id] ??= []).push(r.period_start);
  return Object.fromEntries(totals.map((t) => [t.metric.id, totalUnapproved(parts[t.metric.id] ?? [], open, t.points)] as const).filter(([, periods]) => periods.length));
}

/** The Metrics as one reader is handed them: each Total says why it shows them no number, where it shows none. */
export async function withTotalNotes(ws: string, metrics: Metric[], sees: TotalsReader["sees"]): Promise<Metric[]> {
  if (!metrics.some((m) => m.total)) return metrics;
  const parts = await readParts(ws);
  return metrics.map((m) => (m.total ? { ...m, total: { ...m.total, note: totalNote(parts[m.id] ?? [], m.total, Boolean(m.inputs_withheld), sees) } } : m));
}

// What a Total shares with the Metrics it adds up, so neither side may change it alone.
const SHARED = ["period", "unit", "format", "aggregation"] as const;

/** Refuses a change of a Metric's description that would make a Total add up unlike numbers: its period, unit, number
 * format or Aggregation, on a Total or on a Metric one adds up, and a target of its own on a Total that takes its parts'.
 * The database holds the same. `now` is the stored row, `change` what would be written. */
export async function assertKeepsTotals(ws: string, now: Record<string, unknown>, change: Record<string, unknown>): Promise<void> {
  const changed = SHARED.some((k) => k in change && change[k] !== now[k]);
  if (now.total_targets) {
    if (changed) throw new Refused("A Total takes its period, unit, number format and Aggregation from the Metrics it adds up, so they stay.");
    if (now.total_targets === "parts" && (change.target_min ?? change.target_max) != null) throw new Refused("Its target is the targets of the Metrics it adds up. Choose its own target first.");
    return;
  }
  if (!changed) return;
  const { count, error } = await db().from("total_parts").select("total_id", { count: "exact", head: true }).eq("workspace_id", ws).eq("part_id", now.id as number);
  if (error) throw new Error("The change could not be saved.");
  if (count) throw new Refused("A Total adds this Metric up, so its period, unit, number format and Aggregation stay. Remove it from the Total first.");
}

/** What the numbers of some data rest on, as the Totals' lists stand now: what a copy of them keeps. Nothing is read
 * where no Metric of the data rests on a Total. */
export async function restsNow(ws: string, data: Omit<KeptData, "rests">): Promise<Rests | undefined> {
  if (!data.metrics.some(restsOnTotal)) return undefined;
  const all = await getMetrics(ws);
  return restsFor(data, all, await readParts(ws));
}

/** Who is given what of a copy that rests on `rests`, as the Totals stand now: a reader who sees the Metrics `sees`
 * says. Closing a Total takes effect on every copy. */
export async function allowedNow(ws: string, rests: Rests | undefined, sees: (metricId: number) => boolean): Promise<Allowed> {
  if (!rests) return () => false;
  const metrics = await getMetrics(ws);
  // A Total that was open when it was deleted stays so in the copies (spec 0065).
  const gone = await deletedOpenTotals(ws, new Set(metrics.map((m) => m.id)));
  const open = new Set([...metrics.filter((m) => m.total?.open).map((m) => m.id), ...gone]);
  return allowedBy(rests, open, sees);
}

/** What a message that quotes these periods of a Metric rests on, to be kept with it while it waits (mayReadMessage);
 * nothing for a Metric that rests on no Total. */
export async function restsOfMessage(ws: string, metrics: Metric[], metric: Metric, periods: readonly string[]): Promise<Rests | undefined> {
  if (!restsOnTotal(metric)) return undefined;
  const quoted = periods.map((period) => ({ period, value: 0 }));
  return restsFor({ metrics: [metric], series: { [metric.slug]: quoted }, targets: {}, pending: {} }, metrics, await readParts(ws));
}
