"use client";
// The cumulative mark of a View Design (GLOSSARY: View Design, Fiscal Year, Target Series): the running total of a
// Metric since the start of its year, with the plan and last year. What it draws (the sums, where each period sits in
// its year, the gap to the plan and every word) is worked out by the core in running-total.ts; this file only turns it
// into SVG, from Theme tokens, so a widget, a Snapshot, a View Link and a deck's picture show the same numbers. Colour
// only ever means on or off the plan, and the words say it too. It reaches no Metric outside the widget's own.
import { format } from "date-fns";
import { formatValue } from "@ziffr/core/format";
import { runningTotal } from "@ziffr/core/running-total";
import type { DesignValues } from "./design-view";

const W = 420;
const H = 230;
const L = 46;
const R = 128;
const T = 12;
const B = 26;
const LINE = 10.5;

type Tag = { key: string; y: number; lines: string[]; color: string };

/** Labels at the line ends, pushed apart so that none is written over another, kept inside the chart. */
function spread(tags: Tag[]): Tag[] {
  const sorted = [...tags].sort((a, b) => a.y - b.y);
  let floor = T;
  for (const t of sorted) {
    t.y = Math.max(t.y, floor);
    floor = t.y + t.lines.length * LINE + 2;
  }
  const over = floor - (H - B);
  if (over > 0) for (const t of sorted) t.y = Math.max(T, t.y - over);
  return sorted;
}

/** The Metric's running total through the year, against its plan and last year, as lines with their values at the ends. */
export function CumulativeMark({ v }: { v: DesignValues }) {
  const { m, data } = v;
  const today = data.today ?? format(new Date(), "yyyy-MM-dd");
  const model = runningTotal({ metric: m, points: data.series[m.slug] ?? [], targets: data.targets[m.id], yearStart: data.yearStart, today, style: data.numberStyle, plan: v.flags.showTarget });
  if (!model.ok) return <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.reason}</p>;
  const top = Math.max(...model.lines.flatMap((l) => l.points.map((p) => p.total)), 1);
  const x = (at: number) => L + (model.slots > 1 ? (at / (model.slots - 1)) * (W - L - R) : 0);
  const y = (n: number) => H - B - (n / top) * (H - B - T);
  const stroke: Record<string, { color: string; width: number; dash?: string; opacity?: number }> = {
    now: { color: model.status === "off" ? "var(--color-error)" : model.status === "on" ? "var(--color-success)" : "var(--color-data)", width: 2.4 },
    plan: { color: "var(--color-ink)", width: 1.4, dash: "5 3" },
    last: { color: "var(--color-muted)", width: 1.4, opacity: 0.7 },
  };
  const tags = spread(model.lines.map((l) => ({ key: l.key, y: y(l.points.at(-1)!.total) - 3, color: stroke[l.key].color, lines: [`${l.name} ${l.end}`, ...(l.words ? l.words.split(", ") : [])] })));
  return (
    <>
      <div className="relative min-h-40 w-full flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" role="img" aria-label={model.alt}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} stroke="var(--color-rule)" strokeWidth={0.8} />
              <text x={L - 4} y={y(top * f) + 3} textAnchor="end" fontSize={9} fill="var(--color-muted)" fontFamily="var(--font-outlier)">{formatValue(m, top * f, data.numberStyle)}</text>
            </g>
          ))}
          {model.ticks.map((t) => <text key={t.at} x={x(t.at)} y={H - 8} textAnchor={t.at === 0 ? "start" : "middle"} fontSize={9} fill="var(--color-muted)">{t.label}</text>)}
          {[...model.lines].reverse().map((l) => {
            const s = stroke[l.key];
            const last = l.points.at(-1)!;
            return (
              <g key={l.key} data-line={l.key}>
                <polyline points={l.points.map((p) => `${x(p.at)},${y(p.total)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} strokeOpacity={s.opacity} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={x(last.at)} cy={y(last.total)} r={l.key === "now" ? 3.2 : 2.2} fill={s.color} fillOpacity={s.opacity} />
              </g>
            );
          })}
          {spread(tags).map((t) => (
            <text key={t.key} x={W - R + 8} y={t.y + 8} fontSize={9.5} fill="var(--color-ink)">
              {t.lines.map((s, i) => <tspan key={i} x={W - R + 8} dy={i === 0 ? 0 : LINE} fontWeight={i === 0 ? 600 : 400} fill={i === 0 ? t.color : "var(--color-muted)"}>{s}</tspan>)}
            </text>
          ))}
        </svg>
      </div>
      {model.notes.map((n) => <p key={n} className="widget-text-xs mt-0.5 text-muted-foreground">{n}</p>)}
    </>
  );
}
