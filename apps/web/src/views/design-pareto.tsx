"use client";
// The pareto mark of a View Design (GLOSSARY: Breakdown, View Design): a Breakdown's rows as bars from largest to
// smallest with the running share as a line and a reference at 80 %. Which rows, in which order, the share at each bar
// and the words are worked out by the core in pareto.ts; this file only turns them into SVG, from Theme tokens, so a
// widget, a Snapshot, a View Link and a deck's picture show the same numbers. It reads only the Breakdown of the
// widget's own Metric.
import { compactValue } from "@ziffr/core/format";
import { PARETO_REFERENCE, paretoModel } from "@ziffr/core/pareto";
import type { DesignValues } from "./design-view";

const W = 360;
const H = 210;
const LEFT = 8;
const RIGHT = 34;
const TOP = 16;
const BASE = 150;
const pctText = (x: number) => `${Math.round(x * 100)} %`;
const short = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** The rows of the Metric's latest Breakdown as sorted bars and a cumulative line, or the reason there is nothing to draw. */
export function ParetoMark({ v }: { v: DesignValues }) {
  const m = v.metrics[0];
  const byPeriod = (m && v.data.breakdowns[m.id]) || {};
  const period = Object.keys(byPeriod).sort().at(-1);
  if (!m || !period) return <p className="widget-text-xs mt-0.5 text-muted-foreground">{m ? `${m.name} has no breakdown yet.` : "Drop a metric with a breakdown."}</p>;
  const model = paretoModel({ name: m.name, rows: byPeriod[period], write: (x) => compactValue(m, x, v.data.numberStyle) });
  if (!model.ok) return <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.reason}</p>;
  const { bars, reaches } = model;
  const n = bars.length;
  const slot = (W - LEFT - RIGHT) / n;
  const bw = Math.min(slot * 0.7, 40);
  const x = (i: number) => LEFT + slot * (i + 0.5);
  const plotH = BASE - TOP;
  const yShare = (s: number) => BASE - s * plotH;
  const max = Math.max(...bars.map((b) => b.value));
  // The bars take at most 80 % of the height, so their value labels stay clear of the line's top at 100 %.
  const yBar = (val: number) => BASE - (val / max) * plotH * 0.8;
  const slanted = n > 5;
  const line = bars.map((b, i) => `${i ? "L" : "M"}${x(i)},${yShare(b.cumulative)}`).join(" ");
  const ref = yShare(PARETO_REFERENCE);
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={model.alt} className="min-h-0 w-full flex-1" preserveAspectRatio="xMidYMid meet">
        <line x1={LEFT} x2={W - RIGHT} y1={BASE} y2={BASE} stroke="var(--color-rule-2)" />
        <line x1={LEFT} x2={W - RIGHT} y1={ref} y2={ref} stroke="var(--color-ink)" strokeDasharray="4 3" strokeOpacity={0.55} />
        <text x={W - RIGHT + 4} y={ref + 3} fontSize={9} fill="var(--color-ink)">{pctText(PARETO_REFERENCE)}</text>
        {bars.map((b, i) => (
          <g key={`${b.label}-${i}`}>
            <title>{`${b.label}: ${b.text}, ${pctText(b.share)} of the total, ${pctText(b.cumulative)} so far`}</title>
            {/* Other is muted, so it never reads as one more cause; the colour carries no other meaning. */}
            <rect x={x(i) - bw / 2} y={yBar(b.value)} width={bw} height={BASE - yBar(b.value)} fill={b.other ? "var(--color-rule-2)" : "var(--color-data)"} rx={1.5} />
            <text x={x(i)} y={yBar(b.value) - 3} fontSize={9} textAnchor="middle" fill="var(--color-ink)" className="fig">{b.text}</text>
            <text
              x={slanted ? x(i) + 3 : x(i)}
              y={BASE + 11}
              fontSize={9}
              fill="var(--color-ink)"
              textAnchor={slanted ? "end" : "middle"}
              transform={slanted ? `rotate(-35 ${x(i) + 3} ${BASE + 11})` : undefined}
            >
              {short(b.label, slanted ? 14 : Math.max(5, Math.floor(slot / 5)))}
            </text>
          </g>
        ))}
        <path d={line} fill="none" stroke="var(--color-ink)" strokeWidth={1.6} strokeLinejoin="round" />
        {bars.map((b, i) => (
          <circle key={`dot-${i}`} cx={x(i)} cy={yShare(b.cumulative)} r={i === reaches ? 3.5 : 2} fill={i === reaches ? "var(--color-ink)" : "var(--color-paper)"} stroke="var(--color-ink)" strokeWidth={1.4} />
        ))}
        {/* Direct labels on the line: where it reaches 80 %, and its end at 100 %. */}
        <text x={Math.min(x(reaches) + 6, W - RIGHT - 24)} y={Math.min(yShare(bars[reaches].cumulative) + 14, BASE - 4)} fontSize={9} fontWeight={600} fill="var(--color-ink)">{pctText(bars[reaches].cumulative)}</text>
        <text x={W - RIGHT + 4} y={yShare(1) + 3} fontSize={9} fill="var(--color-ink)">100 %</text>
      </svg>
      <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.caption}</p>
    </div>
  );
}
