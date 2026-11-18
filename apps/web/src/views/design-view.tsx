"use client";
// The one renderer for View Designs (GLOSSARY: View Design): it draws any design, the built-in Views included. Every
// number comes from the core's verified functions (shownSeries, the forecast, correlate, formatValue in the Number
// Style), worked out once in `designValues`; the design only says which of them each mark shows and how it looks.
// Security: a design is data. Its words are drawn as React text, never as markup, and it reaches no Metric outside
// the widget's own.
import type { ReactNode } from "react";
import { compactValue, formatNumber, formatValue, health } from "@ziffr/core/format";
import { comparedBy, correlate, periodCountLabel, periodWord, rankCorrelations, strength, type Correlation } from "@ziffr/core/correlation";
import { resolverFrom } from "@ziffr/core/compare";
import { dayAfter, heldText, isPartial, pointName, shownSeries, type DisplayPoint } from "@ziffr/core/display-periods";
import { periodLabel } from "@ziffr/core/periods";
import type { Flag, Part, Piece, TextShow, TextStyle, ViewDesign } from "@ziffr/core/view-design";
import type { CanvasData, Metric, Widget } from "@ziffr/core/types";
import { forecast } from "@ziffr/core/forecast";
import { designRecipe, formatOutput } from "@ziffr/core/design-analysis";
import { TargetChip } from "@/components/target-chip";
import { cn } from "@/lib/utils";
import { ApprovalMark } from "./approval-mark";
import { DesignPlot } from "./design-plot";

type Props = {
  design: ViewDesign;
  widget: Pick<Widget, "metric_ids" | "settings">;
  /** The widget's Metrics, in Slot order, as the person may see them. */
  metrics: Metric[];
  data: CanvasData;
  onPointContext?: (metricId: number, period: string) => void;
};

/** Everything a design can show, worked out by the core for one widget. Only what the design uses is computed. */
export type DesignValues = ReturnType<typeof designValues>;

/** The numbers and words a design draws for a widget, each from the core's functions. */
export function designValues(design: ViewDesign, widget: Pick<Widget, "settings">, metrics: Metric[], data: CanvasData) {
  const uses = usage(design);
  const m = metrics[0];
  const s = widget.settings;
  // Show by (spec 0018) only for a design that offers it; a Snapshot's deck counts "to date" as of its own day.
  const shown = shownSeries(m, data, design.options?.display ? s.display : undefined, { today: s.asOf ? dayAfter(s.asOf) : undefined });
  const by = shown.by;
  const all = shown.points;
  const combined = shown.combined;
  const win = s.window ?? design.options?.window?.default ?? 12;
  const pts = all.slice(-win);
  const last: DisplayPoint | undefined = all[all.length - 1];
  const targets = shown.targets;
  const option = (k: "showTarget" | "showForecast") => s[k] ?? design.options?.[k]?.default ?? k === "showTarget";
  // The target a value is judged against: the span's own when combined, else the Metric's range as always.
  const goal = (p: DisplayPoint | undefined) => (combined ? { target_min: targets?.at[p?.period ?? ""]?.min ?? null, target_max: targets?.at[p?.period ?? ""]?.max ?? null } : { target_min: m.target_min, target_max: m.target_max });
  const name = (p: DisplayPoint, short = false) => pointName(p, by, m.period, data.yearStart, short);
  const note = shown.reason ?? (combined ? targets?.note ?? null : null);
  const flags: Record<Flag, boolean> = { showTarget: option("showTarget"), showForecast: option("showForecast"), hasForecast: false, hasNote: !!note, manyValues: pts.length > 1 };
  // A span still running would read as a drop: the forecast starts from the last complete one.
  const fc = uses.forecast(flags) ? forecast(last?.toDate ? pts.slice(0, -1) : pts, by)?.points ?? null : null;
  flags.hasForecast = !!fc?.length;
  const resolve = resolverFrom(data.metrics, data.series);
  const correlation: Correlation | null = uses.pairs && metrics[1] ? correlate(m, metrics[1], resolve, { yearStart: data.yearStart }) : null;
  const drivers = uses.drivers ? rankCorrelations(m, metrics.slice(1), resolve, { yearStart: data.yearStart }) : null;
  const matrix = uses.matrix ? metrics.map((a) => metrics.map((b) => (a.id === b.id ? null : correlate(a, b, resolve, { yearStart: data.yearStart })))) : null;
  // The target band shows when there is a range, and, for a combined series, when its spans have one.
  const band = (!combined || !!targets?.range) && (m.target_min !== null || m.target_max !== null);
  // The design's Analysis Recipe, on the series the widget shows of its own Metrics, by the library's functions.
  const recipe = designRecipe(design, metrics, data, s);
  return { m, metrics, by, all, pts, last, combined, targets, note, flags, fc, correlation, drivers, matrix, band, goal, name, data, settings: s, recipe, analysis: design.analysis ?? null };
}

