// Heads-ups from the pair table (GLOSSARY: Heads-up, Takeaway; spec 0041, "Heads-ups"): two Metrics that have started moving
// together, and two that have stopped. Pure: it is given the rows of the pair table a person may see, the names of the Metrics
// they may see, and nothing else, so nothing in what it returns can depend on a Metric they may not see.
//
// The correction for the number of pairs looked at is worked out HERE, over the rows given: m is the number of those rows (the
// pairs of the person's own visible Metrics that could be compared), never the Workspace's, so the same Heads-up is reported or
// not whatever the person cannot see (Benjamini-Hochberg at 10 %, false-discovery.ts). A pair is reported as
//  - moving together when it meets the conditions of the pair scan (pair-scan.ts: 12 pairs, |r| at least 0.7 over all of them and in
//    each half, every suitability check passed cleanly), its chance after the delays is reported by the correction, and the
//    chance rule of the strength words does not call it "can't tell from chance";
//  - stopped moving together when its history before the last 6 periods would have been reported as moving together (the same
//    conditions and correction, over the history before), its last 6 periods have |r| under 0.3, and the chance that the link
//    dropped is reported by the same correction over the pairs that had been moving together. A pair that has stopped is not
//    also reported as moving together.
import { formatNumber } from "../format";
import type { Span } from "../periods";
import { strengthOf } from "../takeaways/strength";
import { answerTakeaway, footerText, sayIn, strengthWordIn, type Takeaway, type TakeawayContext } from "../takeaways/takeaway";
import { adjustedChances, benjaminiHochberg } from "./false-discovery";
import { HEADS_UP, type PairRow, type Window } from "./pair-scan";

/** The kinds of Heads-up about two Metrics. */
export type PairKind = "moving-together" | "stopped-moving-together";

/** The kinds of Heads-up about one Metric (heads-up-single.ts): its trend turned, its Target is out of reach, a value is unusual for its season. */
export type MetricKind = "direction-change" | "target-out-of-reach" | "unusual-for-season";

/** Every kind of Heads-up. */
export type HeadsUpKind = PairKind | MetricKind;

type Common = { key: string; span: Span; through: string; rank: number; takeaway: Takeaway };

/** A Heads-up about two Metrics: its stable key (kind and the two Metrics, the lower id first), the Metrics, the period the pair was compared on
 * and the data runs to, the order it ranks in (stronger first) and its Takeaway: sentence, strength, basis, footer and the
 * numbers under Show the numbers. */
export type PairHeadsUp = Common & { kind: PairKind; metrics: [number, number] };

/** A Heads-up about one Metric: the same, with the one Metric, and the period its latest value is for (`through`). */
export type MetricHeadsUp = Common & { kind: MetricKind; metrics: [number] };

/** A Heads-up of any kind. */
export type HeadsUp = PairHeadsUp | MetricHeadsUp;

// (Number.isFinite is false for null, undefined and anything that is not a number, with no conversion.)
const finite = (...xs: (number | null)[]) => xs.every((x) => Number.isFinite(x));
const unit = (x: number) => Number.isFinite(x) && x >= 0 && x <= 1;
const validWindow = (w: Window) =>
  finite(w.lag, w.r, w.n, w.nEff, w.pDelays, w.p, w.tries) && Math.abs(w.r) <= 1 && unit(w.pDelays) && unit(w.p) && w.p >= w.pDelays && Number.isInteger(w.lag) && Math.abs(w.lag) <= HEADS_UP.maxLag &&
  Number.isInteger(w.n) && w.n >= HEADS_UP.minPairs && w.nEff > 0 && Number.isInteger(w.tries) && w.tries >= 1 && typeof w.meets === "boolean";
const validHalf = (r: number | null) => r === null || (Number.isFinite(r) && Math.abs(r) <= 1);

// A row as stored is untrusted (a database row is, whoever wrote it): only a row whose every number is what the scan can write
// is used; the rest is left out, as if it were not in the table.
function valid(row: PairRow): boolean {
  const { full, before } = row;
  if (!Number.isInteger(row.a) || !Number.isInteger(row.b) || row.a >= row.b || typeof row.through !== "string") return false;
  if (!validWindow(full) || !validHalf(full.rFirst) || !validHalf(full.rSecond)) return false;
  // (A whole first half and a whole total make the second half whole too.)
  if (!Number.isInteger(full.nFirst) || full.nFirst + full.nSecond !== full.n) return false;
  if (before === null) return true;
  const { recent } = before;
  return validWindow(before) && (recent === null || (finite(recent.r, recent.n, recent.dropP) && Math.abs(recent.r) <= 1 && recent.n === HEADS_UP.recent && unit(recent.dropP) && typeof recent.low === "boolean"));
}

