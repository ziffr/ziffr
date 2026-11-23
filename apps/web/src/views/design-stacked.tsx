"use client";
// The stacked mark of a View Design (GLOSSARY: View Design, Breakdown): one bar per period, each stacked from that
// period's Breakdown. What is drawn (which rows are segments, their order, the sums, every word and the text
// alternative) is worked out once by the core in stacked-marks.ts; this file only turns it into SVG from Theme tokens,
// so a widget, a Snapshot, a View Link and a deck's picture show the same stack. It reaches no Metric but the widget's own.
import type { ReactNode } from "react";
import { compactValue, formatValue } from "@ziffr/core/format";
import { periodLabel } from "@ziffr/core/periods";
import { stackedModel } from "@ziffr/core/stacked-marks";
import type { DesignValues } from "./design-view";
import { useBoxSize } from "./use-box-size";
import { useWidgetScale } from "./widget-scale";

// A colour per row, by its place in the stack, from Theme tokens: the same label has the same colour in every bar. Colour
// never carries a row alone: the legend names each one and the text alternative gives every value. Other is muted.
const FILLS = ["var(--color-data)", "var(--color-data-2)", "var(--color-data-4)", "var(--color-accent)", "color-mix(in oklab, var(--color-accent) 45%, var(--color-paper))"];
const OTHER_FILL = "color-mix(in oklab, var(--color-muted) 35%, var(--color-paper))";

/** Stacked bars of a Metric's Breakdowns over its last periods. */
export function StackedMark({ v }: { v: DesignValues }) {
  const { m, data } = v;
  const last = v.all[v.all.length - 1];
  const byPeriod = data.breakdowns[m.id] ?? {};
  // The window ends at the newest period the Metric has a value or a Breakdown in.
  const newest = [last?.period, ...Object.keys(byPeriod)].filter((p): p is string => !!p).sort().pop();
  if (!newest) return <Words>{m.name} has no breakdown to draw.</Words>;
  const model = stackedModel({
    name: m.name,
    by: v.by,
    to: newest,
    window: v.win,
    byPeriod,
    values: Object.fromEntries(v.all.map((p) => [p.period, p.value])),
    periods: v.all.map((p) => p.period),
    label: (p) => periodLabel(p, v.by, data.yearStart, true),
    write: (x) => formatValue(m, x, data.numberStyle),
  });
  if (!model.ok) return <Words>{model.reason}</Words>;
  return <StackedChart v={v} model={model} />;
}

/** The chart, the legend and the rule, drawn to the card's size: the bars fill the width, the type follows the widget scale, and a
 * short card keeps the chart and drops the legend and then the rule (the text alternative holds every value either way). */
function StackedChart({ v, model }: { v: DesignValues; model: Extract<ReturnType<typeof stackedModel>, { ok: true }> }) {
  const { m, data } = v;
  const { bars, segments, max } = model;
  const scale = useWidgetScale();
  const [whole, all] = useBoxSize<HTMLDivElement>();
  const [box, size] = useBoxSize<HTMLDivElement>();
  // Until the box is measured (the first render on the server, a drawing made without a screen) a nominal size is drawn.
  const measured = size.w > 0 && size.h > 0;
  const W = measured ? size.w : 260;
  const H = measured ? size.h : 150;
  const fs = 11 * scale;
  const top = fs + 6;
  const bottom = fs + 6;
  const n = bars.length;
  const slot = W / n;
  const bw = Math.min(slot * 0.7, 56 * scale);
  const plotH = Math.max(0, H - top - bottom);
  const k = plotH / max;
  const fill = (i: number) => (segments[i].other ? OTHER_FILL : FILLS[i % FILLS.length]);
  // Words are written on every bar that has the room, and on fewer when they would touch: the newest bar always has its own.
  const every = Math.max(1, Math.ceil((4 * fs) / Math.max(1, slot)));
  const shown = (i: number) => (n - 1 - i) % every === 0;
  // A word's centre, kept far enough from both edges that the first and last bars' words are not cut off by the drawing's edge.
  const inside = (cx: number, word: string) => { const half = (word.length * 0.62 * fs * 0.9) / 2; return Math.min(W - half, Math.max(half, cx)); };
  const height = all.h / scale;
  const showLegend = all.h === 0 || height >= 170;
  const showRule = all.h === 0 || height >= 215;
  return (
    <div ref={whole} className="flex min-h-0 w-full flex-1 flex-col">
      <div ref={box} className="relative min-h-[4.5rem] w-full flex-1">
        {(
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" role="img" aria-label={model.alt}>
            <line x1={0} x2={W} y1={H - bottom} y2={H - bottom} stroke="var(--color-rule)" strokeWidth={0.8} />
            {bars.map((b, i) => {
              const x = slot * i + (slot - bw) / 2;
              let y = H - bottom;
              return (
                <g key={b.period}>
                  {b.parts.map((part, j) => {
                    if (part <= 0) return null;
                    const h = part * k;
                    y -= h;
                    // A thin line of the card's colour between segments, so neighbours are told apart by more than their fill.
                    return (
                      <rect key={j} x={x} y={y} width={bw} height={h} fill={fill(j)} stroke="var(--color-paper)" strokeWidth={0.8}>
                        <title>{`${segments[j].label}, ${b.label}: ${formatValue(m, part, data.numberStyle)}`}</title>
                      </rect>
                    );
                  })}
                  {shown(i) && <text x={inside(x + bw / 2, compactValue(m, b.total, data.numberStyle))} y={y - 3} textAnchor="middle" fontSize={fs * 0.9} fill="var(--color-ink)" style={{ fontFamily: "var(--font-outlier)" }}>{compactValue(m, b.total, data.numberStyle)}</text>}
                  {shown(i) && <text x={inside(x + bw / 2, b.label)} y={H - 3} textAnchor="middle" fontSize={fs * 0.9} fill="var(--color-muted)">{b.label}</text>}
                </g>
              );
            })}
          </svg>
        )}
      </div>
      {/* The legend names every segment, top of the stack first, with its value in the newest bar. */}
      {showLegend && (
        <ul className="widget-text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {segments.map((s, i) => ({ s, i })).reverse().map(({ s, i }) => (
            <li key={s.label} className="flex items-center gap-1">
              <span aria-hidden className="inline-block size-2 shrink-0 border border-[var(--color-paper)]" style={{ background: fill(i) }} />
              <span>{s.label}</span>
              <span className="text-muted-foreground">{model.latest[i].value}</span>
            </li>
          ))}
        </ul>
      )}
      {showRule && <Words>{model.rule}</Words>}
    </div>
  );
}

function Words({ children }: { children: ReactNode }) {
  return <p className="widget-text-xs mt-0.5 text-muted-foreground">{children}</p>;
}
