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
import { ChartFrame, useChartSize } from "./chart-frame";

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
  return <HeatmapGrid model={model} />;
}

/** The grid, drawn to the pixels of its box: the squares are as large as the box allows (never bigger than the type they carry), the
 * headings thin out to the room, and a short card keeps the grid and drops the legend, then the caption. */
function HeatmapGrid({ model }: { model: Extract<ReturnType<typeof heatmapModel>, { ok: true }> }) {
  const labelChars = Math.max(...model.rows.map((r) => r.label.length), 3);
  const nominalPitch = model.by === "month" ? 24 : 11;
  const { scale, whole, all, box, W, H } = useChartSize({ w: labelChars * 0.62 * 9 + 6 + model.columns.length * nominalPitch, h: 9 + 6 + model.rows.length * nominalPitch });
  const fs = 9 * scale;
  const left = labelChars * 0.62 * fs + 6;
  const top = fs + 6;
  const cols = model.columns.length;
  const rowsN = model.rows.length;
  const pitch = Math.max(4, Math.min((W - left) / cols, (H - top) / rowsN, 44 * scale));
  const gap = Math.max(1, pitch * 0.12);
  const cell = pitch - gap;
  // Headings are written on as many columns as have the room (a month's name is about four letters wide, a week's number two).
  const wide = (model.by === "week" ? 2.4 : 3.6) * fs;
  const every = Math.max(1, Math.ceil(wide / pitch));
  const heading = (c: string, i: number) => (i % every === 0 ? c : "");
  // Weekdays: every other one is written when the rows are small.
  const rowName = (label: string, i: number) => (pitch < fs * 1.2 || (model.by === "day" && pitch < fs * 2 && i % 2 === 1) ? "" : label);
  const showLegend = !!model.legend && (all.h === 0 || all.h / scale >= 120);
  const showCaption = all.h === 0 || all.h / scale >= 175;
  return (
    <ChartFrame
      whole={whole}
      box={box}
      below={
        <>
      {showLegend && model.legend && (
        <div className="widget-text-xs mt-1 flex flex-wrap items-center gap-x-1.5">
          <span aria-hidden className="flex gap-px">
            {Array.from({ length: HEAT_STEPS }, (_, st) => <span key={st} className="inline-block size-2.5 rounded-[2px]" style={{ background: fill(st) }} />)}
          </span>
          <span>{model.legend.text}</span>
        </div>
      )}
      {showCaption && <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.caption}</p>}
        </>
      }
    >
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" role="img" aria-label={model.alt}>
          <g fontSize={fs * 0.9} fill="var(--color-muted)">
            {model.columns.map((c, i) => (heading(c, i) ? <text key={i} x={left + i * pitch} y={top - 4}>{heading(c, i)}</text> : null))}
            {model.rows.map((r, i) => (rowName(r.label, i) ? <text key={i} x={left - 4} y={top + i * pitch + cell * 0.5 + fs * 0.3} textAnchor="end">{rowName(r.label, i)}</text> : null))}
          </g>
          {model.rows.map((r, i) =>
            r.cells.map((c, j) =>
              c ? (
                <rect key={`${i}-${j}`} x={left + j * pitch} y={top + i * pitch} width={cell} height={cell} rx={Math.min(1.5, cell / 5)}
                  // A period with no value is an empty outline: never the lightest step, never 0.
                  fill={c.step === null ? "none" : fill(c.step)} stroke={c.step === null ? "var(--color-rule)" : "none"} strokeWidth={0.8}>
                  <title>{`${c.label}: ${c.text ?? "no value"}`}</title>
                </rect>
              ) : null,
            ),
          )}
        </svg>
    </ChartFrame>
  );
}
