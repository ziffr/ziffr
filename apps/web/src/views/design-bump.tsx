"use client";
// The bump mark of a View Design (GLOSSARY: View Design, Breakdown): one line per row of a Metric's Breakdown across its
// periods, the height being the row's rank (1 at the top), not its value. What is drawn (the periods, the rows, their
// ranks, the biggest mover, every word and the text alternative) is worked out once by the core in bump-marks.ts; this
// file only turns it into SVG from Theme tokens, so a widget, a Snapshot, a View Link and a deck's picture show the same
// chart. It reaches no Metric but the widget's own. Colour never carries meaning alone: the row that gained the most
// places says "up 3 places" in its label, and every row is named at the end of its line.
import { formatValue } from "@ziffr/core/format";
import { bumpModel, upWords } from "@ziffr/core/bump-marks";
import { breakdownInput } from "./breakdown-input";
import type { DesignValues } from "./design-view";
import { ChartFrame, useChartSize, Words } from "./chart-frame";

const NAME = 16;

/** The y of every label, kept at least `gap` apart (two rows can end on the same rank): each wants its line's end, pushed down when it would touch the one above, then the block lifted back inside the plot. */
function spread(wanted: number[], floor: number, gap: number): number[] {
  const order = wanted.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  const out = new Array<number>(wanted.length);
  let prev = -Infinity;
  for (const { y, i } of order) {
    prev = Math.max(y, prev + gap);
    out[i] = prev;
  }
  const over = Math.max(0, Math.max(...out) - floor);
  return out.map((y) => y - over);
}

/** A bump chart of a Metric's Breakdowns over its last periods. */
export function BumpMark({ v }: { v: DesignValues }) {
  const input = breakdownInput(v);
  if (!input) return <Words>{v.m.name} has no breakdown to draw.</Words>;
  const model = bumpModel(input);
  if (!model.ok) return <Words>{model.reason}</Words>;
  return <BumpChart v={v} model={model} />;
}

/** The chart, drawn to the pixels of its box: the lines fill the width, the type follows the widget scale, and the labels at the line
 * ends give way to the room: a wide card writes each row's name, rank and value (two lines), a middle one its name and rank, a narrow
 * one gives the width to the lines and says the biggest mover in one line below; a short card drops the words. */
function BumpChart({ v, model }: { v: DesignValues; model: Extract<ReturnType<typeof bumpModel>, { ok: true }> }) {
  const { m, data } = v;
  const { periods, rows, lowest } = model;
  const { scale, whole, all, box, W, H } = useChartSize({ w: 360, h: 190 });
  const fs = 10 * scale;
  const detail = W / scale >= 430 ? "full" : W / scale >= 250 ? "mid" : "narrow";
  const n = periods.length;
  const left = fs * 1.6;
  const right = detail === "full" ? Math.min(W * 0.3, 150 * scale) : detail === "mid" ? Math.min(W * 0.3, 96 * scale) : 8;
  const top = fs * 0.8;
  const bottom = H - fs * 1.6;
  const x = (i: number) => left + ((W - left - right) * i) / Math.max(n - 1, 1);
  const y = (rank: number) => top + ((bottom - top - 8) * (rank - 1)) / Math.max(lowest - 1, 1);
  const gap = detail === "full" ? fs * 2.3 : fs * 1.25;
  // The lowest label's second line must stay above the period names, so the labels are kept a line higher in a wide card.
  const labelY = spread(rows.map((r) => y(r.end.rank)), bottom - (detail === "full" ? fs * 1.1 : 0), gap);
  // With many periods the names would touch: they are written on as many as have the room, and the newest always.
  const every = Math.max(1, Math.ceil((5.4 * fs * 0.85) / Math.max(1, (W - left - right) / Math.max(n - 1, 1))));
  const mover = rows.some((r) => r.up !== null);
  const tone = (up: number | null) => (up !== null ? "var(--color-accent)" : mover ? "var(--color-muted)" : "var(--color-data)");
  // The mover is drawn last, so nothing covers it.
  const drawOrder = [...rows].sort((a, b) => Number(a.up !== null) - Number(b.up !== null));
  const nameMax = Math.max(4, Math.floor((right - 14) / (0.6 * fs * 0.9)) - (detail === "mid" ? 4 : 0));
  const movers = rows.filter((r) => r.up !== null).map((r) => `${r.label} ${upWords(r.up!)}`);
  const tall = all.h === 0 || all.h / scale >= 190;
  return (
    <ChartFrame
      whole={whole}
      box={box}
      below={
        <>
          {detail !== "full" && tall && movers.length > 0 && <Words>{movers.join(" · ")}</Words>}
          {tall && <Words>{model.rule}</Words>}
        </>
      }
    >
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" role="img" aria-label={model.alt}>
          <line x1={left} x2={W - right} y1={bottom} y2={bottom} stroke="var(--color-rule)" strokeWidth={0.8} />
          {Array.from({ length: lowest }, (_, k) => k + 1).map((rank) => (
            <text key={rank} x={left - 5} y={y(rank) + fs * 0.3} textAnchor="end" fontSize={fs * 0.8} fill="var(--color-muted)">{rank}</text>
          ))}
          {periods.map((p, i) => (n - 1 - i) % every === 0 && (
            <text key={p.period} x={Math.min(W - fs * 2, Math.max(fs * 2, x(i)))} y={H - fs * 0.4} textAnchor="middle" fontSize={fs * 0.85} fill="var(--color-muted)">{p.label}</text>
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
          {detail !== "narrow" && rows.map((r, k) => {
            const lastAt = r.ranks.map((q) => q !== null).lastIndexOf(true);
            const ly = labelY[k];
            const name = r.label.length > Math.min(NAME, nameMax) ? `${r.label.slice(0, Math.min(NAME, nameMax) - 1)}…` : r.label;
            return (
              <g key={r.label}>
                {/* A short leader from the end of the line to its label when the label had to move to keep clear of another. */}
                <line x1={x(lastAt) + 4} y1={y(r.end.rank)} x2={x(n - 1) + 8} y2={ly - 2} stroke="var(--color-rule)" strokeWidth={0.6} />
                <text x={x(n - 1) + 10} y={ly + fs * 0.3} fontSize={fs * 0.95} fill="var(--color-ink)" fontWeight={r.up !== null ? 700 : 500}>
                  {`${name} · ${r.end.rank}`}
                  <title>{r.label}</title>
                </text>
                {detail === "full" && (
                  <text x={x(n - 1) + 10} y={ly + fs * 1.3} fontSize={fs * 0.85} fill="var(--color-muted)">
                    {r.up !== null ? <tspan fill="var(--color-ink)" fontWeight={700}>{`${upWords(r.up)} · `}</tspan> : null}
                    {r.end.seen ? `last ${r.end.seen} · ` : ""}
                    {r.end.value}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
    </ChartFrame>
  );
}
