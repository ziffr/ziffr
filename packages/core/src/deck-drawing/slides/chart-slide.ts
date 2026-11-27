// The chart slide (spec 0069; GLOSSARY: Slide Type, Metric, Target, Period): one chart or two side by side, as columns
// or a line, with a target where asked; or one chart whose columns another Metric fills in part, or that a further
// Metric's line is read against. Visibility: only the slide's listed Metrics are read. Pure.
import type { Metric } from "../../types";
import type { SlideSource, SlideType } from "../slide-type";
import { drawTrend, periodCount, trendOf, type Trend } from "./figures";
import { cannotHeadline, headlineOf, subjectOf } from "./headlines";
import { listedData, nameOf, NOT_THERE, sourceOf } from "./listed";

/** What a chart slide shows: one chart or two. */
export type ChartContent = { charts: Trend[] };

const GAP = 40;

/** The listed Metrics by what the options say each is: the charted ones, the one filling part, the reference. */
function rolesOf(slide: SlideSource, metrics: Metric[]) {
  const withPart = slide.options.part === true;
  const withReference = slide.options.reference === true;
  if (!withPart && !withReference) return { charted: metrics, part: undefined, reference: undefined, expected: Math.min(2, metrics.length) };
  return {
    charted: metrics.slice(0, 1),
    part: withPart ? metrics[1] : undefined,
    reference: withReference ? metrics[withPart ? 2 : 1] : undefined,
    expected: 1 + Number(withPart) + Number(withReference),
  };
}

/** Why the slide's Metrics cannot make the chart it asks for; null where they can. */
function refusal(slide: SlideSource, metrics: Metric[]): string | null {
  const { part, reference, expected } = rolesOf(slide, metrics);
  if (metrics.length !== expected) return "A chart slide shows one or two Metrics, or one with a part, a reference or both.";
  if (slide.options.part === true && slide.options.form === "line") return "A line has no part to fill: this chart needs columns.";
  const main = metrics[0]!;
  for (const other of [part, reference]) {
    if (!other) continue;
    if (other.unit !== main.unit) return `${nameOf(other)} has another unit than ${nameOf(main)}, so one chart cannot hold both.`;
    if (other.period !== main.period) return `${nameOf(other)} has another period than ${nameOf(main)}, so one chart cannot hold both.`;
  }
  return null;
}

/** The chart slide. */
export const chartSlide: SlideType<ChartContent> = {
  id: "chart",
  section: "Performance",
  wide: true,
  /** The charts of the listed Metrics over their last periods. */
  fill(slide, data, deck) {
    const listed = listedData(slide, data);
    if (!listed) return NOT_THERE;
    const { metrics } = listed;
    const source = sourceOf(metrics);
    const why = refusal(slide, metrics);
    if (why) return { headline: cannotHeadline("chart", nameOf(metrics[0]!)), source, cannot: why };
    const { charted, part, reference } = rolesOf(slide, metrics);
    const headline = headlineOf(subjectOf(charted), listed.data, deck.today);
    const options = { count: periodCount(slide), line: slide.options.form === "line", target: slide.options.target === true, part, reference };
    const charts = charted.map((m) => trendOf(m, listed.data, options));
    if (charts.every((c) => !c.spec)) return { headline, source, cannot: charts.map((c) => c.empty).join(" ") };
    return { headline, source, content: { charts } };
  },
  /** The charts side by side. */
  draw({ charts }, region) {
    const { x, y, w, h } = region;
    const each = (w - GAP * (charts.length - 1)) / charts.length;
    return charts.flatMap((chart, i) => drawTrend(chart, { x: x + i * (each + GAP), y, w: each, h }, region));
  },
};