/** Which of the core's results a design needs, so a number widget never runs a correlation. */
function usage(d: ViewDesign) {
  const shows = new Set<string>();
  const whens: { show: string; when?: Flag[] }[] = [];
  const walk = (parts: Part[]) =>
    parts.forEach((p) => {
      if (p.mark === "group") walk(p.parts);
      else if (p.mark === "plot") p.marks.forEach((k) => (shows.add(k.show), whens.push({ show: k.show, when: [...(p.when ?? []), ...(k.when ?? [])] })));
      else if (p.mark === "text") p.content.forEach((c) => typeof c !== "string" && (shows.add(c.show), whens.push({ show: c.show, when: p.when })));
      else shows.add(p.show);
    });
  walk(d.parts);
  const has = (prefix: string) => [...shows].some((x) => x === prefix || x.startsWith(`${prefix}.`));
  return {
    // The forecast is worked out only when a mark that shows it is drawn: a line with its forecast switched off
    // draws exactly what it did before forecasts existed.
    forecast: (flags: Record<Flag, boolean>) => whens.some((w) => (w.show === "forecast" || w.show.startsWith("forecast.")) && (w.when ?? []).every((f) => f === "hasForecast" || flags[f])),
    pairs: shows.has("pairs") || has("correlation"),
    drivers: has("drivers") || shows.has("correlations"),
    matrix: shows.has("matrix"),
  };
}

/** A widget drawn from its View Design. */
export function DesignView({ design, widget, metrics, data, onPointContext }: Props) {
  const v = designValues(design, widget, metrics, data);
  const { m } = v;
  // What the design needs and does not have says why, in the core's words where it has them.
  if (v.matrix && metrics.length < 2) return <Empty>{design.empty ?? "Needs at least two Metrics."}</Empty>;
  if (usage(design).pairs && !metrics[1]) return <Empty>{design.empty ?? "Needs two Metrics."}</Empty>;
  if (v.correlation && !v.correlation.ok) return <Empty>{v.correlation.reason}</Empty>;
  if (v.drivers && !v.drivers.ranked.length)
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <p className="text-xs text-muted-foreground">No other metric with enough periods in common with {m.name}.</p>
        <NotCombined reasons={leftOutReasons(v)} />
      </div>
    );
  // A point of a combined series is a span, not one of the Metric's periods: there is no single value to ask about.
  const ctx = onPointContext && !v.combined ? (p: string) => onPointContext(m.id, p) : undefined;
  return <div className={cn("flex h-full flex-col", design.kind === "analysis" && "gap-2")}>{design.parts.map((p, i) => <PartView key={i} part={p} v={v} ctx={ctx} />)}</div>;
}

const drawn = (when: Flag[] | undefined, v: DesignValues) => (when ?? []).every((f) => v.flags[f]);

function PartView({ part, v, ctx }: { part: Part; v: DesignValues; ctx?: (period: string) => void }): ReactNode {
  if (!drawn(part.when, v)) return null;
  switch (part.mark) {
    case "text":
      return <TextView style={part.style} pieces={part.content} v={v} />;
    case "group":
      return (
        <div className={cn("flex", part.direction === "row" ? "flex-wrap items-center gap-1.5" : "h-full flex-col", part.align === "center" && "items-center justify-center", part.style && STYLE[part.style])}>
          {part.parts.map((p, i) => <PartView key={i} part={p} v={v} ctx={ctx} />)}
        </div>
      );
    case "plot":
      return (
        <div className={part.axes === "none" ? "mt-auto min-h-10 flex-1 pt-2" : "min-h-0 flex-1"}>
          <DesignPlot part={part} v={v} onPointContext={ctx} />
        </div>
      );
    case "gauge":
      return <GaugeMark v={v} />;
    case "rows":
      if (part.show === "values") return <ValueRows v={v} limit={part.limit === "rows" ? v.settings.rows ?? 6 : part.limit ?? 6} ctx={ctx} />;
      if (part.show === "matrix") return <MatrixRows v={v} />;
      if (part.show === "correlations") return <DriverRows v={v} />;
      return <NotCombined reasons={v.drivers ? leftOutReasons(v) : matrixReasons(v)} />;
  }
}

// The Theme's type scale: a design picks a step, never a size, colour or font of its own.
const STYLE: Record<TextStyle, string> = {
  headline: "text-[length:clamp(var(--text-3xl),13cqw,5rem)] leading-none font-semibold tracking-[-0.03em]",
  value: "-mt-1 text-xl font-semibold tracking-[-0.02em]",
  caption: "mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground",
  body: "mb-1 text-xs text-muted-foreground",
  note: "mt-0.5 text-[11px] text-muted-foreground",
};

