// The Takeaway of the correlation matrix (GLOSSARY: Takeaway, Correlation; ticket #988): every pair of the Metrics given, each worked out and
// worded by the very functions of the Correlation entry (`correlate`, `correlationTakeaway`), so each pair says what it says there. The
// sentence is the one of the pair that moved together most closely; every pair, with its strength word and what it was compared on, is
// under Show the numbers, and the cautions of any pair are given, each naming its Metrics. A pair that cannot be compared is listed with its
// reason. It adds no calculation of its own and has no grid: that is what it lacks against the widget. Pure.
import { correlate, type Correlation } from "../correlation";
import type { Resolver } from "../display-periods";
import { formatNumber } from "../format";
import type { YearStart } from "../periods";
import type { Metric } from "../types";
import { correlationTakeaway, footerText, listOf, refusalTakeaway, sayIn, withinBudget, type Takeaway, type TakeawayContext } from "./takeaway";

/** The most Metrics a matrix takes (66 pairs). */
export const MOST_IN_MATRIX = 12;

type Pair = { a: Metric; b: Metric; c: Correlation; t: Takeaway };

/** The Takeaway of how the Metrics move together, pair by pair, under the work budget of work-bound.ts. */
export function matrixTakeaway(metrics: Metric[], resolve: Resolver, opts: { yearStart: YearStart; today?: string }, ctx: TakeawayContext): Takeaway {
  return withinBudget("numbers-method-pearson", ctx, () => {
    const method = sayIn("numbers-method-pearson", {}, ctx);
    const pairs: Pair[] = metrics.flatMap((a, i) => metrics.slice(i + 1).map((b) => {
      const c = correlate(a, b, resolve, opts);
      return { a, b, c, t: correlationTakeaway(a, b, c, ctx, { footer: false, chart: false }) };
    }));
    const answered = pairs.filter((p): p is Pair & { c: Extract<Correlation, { ok: true }> } => p.t.kind === "answer" && p.c.ok);
    if (answered.length === 0) return refusalTakeaway(method, [...new Set(pairs.map((p) => p.t.refusal!))].slice(0, 3));
    const top = answered.reduce((best, p) => (Math.abs(p.c.r) > Math.abs(best.c.r) ? p : best));
    return {
      ...top.t,
      // The sentence, strength, basis, assumptions and notes are the strongest pair's; the cautions are those of every pair, each naming its Metrics.
      cautions: [...new Set(answered.flatMap((p) => p.t.cautions))],
      footer: footerText(ctx),
      numbers: pairs.map((p) => ({
        label: listOf([p.a.name, p.b.name], ctx),
        text: p.c.ok && p.t.kind === "answer" ? `${sayIn("numbers-r", {}, ctx)} ${formatNumber(p.c.r, 2, ctx.style)}, ${p.t.strengthText}, ${p.t.basis}` : p.t.refusal!,
      })),
      // Every pair with its r and its word, as Show the numbers lists them; a pair that cannot be compared is an empty cell.
      ...(ctx.charts ? { chart: [{ kind: "grid" as const, labels: metrics.map((m) => m.name), cells: pairs.map((p) => ({ row: metrics.indexOf(p.a), col: metrics.indexOf(p.b), r: p.c.ok && p.t.kind === "answer" ? p.c.r : null, word: p.t.kind === "answer" ? p.t.strengthText : null })) }] } : {}),
    };
  });
}
