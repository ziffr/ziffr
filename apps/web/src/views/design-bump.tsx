"use client";
// The bump mark of a View Design (GLOSSARY: View Design, Breakdown): one line per row of a Metric's Breakdown across its
// periods, the height being the row's rank (1 at the top), not its value. What is drawn (the periods, the rows, their
// ranks, the biggest mover, every word and the text alternative) is worked out once by the core in bump-marks.ts; this
// file only turns it into SVG from Theme tokens, so a widget, a Snapshot, a View Link and a deck's picture show the same
// chart. It reaches no Metric but the widget's own. Colour never carries meaning alone: the row that gained the most
// places says "up 3 places" in its label, and every row is named at the end of its line.
import type { ReactNode } from "react";
import { formatValue } from "@ziffr/core/format";
import { periodLabel } from "@ziffr/core/periods";
import { bumpModel, upWords } from "@ziffr/core/bump-marks";
import type { DesignValues } from "./design-view";

const W = 360;
const H = 190;
const LEFT = 14;
const RIGHT = 112;
const TOP = 10;
const BOTTOM = 16;
// A label is two lines of 7 and 6 units: rows whose lines would touch are pushed apart by this much.
const GAP = 15;
const NAME = 16;

/** The y of every label, kept at least GAP apart (two rows can end on the same rank): each wants its line's end, pushed down when it would touch the one above, then the block lifted back inside the plot. */
function spread(wanted: number[], floor: number): number[] {
  const order = wanted.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  const out = new Array<number>(wanted.length);
  let prev = -Infinity;
  for (const { y, i } of order) {
    prev = Math.max(y, prev + GAP);
    out[i] = prev;
  }
  const over = Math.max(0, Math.max(...out) - floor);
  return out.map((y) => y - over);
}

/** A bump chart of a Metric's Breakdowns over its last periods. */
export function BumpMark({ v }: { v: DesignValues }) {
  const { m, data } = v;
  const last = v.all[v.all.length - 1];
  const byPeriod = data.breakdowns[m.id] ?? {};
  // The window ends at the newest period the Metric has a value or a Breakdown in.
  const newest = [last?.period, ...Object.keys(byPeriod)].filter((p): p is string => !!p).sort().pop();
  if (!newest) return <Words>{m.name} has no breakdown to draw.</Words>;
  const model = bumpModel({
    name: m.name,
    by: v.by,
    to: newest,
    window: v.win,
    byPeriod,
    periods: v.all.map((p) => p.period),
    label: (p) => periodLabel(p, v.by, data.yearStart, true),
    write: (x) => formatValue(m, x, data.numberStyle),
  });
  if (!model.ok) return <Words>{model.reason}</Words>;
  const { periods, rows, lowest } = model;
  const n = periods.length;
  const x = (i: number) => LEFT + ((W - LEFT - RIGHT) * i) / (n - 1);
  const bottom = H - BOTTOM;
  const y = (rank: number) => TOP + ((bottom - TOP - 8) * (rank - 1)) / Math.max(lowest - 1, 1);
  const labelY = spread(rows.map((r) => y(r.end.rank)), bottom);
  // With many periods the names would touch: they are written on every other one, and the newest always.
  const every = n > 8 ? 2 : 1;
  const mover = rows.some((r) => r.up !== null);
  const tone = (up: number | null) => (up !== null ? "var(--color-accent)" : mover ? "var(--color-muted)" : "var(--color-data)");
  // The mover is drawn last, so nothing covers it.
  const drawOrder = [...rows].sort((a, b) => Number(a.up !== null) - Number(b.up !== null));
  return (
    <>
      <div className="relative min-h-40 w-full flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" role="img" aria-label={model.alt} preserveAspectRatio="xMidYMid meet">
          <line x1={LEFT} x2={W - RIGHT} y1={bottom} y2={bottom} stroke="var(--color-rule)" strokeWidth={0.8} />
          {Array.from({ length: lowest }, (_, k) => k + 1).map((rank) => (
            <text key={rank} x={LEFT - 5} y={y(rank) + 2.5} textAnchor="end" fontSize={6} fill="var(--color-muted)">{rank}</text>
          ))}
          {periods.map((p, i) => (n - 1 - i) % every === 0 && (
            <text key={p.period} x={x(i)} y={H - 4} textAnchor="middle" fontSize={6.5} fill="var(--color-muted)">{p.label}</text>
          ))}
          {drawOrder.map((r) => {
            const color = tone(r.up);
            const width = r.up !== null ? 2.4 : 1.4;
            return (
              <g key={r.label}>
                {r.ranks.map((rank, i) => rank !== null && i > 0 && r.ranks[i - 1] !== null && (
                  // A line joins two periods only when the row has both: a missing period is a gap, never a last place.
                  <line key={i} x1={x(i - 1)} y1={y(r.ranks[i - 1]!)} x2={x(i)} y2={y(rank)} stroke={color} strokeWidth={width} strokeLinecap="round" />
                ))}
                {r.ranks.map((rank, i) => rank !== null && (
                  <circle key={i} cx={x(i)} cy={y(rank)} r={r.up !== null ? 3 : 2.3} fill={color} stroke="var(--color-paper)" strokeWidth={0.8}>
                    <title>{`${r.label}, ${periods[i].label}: rank ${rank}, ${formatValue(m, r.values[i]!, data.numberStyle)}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          {rows.map((r, k) => {
            const lastAt = r.ranks.map((q) => q !== null).lastIndexOf(true);
            const ly = labelY[k];
            const name = r.label.length > NAME ? `${r.label.slice(0, NAME - 1)}…` : r.label;
            return (
              <g key={r.label}>
                {/* A short leader from the end of the line to its label when the label had to move to keep clear of another. */}
                <line x1={x(lastAt) + 4} y1={y(r.end.rank)} x2={x(n - 1) + 8} y2={ly - 2} stroke="var(--color-rule)" strokeWidth={0.6} />
                <text x={x(n - 1) + 10} y={ly} fontSize={7} fill="var(--color-ink)" fontWeight={r.up !== null ? 700 : 500}>
                  {`${name} · ${r.end.rank}`}
                  <title>{r.label}</title>
                </text>
                <text x={x(n - 1) + 10} y={ly + 7} fontSize={6} fill="var(--color-muted)">
                  {r.up !== null ? <tspan fill="var(--color-ink)" fontWeight={700}>{`${upWords(r.up)} · `}</tspan> : null}
                  {r.end.seen ? `last ${r.end.seen} · ` : ""}
                  {r.end.value}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <Words>{model.rule}</Words>
    </>
  );
}

function Words({ children }: { children: ReactNode }) {
  return <p className="widget-text-xs mt-0.5 text-muted-foreground">{children}</p>;
}