function TextView({ style, pieces, v }: { style?: TextStyle; pieces: Piece[]; v: DesignValues }) {
  // Words are React text: markup in them is shown as the characters it is made of, never run.
  const body = pieces.map((p, i) => {
    if (typeof p === "string") return <span key={i}>{p}</span>;
    const value = textValue(p.show, v);
    if (value === null || value === "") return null;
    return (
      <span key={i}>
        {p.before}
        {p.style === "strong" ? <span className="font-medium text-foreground">{value}</span> : value}
        {p.after}
      </span>
    );
  });
  if (style === "headline") return <div className="flex items-baseline gap-2"><span className={STYLE.headline}>{body}</span></div>;
  if (style === "body" || style === "note") return <p className={STYLE[style]}>{body}</p>;
  return <div className={style ? STYLE[style] : undefined}>{body}</div>;
}

/** A value a text shows, written by the core: formatValue in the Number Style, pointName, the correlation's words. */
function textValue(show: TextShow, v: DesignValues): ReactNode {
  if (show.startsWith("recipe.")) return recipeText(show.slice("recipe.".length), v);
  const { m, last, data, fc, correlation: c, drivers } = v;
  const ns = data.numberStyle;
  const top = drivers?.ranked[0];
  const end = fc?.[fc.length - 1];
  switch (show) {
    case "metric.name":
      return m.name;
    case "latest.value":
      return formatValue(m, last?.value, ns);
    case "latest.period":
      // "Q4 26, 2 of 3 months" fits a small card; the tooltip says "to date" in full.
      if (!last) return "No values yet";
      return last.toDate || isPartial(last) ? <span title={v.name(last)}>{periodLabel(last.period, v.by, data.yearStart, true)}, {heldText(last, m.period)}</span> : v.name(last);
    case "latest.status":
      // The headline stays neutral; the chip says on or off target (one colour rule, see target-chip).
      return <TargetChip metric={{ ...m, ...v.goal(last) }} value={last?.value} note={v.note} numberStyle={ns} />;
    case "latest.approval":
      return last ? <ApprovalMark data={data} metricId={m.id} period={last.period} through={v.combined ? last.through : undefined} /> : null;
    case "target.note":
      return v.note;
    case "forecast.value":
      return end ? formatValue(m, end.value, ns) : null;
    case "forecast.period":
      return end ? periodLabel(end.period, v.by, data.yearStart) : null;
    case "forecast.low":
      return end ? compactValue(m, end.lo, ns) : null;
    case "forecast.high":
      return end ? compactValue(m, end.hi, ns) : null;
    case "correlation.strength":
      return c?.ok ? strength(c.r) : null;
    case "correlation.r":
      return c?.ok ? <span className="fig">{formatNumber(c.r, 2, ns)}</span> : null;
    case "correlation.over":
      return c?.ok ? (comparedBy(c) ? `· ${comparedBy(c)}` : `over ${periodCountLabel(c.period, c.n)}`) : null;
    case "drivers.name":
      return top?.metric.name ?? null;
    case "drivers.strength":
      return top ? strength(top.result.r) : null;
    case "drivers.over":
      return top ? comparedBy(top.result) : null;
  }
}

/** A recipe output as text: its one value, or a series' latest, in the output's unit (formatOutput). */
function recipeText(step: string, v: DesignValues): string | null {
  const out = v.analysis?.outputs.find((o) => o.step === step);
  const res = v.recipe?.[step];
  if (!out || !res) return null;
  const value = res.kind === "value" ? res.value : res.points[res.points.length - 1]?.value;
  return value === null || value === undefined ? null : formatOutput(out.unit, v.m, value, v.data.numberStyle);
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">{children}</div>;
}

