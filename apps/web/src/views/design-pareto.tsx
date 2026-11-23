"use client";
// The pareto mark of a View Design (GLOSSARY: Breakdown, View Design): a Breakdown's rows as bars from largest to
// smallest with the running share as a line and a reference at 80 %. Which rows, in which order, the share at each bar
// and the words are worked out by the core in pareto.ts; this file only turns them into SVG, from Theme tokens, so a
// widget, a Snapshot, a View Link and a deck's picture show the same numbers. It reads only the Breakdown of the
// widget's own Metric.
import { compactValue } from "@ziffr/core/format";
import { PARETO_REFERENCE, paretoModel } from "@ziffr/core/pareto";
import type { DesignValues } from "./design-view";
import { useBoxSize } from "./use-box-size";
import { useWidgetScale } from "./widget-scale";

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
  return <ParetoChart model={model} />;
}

/** The chart, drawn to the pixels of its box: the bars fill the width, the type follows the widget scale, the slanted names give way
 * to the room they need, and a short card keeps the bars and the line and drops the words around them, then the caption. */
function ParetoChart({ model }: { model: Extract<ReturnType<typeof paretoModel>, { ok: true }> }) {
  const { bars, reaches } = model;
  const scale = useWidgetScale();
  const [whole, all] = useBoxSize<HTMLDivElement>();
  const [box, size] = useBoxSize<HTMLDivElement>();
  // Until the box is measured (the first render on the server, a drawing made without a screen) a nominal size is drawn.
  const measured = size.w > 0 && size.h > 0;
  const W = measured ? size.w : 360;
  const H = measured ? size.h : 210;
  const fs = 10 * scale;
  const n = bars.length;
  const left = 8;
  const right = 4.4 * fs;
  const top = fs + 6;
  const slot = (W - left - right) / n;
  const slanted = slot < 4.4 * fs;
  const words = H >= 110 * scale;
  const labelH = !words ? 4 : slanted ? Math.min(H * 0.38, 14 * 0.55 * fs * 0.6 + fs + 4) : fs + 6;
  const base = Math.max(top + 20, H - labelH);
  const plotH = base - top;
  const bw = Math.min(slot * 0.7, 44 * scale);
  const x = (i: number) => left + slot * (i + 0.5);
  const yShare = (sh: number) => base - sh * plotH;
  const max = Math.max(...bars.map((b) => b.value));
  // The bars take at most 80 % of the height, so their value labels stay clear of the line's top at 100 %.
  const yBar = (val: number) => base - (val / max) * plotH * 0.8;
  const line = bars.map((b, i) => `${i ? "L" : "M"}${x(i)},${yShare(b.cumulative)}`).join(" ");
  const ref = yShare(PARETO_REFERENCE);
  const valueWords = words && slot >= 3 * fs;
  const showCaption = all.h === 0 || all.h / scale >= 150;
  return (
    <div ref={whole} className="flex min-h-0 w-full flex-1 flex-col">
      <div ref={box} className="relative min-h-[4.5rem] w-full flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={model.alt} className="absolute inset-0 size-full">
          <line x1={left} x2={W - right} y1={base} y2={base} stroke="var(--color-rule-2)" />
          <line x1={left} x2={W - right} y1={ref} y2={ref} stroke="var(--color-ink)" strokeDasharray="4 3" strokeOpacity={0.55} />
          {words && <text x={W - right + 4} y={ref + 3} fontSize={fs * 0.9} fill="var(--color-ink)">{pctText(PARETO_REFERENCE)}</text>}
          {bars.map((b, i) => (
            <g key={`${b.label}-${i}`}>
              <title>{`${b.label}: ${b.text}, ${pctText(b.share)} of the total, ${pctText(b.cumulative)} so far`}</title>
              {/* Other is muted, so it never reads as one more cause; the colour carries no other meaning. */}
              <rect x={x(i) - bw / 2} y={yBar(b.value)} width={bw} height={base - yBar(b.value)} fill={b.other ? "var(--color-rule-2)" : "var(--color-data)"} rx={1.5} />
              {valueWords && <text x={x(i)} y={yBar(b.value) - 3} fontSize={fs * 0.9} textAnchor="middle" fill="var(--color-ink)" className="fig">{b.text}</text>}
              {words && (
                <text
                  x={slanted ? x(i) + 3 : x(i)}
                  y={base + fs + 1}
                  fontSize={fs * 0.9}
                  fill="var(--color-ink)"
                  textAnchor={slanted ? "end" : "middle"}
                  transform={slanted ? `rotate(-35 ${x(i) + 3} ${base + fs + 1})` : undefined}
                >
                  {short(b.label, slanted ? 14 : Math.max(5, Math.floor(slot / (0.6 * fs * 0.9))))}
                </text>
              )}
            </g>
          ))}
          <path d={line} fill="none" stroke="var(--color-ink)" strokeWidth={1.6} strokeLinejoin="round" />
          {bars.map((b, i) => (
            <circle key={`dot-${i}`} cx={x(i)} cy={yShare(b.cumulative)} r={i === reaches ? 3.5 : 2} fill={i === reaches ? "var(--color-ink)" : "var(--color-paper)"} stroke="var(--color-ink)" strokeWidth={1.4} />
          ))}
          {/* Direct labels on the line: where it reaches 80 %, and its end at 100 %. */}
          {words && <text x={Math.min(x(reaches) + 6, W - right - 24)} y={Math.min(yShare(bars[reaches].cumulative) + fs + 4, base - 4)} fontSize={fs * 0.9} fontWeight={600} fill="var(--color-ink)">{pctText(bars[reaches].cumulative)}</text>}
          {words && <text x={W - right + 4} y={yShare(1) + 3} fontSize={fs * 0.9} fill="var(--color-ink)">100 %</text>}
        </svg>
      </div>
      {showCaption && <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.caption}</p>}
    </div>
  );
}