// Whether the chance rule of the strength words leaves a window with some strength to say: not "can't tell from chance".
const clearOfChance = (w: Window) => strengthOf(w.r, w.nEff, undefined, w.tries) !== "cant-tell";

// The order is by a number kept to 12 digits: a row read back from the database may differ from the scan's in the last digit.
const roundedRank = (x: number) => Number(x.toPrecision(12));

/** The chance as a person-sized text (exported for the Heads-ups about one Metric): four decimals, or "under 0.0001". */
export function chanceText(p: number, ctx: TakeawayContext): string {
  return p < 0.0001 ? sayIn("hu-chance-under", {}, ctx) : formatNumber(p, 4, ctx.style);
}

// The Takeaway of a pair moving together: the sentence in the leader's order, the strength, the basis, the footer, and the numbers.
function movingTakeaway(row: PairRow, names: ReadonlyMap<number, string>, looked: number, adjusted: number, ctx: TakeawayContext): Takeaway {
  const { full, span } = row;
  const [leader, follower] = full.lag >= 0 ? [row.a, row.b] : [row.b, row.a];
  const lag = Math.abs(full.lag);
  // Stryker disable next-line EqualityOperator: a link that met the conditions has |r| of at least 0.7, so r is never 0 here and `<` and `<=` never differ.
  const opposite = full.r < 0;
  const strength = strengthOf(full.r, full.nEff, false, full.tries);
  const strengthText = strengthWordIn(strength, ctx);
  const key = lag === 0 ? (opposite ? "hu-together-same-opposite" : "hu-together-same") : opposite ? "hu-together-leads-opposite" : "hu-together-leads";
  const method = sayIn("numbers-method-hu-together", {}, ctx);
  const text = (n: number, d = 0) => formatNumber(n, d, ctx.style);
  const half = (r: number | null, n: number) => (r === null ? "–" : sayIn("numbers-hu-half", { r, n, span }, ctx));
  const basis = sayIn("basis-changes", {}, ctx);
  return {
    ...answerTakeaway(method),
    sentence: sayIn(key, { a: names.get(leader)!, b: names.get(follower)!, lag, n: full.n, span, strength: strengthText }, ctx),
    strength,
    strengthText,
    basis: sayIn("basis-over", { basis, n: full.n, span }, ctx),
    footer: footerText(ctx),
    figures: [{ label: sayIn("numbers-pairs", {}, ctx), value: full.n, text: text(full.n) }, ...(lag === 0 ? [] : [{ label: sayIn("numbers-lag", {}, ctx), value: lag, text: text(lag) }])],
    numbers: [
      { label: sayIn("numbers-method", {}, ctx), text: method },
      { label: sayIn("numbers-lag", {}, ctx), text: text(lag) },
      { label: sayIn("numbers-r", {}, ctx), text: text(full.r, 2) },
      { label: sayIn("numbers-pairs", {}, ctx), text: text(full.n) },
      { label: sayIn("numbers-hu-effective", {}, ctx), text: text(full.nEff, 1) },
      { label: sayIn("numbers-hu-first-half", {}, ctx), text: half(full.rFirst, full.nFirst) },
      { label: sayIn("numbers-hu-second-half", {}, ctx), text: half(full.rSecond, full.nSecond) },
      { label: sayIn("numbers-tries", {}, ctx), text: text(full.tries) },
      { label: sayIn("numbers-hu-looked-at", {}, ctx), text: text(looked) },
      { label: sayIn("numbers-hu-luck", {}, ctx), text: chanceText(adjusted, ctx) },
      { label: sayIn("numbers-basis", {}, ctx), text: basis },
      { label: sayIn("numbers-strength", {}, ctx), text: strengthText },
    ],
  };
}

