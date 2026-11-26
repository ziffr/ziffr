// What a Metric's page says differently for a Total, and for a formula that reads one (GLOSSARY: Total, Derived
// Metric; spec 0058, "Team totals"): what stands where there is no value, and the target a Total takes from the Metrics
// it adds up. Server only: it is handed only what the page already gives this person.
import Link from "next/link";
import { formulaInWords } from "@ziffr/core/calculation-note";
import { targetProblem } from "@ziffr/core/formula";
import { POLARITY_LABEL, SOURCE_LABEL, targetText } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import { periodLabel, type YearStart } from "@ziffr/core/periods";
import { noValuesWords } from "@ziffr/core/total-rules";
import { totalPage, totalsCounting } from "@ziffr/core/total-page";
import type { Actor } from "@ziffr/core/actor";
import type { Metric, Point } from "@ziffr/core/types";
import { periodChoices } from "../period-choices";
import type { CountingTotal } from "./archive-metric";

/** What the page needs to know of a Metric's kind: the Total (null for any other Metric) and the Totals archiving it
 * would ask about, whether it is worked out by a formula someone wrote (then written with the names of the Metrics in
 * `seen`), the periods not approved yet, and its targets: its own, or for a Total that takes them its Metrics' added up
 * for this person, never a series stored under its own name. */
export async function aboutKind(actor: Actor, metric: Metric, page: { archivable: boolean; yearStart: YearStart; seen: Metric[]; pending: string[]; own: Record<number, Point[]>; aimed: Record<number, Point[]> }) {
  const [total, counting] = await Promise.all([metric.total ? totalPage(actor, metric.id) : null, page.archivable ? totalsCounting(actor, metric.id) : []]);
  const asked: CountingTotal[] = counting.map((t) => ({ id: t.id, name: t.name, open: t.open, last: t.last, periods: periodChoices(metric.period, page.yearStart, t.last) }));
  const derived = Boolean(metric.formula) && !metric.total;
  const addedUp = metric.total?.targets === "parts";
  return {
    total,
    asked,
    derived,
    // A Total has no formula anyone wrote: what it adds up is listed on its own (TotalPanel).
    formula: derived ? formulaInWords(metric.formula!, page.seen) : null,
    badge: metric.total ? "Total" : "Derived",
    /** A Total adds up whole values only: it has no Breakdown. */
    breakdown: !metric.total,
    unapproved: total?.unapproved ?? page.pending,
    addedUp,
    targets: (addedUp ? page.aimed : page.own)[metric.id] ?? [],
    /** Whether targets of its own are set for it. */
    ownTargets: !derived && !addedUp,
    /** Said before it is shared. */
    shareWarning: metric.total?.open ? "This Total is open: whoever you share it with learns its sums, also without seeing the Metrics it adds up." : undefined,
  };
}

/** How the targets of a Metric work, above their editor. Nothing for a Total that takes its Metrics' targets, which has
 * no range of its own. */
export function TargetsExplained({ metric, style }: { metric: Metric; style: NumberStyle }) {
  if (metric.total?.targets === "parts") return null;
  return (
    <p className="mt-1 mb-4 text-sm text-muted-foreground">
      The target range ({targetText(metric, style).toLowerCase()}, {POLARITY_LABEL[metric.polarity].toLowerCase()}) applies to every period. A period with its own target here, such as a monthly budget, uses that one instead. Projections are values expected for future periods; they never count as real values.
    </p>
  );
}

/** What stands in place of the target editor where a Metric takes no target of its own. */
export function NoOwnTargets({ addedUp }: { addedUp: boolean }) {
  return <p className="mt-2 text-sm text-muted-foreground">{addedUp ? "A Total with its Metrics’ targets added up takes no target of its own. Choose its own target under Overview first." : "A derived metric takes its targets from its formula’s metrics."}</p>;
}

/** The line under the Target figure: where this period's target comes from. */
export function targetNote(metric: Metric, period: string | undefined, series: boolean, yearStart: YearStart, style: NumberStyle): string | undefined {
  const label = period ? periodLabel(period, metric.period, yearStart) : null;
  if (metric.total?.targets === "parts") return label ? `Its Metrics’ targets for ${label}, added up.` : "Added up where each of its Metrics has one.";
  if (label) return `From the target series for ${label}. Other periods without one use ${targetText(metric, style).toLowerCase()}.`;
  return series ? "The target range; periods in the target series use their own target." : undefined;
}

/** What stands in place of the chart while there is no value to draw. `problem` is why a formula's inputs cannot be
 * combined; `seen` the Metrics this person sees. */
export function NoValues({ metric, problem, seen, aimed }: { metric: Metric; problem: string | null; seen: Metric[]; aimed: Record<number, Point[]> }) {
  const box = "rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center text-sm text-muted-foreground";
  // A Derived Metric whose inputs cannot be combined says why, instead of an empty chart (spec 0022).
  if (problem) return <div role="status" className={box}>{problem}</div>;
  if (metric.total || metric.reads_total) return <div role="status" className={box}>{noValuesWords(metric)}</div>;
  if (metric.formula) return <div role="status" className={box}>No values yet. {targetProblem(metric, seen, aimed) ?? "It has one for each period in which every Metric it is calculated from has a value."}</div>;
  return <div className={box}>No values yet. They arrive by {metric.sources.map((s) => SOURCE_LABEL[s]).join(" or ")}. <Link href="?tab=settings" className="underline">See who submits</Link>.</div>;
}
