// The summary slide (spec 0069; GLOSSARY: Slide Type, Metric, Target): the newest figure of up to four Metrics side by
// side, each with its change and whether it is on target, over a chart of the first. Visibility: only the slide's
// listed Metrics are read. Pure.
import { targetText } from "../../format";
import type { Obj } from "../objects";
import type { Region, SlideType } from "../slide-type";
import { drawTrend, figureOf, onTargetWords, periodCount, trendOf, type Figure, type Trend } from "./figures";
import { headlineOf, subjectOf } from "./headlines";
import { listedData, NOT_THERE, sourceOf } from "./listed";

/** How many figures a summary holds. */
const FIGURES = 4;

/** One Metric's block: its figures and what its target is. */
export type SummaryFigure = Figure & { target: string };

/** What a summary slide shows. */
export type SummaryContent = { figures: SummaryFigure[]; chart: Trend };

const GAP = 32;
/** The height of the figures, the chart standing under them. */
const BLOCK = 160;
/** The sizes a figure may be written in, the largest that fits first. */
const SIZES = [40, 26, 22, 18];

/** One figure under its rule: the Metric, the value, the change and the target. */
function block({ pen, measure }: Region, figure: SummaryFigure, x: number, y: number, w: number): Obj[] {
  const name = measure.fit(figure.name, w, { size: 14, bold: true }, 2);
  const size = SIZES.find((s) => measure.width(figure.latest, { size: s, face: "head", bold: true }) <= w * 0.9) ?? 16;
  const when = measure.fit(figure.period ? figure.since : "No value yet", w, { size: 12 }, 2);
  const status = figure.onTarget === null ? onTargetWords(null) : `${onTargetWords(figure.onTarget)}, target ${figure.target}`;
  return [
    pen.rect({ x, y, w, h: 2 }, "ink"),
    pen.text({ x, y: y + 8, w, h: 36 }, [name], { size: 14, bold: true, line: 1.25 }),
    pen.text({ x, y: y + 46, w, h: 52 }, [measure.fit(figure.latest, w, { size, face: "head", bold: true }, 1)], { size, face: "head", bold: true, line: 1.2, valign: "bottom" }),
    pen.text({ x, y: y + 102, w, h: 32 }, [when], { size: 12, color: "muted", line: 1.25 }),
    pen.text({ x, y: y + 136, w, h: 18 }, [measure.fit(status, w, { size: 12 }, 1)], { size: 12, bold: figure.onTarget === false, color: figure.onTarget === false ? "bad" : "muted" }),
  ];
}

/** The summary. */
export const summary: SlideType<SummaryContent> = {
  id: "summary",
  section: "Summary",
  wide: true,
  /** The figures of the listed Metrics and the chart of the first. */
  fill(slide, data, deck) {
    const listed = listedData(slide, data);
    if (!listed) return NOT_THERE;
    const metrics = listed.metrics.slice(0, FIGURES);
    const first = metrics[0]!;
    const headline = headlineOf(subjectOf(metrics), listed.data, deck.today);
    const source = sourceOf(metrics);
    const figures = metrics.map((m) => ({ ...figureOf(m, listed.data), target: targetText(m, data.numberStyle) }));
    if (figures.every((f) => !f.period)) return { headline, source, cannot: "No value to show yet." };
    // A target that comes from a Target Series is not the Metric's range, so the range's words would not say it.
    for (const [i, m] of metrics.entries()) if (listed.data.targets[m.id]?.length) figures[i]!.target = "as set for the period";
    const chart = trendOf(first, listed.data, { count: periodCount(slide), line: slide.options.form === "line", target: slide.options.target === true });
    const note = listed.metrics.length > FIGURES ? `A summary shows ${FIGURES} figures; the other Metrics listed are not shown.` : undefined;
    return { headline, source, note, content: { figures, chart } };
  },
  /** The figures in a row and the chart under them. */
  draw(content, region) {
    const { x, y, w, h } = region;
    const each = (w - GAP * (FIGURES - 1)) / FIGURES;
    const figures = content.figures.flatMap((f, i) => block(region, f, x + i * (each + GAP), y, each));
    return [...figures, ...drawTrend(content.chart, { x, y: y + BLOCK + 16, w, h: h - BLOCK - 16 }, region)];
  },
};