// The Takeaway of a pair that has stopped.
function stoppedTakeaway(row: PairRow, names: ReadonlyMap<number, string>, looked: number, adjusted: number, ctx: TakeawayContext): Takeaway {
  const before = row.before!;
  const recent = before.recent!;
  // The Metric that moved first comes first, as in a Heads-up of moving together; with no delay the lower id comes first.
  const [leader, follower] = before.lag >= 0 ? [row.a, row.b] : [row.b, row.a];
  const [first, second] = [names.get(leader)!, names.get(follower)!];
  const lag = Math.abs(before.lag);
  // Stryker disable next-line EqualityOperator: a link that met the conditions has |r| of at least 0.7, so r is never 0 here and `<` and `<=` never differ.
  const opposite = before.r < 0;
  const key = lag === 0 ? (opposite ? "hu-stopped-opposite" : "hu-stopped") : opposite ? "hu-stopped-leads-opposite" : "hu-stopped-leads";
  const method = sayIn("numbers-method-hu-stopped", {}, ctx);
  const text = (n: number, d = 0) => formatNumber(n, d, ctx.style);
  return {
    ...answerTakeaway(method),
    sentence: sayIn(key, { a: first, b: second, lag, recent: recent.n, span: row.span }, ctx),
    basis: sayIn("basis-over", { basis: sayIn("basis-changes", {}, ctx), n: before.n, span: row.span }, ctx),
    footer: footerText(ctx),
    figures: [{ label: sayIn("numbers-hu-recent", {}, ctx), value: recent.n, text: text(recent.n) }],
    numbers: [
      { label: sayIn("numbers-method", {}, ctx), text: method },
      { label: sayIn("numbers-lag", {}, ctx), text: text(lag) },
      { label: sayIn("numbers-hu-before", {}, ctx), text: sayIn("numbers-hu-half", { r: before.r, n: before.n, span: row.span }, ctx) },
      { label: sayIn("numbers-hu-recent", {}, ctx), text: sayIn("numbers-hu-half", { r: recent.r, n: recent.n, span: row.span }, ctx) },
      { label: sayIn("numbers-hu-looked-at-stopped", {}, ctx), text: text(looked) },
      { label: sayIn("numbers-hu-drop", {}, ctx), text: chanceText(adjusted, ctx) },
      { label: sayIn("numbers-basis", {}, ctx), text: sayIn("basis-changes", {}, ctx) },
    ],
  };
}

/** The Heads-ups among the pair table's rows that a person may see: `rows` are those rows only (both Metrics of each visible to
 * them, not archived), and `names` holds the name of each Metric they may see; a row naming any other Metric is left out, as is
 * a row whose numbers are not what the scan writes. The correction counts only these rows. Moving together first, the stronger
 * first (larger |r|), then stopped, the larger drop first; ties by the Metrics' ids. The same rows give the same Heads-ups in the
 * same order and words, whatever order they come in. */
export function headsUpsFrom(rows: readonly PairRow[], names: ReadonlyMap<number, string>, ctx: TakeawayContext, notScanned = 0): PairHeadsUp[] {
  const mine = rows.filter((row) => names.has(row.a) && names.has(row.b) && valid(row));
  const rate = HEADS_UP.rate;
  // Pairs a scan did not get to (its work allowance was spent) count among the pairs looked at, each as a pair of chance 1: never a Heads-up from them, and the bar for the others is the one a full scan sets.
  const chances = [...mine.map((r) => r.full.p), ...Array.from({ length: notScanned }, () => 1)];
  const reported = benjaminiHochberg(chances, rate).slice(0, mine.length);
  const adjusted = adjustedChances(chances).slice(0, mine.length);
  // The history before the last 6 periods, judged as the whole history was, among the pairs that have one.
  const earlier = mine.map((row, i) => ({ row, i })).filter((x) => x.row.before !== null);
  const earlierReported = benjaminiHochberg(earlier.map((x) => x.row.before!.p), rate);
  // The pairs that were moving together then and have the last 6 periods to judge: the drop is tried for each of them.
  const had = earlier.filter((x, k) => earlierReported[k] && x.row.before!.meets && clearOfChance(x.row.before!) && x.row.before!.recent !== null);
  const dropChances = had.map((x) => x.row.before!.recent!.dropP);
  const dropReported = benjaminiHochberg(dropChances, rate);
  const dropAdjusted = adjustedChances(dropChances);
  const stopped = new Map<number, number>();
  had.forEach((x, k) => { if (x.row.before!.recent!.low && dropReported[k]) stopped.set(x.i, dropAdjusted[k]); });
  const out: PairHeadsUp[] = [];
  mine.forEach((row, i) => {
    const base = { metrics: [row.a, row.b] as [number, number], span: row.span, through: row.through };
    if (stopped.has(i)) {
      const before = row.before!;
      out.push({ ...base, key: `stopped-moving-together:${row.a}:${row.b}`, kind: "stopped-moving-together", rank: roundedRank(Math.abs(before.r) - Math.sign(before.r) * before.recent!.r), takeaway: stoppedTakeaway(row, names, had.length, stopped.get(i)!, ctx) });
    } else if (reported[i] && row.full.meets && clearOfChance(row.full)) {
      out.push({ ...base, key: `moving-together:${row.a}:${row.b}`, kind: "moving-together", rank: roundedRank(Math.abs(row.full.r)), takeaway: movingTakeaway(row, names, mine.length + notScanned, adjusted[i], ctx) });
    }
  });
  const order: Record<PairKind, number> = { "moving-together": 0, "stopped-moving-together": 1 };
  return out.sort((x, y) => order[x.kind] - order[y.kind] || y.rank - x.rank || x.metrics[0] - y.metrics[0] || x.metrics[1] - y.metrics[1]);
}