/** Semicircle gauge: the target band in green, the needle at the latest value. */
function GaugeMark({ v }: { v: DesignValues }) {
  const { m, last } = v;
  const value = last?.value;
  const all = [...v.pts.map((p) => p.value), m.target_min, m.target_max].filter((x): x is number => x !== null && x !== undefined);
  const lo = Math.min(...all) * 0.9;
  const hi = Math.max(...all) * 1.1;
  const t = (x: number) => Math.min(1, Math.max(0, (x - lo) / (hi - lo || 1)));
  const pt = (f: number, r: number) => [60 - r * Math.cos(Math.PI * f), 60 - r * Math.sin(Math.PI * f)] as const;
  const arc = (a: number, b: number, r: number) => {
    const [x1, y1] = pt(a, r);
    const [x2, y2] = pt(b, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const tMin = m.target_min !== null ? t(m.target_min) : 0;
  const tMax = m.target_max !== null ? t(m.target_max) : 1;
  const ok = value !== undefined && (m.target_min === null || value >= m.target_min) && (m.target_max === null || value <= m.target_max);
  const [nx, ny] = pt(value === undefined ? 0 : t(value), 40);
  return (
    <svg viewBox="0 0 120 68" className="w-full max-w-56" role="img" aria-label={`${m.name} ${formatValue(m, value, v.data.numberStyle)} against target`}>
      <path d={arc(0, 1, 46)} stroke="var(--color-paper-3)" strokeWidth={10} fill="none" />
      <path d={arc(tMin, tMax, 46)} stroke="var(--color-success)" strokeOpacity={0.45} strokeWidth={10} fill="none" />
      {value !== undefined && <line x1={60} y1={60} x2={nx} y2={ny} stroke={ok ? "var(--color-ink)" : "var(--color-error)"} strokeWidth={2.5} strokeLinecap="round" />}
      <circle cx={60} cy={60} r={3.5} fill="var(--color-ink)" />
    </svg>
  );
}

function ValueRows({ v, limit, ctx }: { v: DesignValues; limit: number; ctx?: (period: string) => void }) {
  const { m, data } = v;
  const rows = v.all.slice(-limit).reverse();
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.period} className="border-b border-border last:border-0" onContextMenu={ctx ? () => ctx(r.period) : undefined}>
            <td className="py-1.5 text-muted-foreground"><span className="flex items-center gap-1" title={r.toDate || isPartial(r) ? v.name(r) : undefined}>{v.name(r, true)}<ApprovalMark data={data} metricId={m.id} period={r.period} through={v.combined ? r.through : undefined} short /></span></td>
            <td className={cn("fig py-1.5 text-right", health(v.goal(r), r.value) === "bad" && "text-destructive")}>{formatValue(m, r.value, data.numberStyle)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Why Metrics are kept to their own period, once each (Aggregation none), so a missing pair is never silent. */
function NotCombined({ reasons }: { reasons: string[] }) {
  const unique = [...new Set(reasons)];
  if (!unique.length) return null;
  return <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">{unique.map((r) => <li key={r}>{r}</li>)}</ul>;
}

const leftOutReasons = (v: DesignValues) => (v.drivers?.leftOut ?? []).map((l) => (l.why === "not-combined" ? l.reason : `${l.metric.name}: ${l.reason}`));
const matrixReasons = (v: DesignValues) => (v.matrix ?? []).flat().flatMap((c) => (c && !c.ok && c.why === "not-combined" ? [c.reason] : []));

function MatrixRows({ v }: { v: DesignValues }) {
  const { metrics, matrix, data } = v;
  const ns = data.numberStyle;
  // Each pair on its common period: the longer of the two, the shorter combined by its Aggregation.
  return (
    <div className="h-full overflow-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th />
            {metrics.map((m) => <th key={m.id} className="max-w-20 rotate-180 px-1 pb-1 text-left font-medium [writing-mode:vertical-rl]">{m.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {metrics.map((a, i) => (
            <tr key={a.id}>
              <th className="pr-2 text-right font-medium whitespace-nowrap">{a.name}</th>
              {metrics.map((b, j) => {
                const c = matrix?.[i][j];
                const r = a.id === b.id ? 1 : c?.ok ? c.r : null;
                const title = a.id === b.id ? undefined : !c ? undefined : c.ok ? [`r = ${formatNumber(c.r, 2, ns)}`, comparedBy(c) ?? `over ${periodCountLabel(c.period, c.n)}`].join(", ") : c.reason;
                const bg = r === null ? "var(--color-paper-2)" : r >= 0 ? `color-mix(in oklch, var(--color-data) ${Math.abs(r) * 55}%, var(--color-cotton))` : `color-mix(in oklch, var(--color-error) ${Math.abs(r) * 55}%, var(--color-cotton))`;
                return (
                  <td key={b.id} title={title} className={cn("fig size-11 text-center text-xs", r !== null && Math.abs(r) > 0.6 && "text-[var(--color-board-type)]")} style={{ background: bg }}>
                    {r === null ? "–" : formatNumber(r, 2, ns)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriverRows({ v }: { v: DesignValues }) {
  const ns = v.data.numberStyle;
  return (
    <ul className="space-y-1">
      {(v.drivers?.ranked ?? []).map(({ metric: o, result: res }) => (
        <li key={o.id} title={comparedBy(res) ?? undefined} className="grid grid-cols-[minmax(0,8rem)_1fr_3rem] items-center gap-2 text-xs">
          <span className="truncate">{o.name}{res.combined && <span className="text-muted-foreground"> · by {periodWord(res.period)}</span>}</span>
          <span className="h-2 rounded-full bg-[var(--color-paper-3)]">
            <span className="block h-2 rounded-full" style={{ width: `${Math.abs(res.r) * 100}%`, background: res.r >= 0 ? "var(--color-data)" : "var(--color-error)" }} />
          </span>
          <span className="fig text-right">{formatNumber(res.r, 2, ns)}</span>
        </li>
      ))}
    </ul>
  );
}
