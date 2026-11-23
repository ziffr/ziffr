"use client";
// The heatmap mark of a View Design (GLOSSARY: View Design, Period): one square per period of one Metric. Where each
// period sits, its step and every word (the legend, the caption, the text alternative) are worked out once by the core in
// heatmap-grid.ts; this file only turns them into SVG from Theme tokens, so a widget, a Snapshot, a View Link and a deck's
// picture show the same grid. Colour is the lightness of the data tone and means "a higher value", never on or off
// target: every square also has its period and value in its tooltip and in the text alternative of the whole grid. It
// reaches no Metric but the widget's own.
import { formatValue } from "@ziffr/core/format";
import { HEAT_STEPS, heatmapModel } from "@ziffr/core/heatmap-grid";
import type { DesignValues } from "./design-view";

// The lightest to the darkest step: the data tone mixed with the card's paper, so the scale follows the Theme.
const STEP_SHARE = [18, 38, 58, 78, 100];
const fill = (step: number) => `color-mix(in oklab, var(--color-data) ${STEP_SHARE[step]}%, var(--color-paper))`;

/** A Metric's periods as a grid of squares shaded by value. */
export function HeatmapMark({ v }: { v: DesignValues }) {
  const { m, data } = v;
  const model = heatmapModel({
    name: m.name,
    by: m.period,
    points: v.all.map((p) => ({ period: p.period, value: p.value })),
    yearStart: data.yearStart,
    window: v.win,
    lowerIsBetter: m.polarity === "lower",
    write: (x) => formatValue(m, x, data.numberStyle),
  });
  if (!model.ok) return <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.reason}</p>;
  const pitch = model.by === "month" ? 24 : 11;
  const size = pitch - (model.by === "month" ? 3 : 1.5);
  const left = model.by === "month" ? 46 : model.by === "week" ? 30 : 26;
  const top = 14;
  const W = left + model.columns.length * pitch;
  const H = top + model.rows.length * pitch;
  // A week's columns are numbers: one in four is written, so they do not touch.
  const heading = (c: string, i: number) => (model.by === "week" ? (i % 4 === 0 ? c : "") : c);
  // Weekdays: every other one is written, the rows being small.
  const rowName = (label: string, i: number) => (model.by === "day" && i % 2 === 1 ? "" : label);
  return (
    <>
      <div className="relative min-h-24 w-full flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" role="img" aria-label={model.alt} preserveAspectRatio="xMinYMid meet">
          <g fontSize={7} fill="var(--color-muted)">
            {model.columns.map((c, i) => (heading(c, i) ? <text key={i} x={left + i * pitch} y={top - 4}>{heading(c, i)}</text> : null))}
            {model.rows.map((r, i) => (rowName(r.label, i) ? <text key={i} x={left - 4} y={top + i * pitch + size * 0.75} textAnchor="end">{rowName(r.label, i)}</text> : null))}
          </g>
          {model.rows.map((r, i) =>
            r.cells.map((c, j) =>
              c ? (
                <rect key={`${i}-${j}`} x={left + j * pitch} y={top + i * pitch} width={size} height={size} rx={1.5}
                  // A period with no value is an empty outline: never the lightest step, never 0.
                  fill={c.step === null ? "none" : fill(c.step)} stroke={c.step === null ? "var(--color-rule)" : "none"} strokeWidth={0.8}>
                  <title>{`${c.label}: ${c.text ?? "no value"}`}</title>
                </rect>
              ) : null,
            ),
          )}
        </svg>
      </div>
      {model.legend && (
        <div className="widget-text-xs mt-1 flex items-center gap-1.5">
          <span aria-hidden className="flex gap-px">
            {Array.from({ length: HEAT_STEPS }, (_, s) => <span key={s} className="inline-block size-2.5 rounded-[2px]" style={{ background: fill(s) }} />)}
          </span>
          <span>{model.legend.text}</span>
        </div>
      )}
      <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.caption}</p>
    </>
  );
}
