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

// A colour per row, by its place in the stack, from Theme tokens: the same label has the same colour in every bar. Colour
// never carries a row alone: the legend names each one and the text alternative gives every value. Other is muted.
const FILLS = ["var(--color-data)", "var(--color-data-2)", "var(--color-data-4)", "var(--color-accent)", "color-mix(in oklab, var(--color-accent) 45%, var(--color-paper))"];
const OTHER_FILL = "color-mix(in oklab, var(--color-muted) 35%, var(--color-paper))";

const W = 260;
const H = 150;
const TOP = 12;
const BOTTOM = 14;

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
  const { bars, segments, max } = model;
  const n = bars.length;
  const slot = W / n;
  const bw = Math.min(slot * 0.7, 40);
  const scale = (H - TOP - BOTTOM) / max;
  const fill = (i: number) => (segments[i].other ? OTHER_FILL : FILLS[i % FILLS.length]);
  // With many bars the words would touch: totals and period names are written on every other one, and the newest always.
  const every = n > 8 ? 2 : 1;
  const shown = (i: number) => (n - 1 - i) % every === 0;
  const font = n > 8 ? 6 : 7;
  return (
    <>
      <div className="relative min-h-32 w-full flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" role="img" aria-label={model.alt} preserveAspectRatio="xMidYMid meet">
          <line x1={0} x2={W} y1={H - BOTTOM} y2={H - BOTTOM} stroke="var(--color-rule)" strokeWidth={0.8} />
          {bars.map((b, i) => {
            const x = slot * i + (slot - bw) / 2;
            let y = H - BOTTOM;
            return (
              <g key={b.period}>
                {b.parts.map((part, k) => {
                  if (part <= 0) return null;
                  const h = part * scale;
                  y -= h;
                  // A thin line of the card's colour between segments, so neighbours are told apart by more than their fill.
                  return (
                    <rect key={k} x={x} y={y} width={bw} height={h} fill={fill(k)} stroke="var(--color-paper)" strokeWidth={0.8}>
                      <title>{`${segments[k].label}, ${b.label}: ${formatValue(m, part, data.numberStyle)}`}</title>
                    </rect>
                  );
                })}
                {shown(i) && <text x={x + bw / 2} y={y - 2.5} textAnchor="middle" fontSize={font} fill="var(--color-ink)" style={{ fontFamily: "var(--font-outlier)" }}>{compactValue(m, b.total, data.numberStyle)}</text>}
                {shown(i) && <text x={x + bw / 2} y={H - 3} textAnchor="middle" fontSize={font} fill="var(--color-muted)">{b.label}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      {/* The legend names every segment, top of the stack first, with its value in the newest bar. */}
      <ul className="widget-text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {segments.map((s, i) => ({ s, i })).reverse().map(({ s, i }) => (
          <li key={s.label} className="flex items-center gap-1">
            <span aria-hidden className="inline-block size-2 shrink-0 border border-[var(--color-paper)]" style={{ background: fill(i) }} />
            <span>{s.label}</span>
            <span className="text-muted-foreground">{model.latest[i].value}</span>
          </li>
        ))}
      </ul>
      <Words>{model.rule}</Words>
    </>
  );
}

function Words({ children }: { children: ReactNode }) {
  return <p className="widget-text-xs mt-0.5 text-muted-foreground">{children}</p>;
}
