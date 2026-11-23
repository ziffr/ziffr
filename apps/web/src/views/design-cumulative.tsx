"use client";
// The cumulative mark of a View Design (GLOSSARY: View Design, Fiscal Year, Target Series): the running total of a
// Metric since the start of its year, with the plan and last year. What it draws (the sums, where each period sits in
// its year, the gap to the plan and every word) is worked out by the core in running-total.ts; this file turns it into
// SVG, from Theme tokens, to the pixels of the card it is in, so the type is the widget's own size at any card size, so a
// widget, a Snapshot, a View Link and a deck's picture show the same numbers. Colour only ever means on or off the plan,
// and the words say it too. A wide card writes each line's name, value and standing at its end; a narrow one gives the
// whole width to the lines, with fewer period names, and says the values in one line below. It reaches no
// Metric outside the widget's own.
import { format } from "date-fns";
import { formatValue } from "@ziffr/core/format";
import { runningTotal } from "@ziffr/core/running-total";
import type { DesignValues } from "./design-view";
import { useBoxSize } from "./use-box-size";
import { useWidgetScale } from "./widget-scale";

type Tag = { key: string; y: number; lines: string[]; color: string };

/** The Metric's running total through the year, against its plan and last year, as lines with their values at the ends. */
export function CumulativeMark({ v }: { v: DesignValues }) {
  const { m, data } = v;
  const today = data.today ?? format(new Date(), "yyyy-MM-dd");
  const model = runningTotal({ metric: m, points: data.series[m.slug] ?? [], targets: data.targets[m.id], yearStart: data.yearStart, today, style: data.numberStyle, plan: v.flags.showTarget });
  if (!model.ok) return <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.reason}</p>;
  return <CumulativeChart v={v} model={model} />;
}

function CumulativeChart({ v, model }: { v: DesignValues; model: Extract<ReturnType<typeof runningTotal>, { ok: true }> }) {
  const { m, data } = v;
  const scale = useWidgetScale();
  const [whole, all] = useBoxSize<HTMLDivElement>();
  const [box, size] = useBoxSize<HTMLDivElement>();
  // Until the box is measured (the first render on the server, a drawing made without a screen) a nominal size is drawn.
  const measured = size.w > 0 && size.h > 0;
  const W = measured ? size.w : 420;
  const H = measured ? size.h : 230;
  const fs = 10 * scale;
  const line = fs * 1.2;
  const detail = W / scale >= 430 ? "full" : "narrow";
  const top = Math.max(...model.lines.flatMap((l) => l.points.map((p) => p.total)), 1);
  const axis = Math.max(...[0, 0.5, 1].map((f) => formatValue(m, top * f, data.numberStyle).length)) * 0.62 * fs * 0.9 + 8;
  const L = axis;
  const R = detail === "full" ? Math.min(W * 0.34, 150 * scale) : 8;
  const T = fs + 2;
  const B = fs * 2.4;
  const x = (at: number) => L + (model.slots > 1 ? (at / (model.slots - 1)) * (W - L - R) : 0);
  const y = (n: number) => H - B - (n / top) * (H - B - T);
  const stroke: Record<string, { color: string; width: number; dash?: string; opacity?: number }> = {
    now: { color: model.status === "off" ? "var(--color-error)" : model.status === "on" ? "var(--color-success)" : "var(--color-data)", width: 2.4 },
    plan: { color: "var(--color-ink)", width: 1.4, dash: "5 3" },
    last: { color: "var(--color-muted)", width: 1.4, opacity: 0.7 },
  };
  // The labels at the line ends, pushed apart so that none is written over another and kept inside the chart.
  const spread = (tags: Tag[]): Tag[] => {
    const sorted = [...tags].sort((a, b) => a.y - b.y);
    let floor = T;
    for (const t of sorted) {
      t.y = Math.max(t.y, floor);
      floor = t.y + t.lines.length * line + 2;
    }
    const over = floor - (H - B);
    if (over > 0) for (const t of sorted) t.y = Math.max(T, t.y - over);
    return sorted;
  };
  const tags = detail === "narrow" ? [] : spread(model.lines.map((l) => ({ key: l.key, y: y(l.points.at(-1)!.total) - 3, color: stroke[l.key].color, lines: [`${l.name} ${l.end}`, ...(l.words ? l.words.split(", ") : [])] })));
  // A narrow card says the values in one line under the chart instead of at the line ends.
  const said = model.lines.map((l) => `${l.name} ${l.end}`).join(" · ");
  const tall = all.h === 0 || all.h / scale >= 170;
  return (
    <div ref={whole} className="flex min-h-0 w-full flex-1 flex-col">
      <div ref={box} className="relative min-h-[5rem] w-full flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" role="img" aria-label={model.alt}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} stroke="var(--color-rule)" strokeWidth={0.8} />
              <text x={L - 4} y={y(top * f) + 3} textAnchor="end" fontSize={fs * 0.9} fill="var(--color-muted)" fontFamily="var(--font-outlier)">{formatValue(m, top * f, data.numberStyle)}</text>
            </g>
          ))}
          {model.ticks.filter((t, i, all) => detail !== "narrow" || i % Math.ceil(all.length / 4) === 0).map((t) => <text key={t.at} x={x(t.at)} y={H - fs * 0.7} textAnchor={t.at === 0 ? "start" : "middle"} fontSize={fs * 0.9} fill="var(--color-muted)">{t.label}</text>)}
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
          {tags.map((t) => (
            <text key={t.key} x={W - R + 8} y={t.y + fs * 0.8} fontSize={fs} fill="var(--color-ink)">
              {t.lines.map((s, i) => <tspan key={i} x={W - R + 8} dy={i === 0 ? 0 : line} fontWeight={i === 0 ? 600 : 400} fill={i === 0 ? t.color : "var(--color-muted)"}>{s}</tspan>)}
            </text>
          ))}
        </svg>
      </div>
      {detail === "narrow" && tall && <p className="widget-text-xs mt-0.5 text-muted-foreground">{said}</p>}
      {tall && model.notes.map((n) => <p key={n} className="widget-text-xs mt-0.5 text-muted-foreground">{n}</p>)}
    </div>
  );
}
