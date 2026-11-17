"use client";
// Findings (GLOSSARY: Finding): an editorial graphic, one finding per widget.
// Ranked bars, part-to-whole and pictogram read one period's Breakdown; the annotated line reads the series.
import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import { User } from "lucide-react";
import { compactValue, formatValue, SOURCE_LABEL } from "@ziffr/core/format";
import { countryCode } from "@/lib/countries";
import type { BreakdownRow, CanvasData, Metric, Panel, Widget } from "@ziffr/core/types";
import { Bridge, bridgeSteps, measureSeries, MEASURE_LABEL, PanelView, PeriodBars, resolveAnchor } from "./story-panels";
import type { Annotation } from "@ziffr/core/types";
import { cn } from "@/lib/utils";
import { JANUARY, periodLabel } from "@ziffr/core/periods";

type W = Pick<Widget, "template" | "metric_ids" | "settings">;

export function storyBreakdown(widget: W, data: CanvasData, m: Metric) {
  const byPeriod = data.breakdowns[m.id] ?? {};
  const periods = Object.keys(byPeriod).sort();
  const period = widget.settings.period && byPeriod[widget.settings.period] ? widget.settings.period : periods[periods.length - 1];
  const rows = period ? [...byPeriod[period]].sort((a, b) => b.value - a.value) : [];
  const sum = rows.reduce((a, r) => a + r.value, 0);
  const total = (data.series[m.slug] ?? []).find((p) => p.period === period)?.value ?? null;
  // Shares only make sense when the rows split the total; rates (return rate by category) do not.
  const additive = total !== null && sum > 0 && Math.abs(sum - total) <= Math.abs(total) * 0.02;
  const highlight = rows.find((r) => r.label === widget.settings.highlight) ?? rows[0] ?? null;
  return { period, periods, rows, sum, total, additive, highlight };
}

const pct = (v: number, of: number) => (of ? Math.round((v / of) * 100) : 0);

/** Text drawn from the data, used wherever the author left a field empty. */
export function storyDefaults(widget: W, data: CanvasData, m: Metric) {
  const name = m.name.toLowerCase();
  const b = storyBreakdown(widget, data, m);
  const when = b.period ? periodLabel(b.period, m.period, JANUARY) : "";
  const via = m.sources.map((s) => SOURCE_LABEL[s]).join(" and ") || "derived from other metrics";
  const source = `Source: ${m.name} in Ziffr, reported via ${via}${when ? `, ${when}` : ""}`;
  const h = b.highlight;
  switch (widget.template) {
    case "story": {
      const panel = widget.settings.panels?.[0];
      const pm = panel ? data.metrics.find((x) => x.id === panel.metricIds[0]) : undefined;
      if (!panel || !pm) return { headline: "Add a panel to tell this story", subline: "", source };
      const names = panel.metricIds.map((id) => data.metrics.find((x) => x.id === id)?.name).filter(Boolean).join(", ");
      const pSource = `Source: ${names} in Ziffr`;
      if (panel.type === "bridge") {
        const { steps } = bridgeSteps(pm, data, panel);
        const first = steps[0], end = steps[steps.length - 1];
        const driver = steps.filter((x) => x.kind !== "total").sort((a, b) => Math.abs(b.end - b.start) - Math.abs(a.end - a.start))[0];
        return {
          headline: first && end ? `${pm.name}: ${compactValue(pm, first.end)} to ${compactValue(pm, end.end)}${driver ? `, most of it from ${driver.label}` : ""}` : `${pm.name} has no breakdown yet`,
          subline: panel.bridge?.mode === "variance" ? `Change in ${pm.name.toLowerCase()} by row` : `${pm.name}, from ${first?.label ?? "start"} to ${end?.label ?? "end"}`,
          source: pSource,
        };
      }
      const rows = measureSeries(pm, data, panel);
      const lastRow = rows.filter((r) => !r.projected).at(-1);
      const measure = panel.measure ?? "value";
      const how = measure === "value" ? "" : ` ${MEASURE_LABEL[measure].toLowerCase()}`;
      return {
        headline: lastRow ? (measure === "value" ? `${pm.name}: ${compactValue(pm, lastRow.value)} in ${lastRow.label}` : `${pm.name} ${lastRow.value >= 0 ? "up" : "down"} ${Math.abs(lastRow.value).toFixed(1)} %${measure === "pct-yoy" ? " on the previous year" : measure === "pct-prev" ? " on the previous period" : ""} in ${lastRow.label}`) : `${names}`,
        subline: `${panel.metricIds.length > 1 ? names : pm.name}${how}`,
        source: pSource,
      };
    }
    case "ranked":
      return {
        headline: h ? (b.additive ? `${h.label} brings in ${pct(h.value, b.sum)} % of ${name}` : `${h.label} has the highest ${name}`) : `${m.name} has no breakdown yet`,
        subline: `${m.name}, ${when}`,
        source,
      };
    case "share":
      return { headline: h ? `${h.label} makes up ${pct(h.value, b.sum)} % of ${name}` : `${m.name} has no breakdown yet`, subline: `Share of ${name}, ${when}`, source };
    case "pictogram": {
      const n = h ? Math.round((h.value / (b.sum || 1)) * 10) : 0;
      return { headline: h ? `${n} in 10: ${h.label}` : `${m.name} has no breakdown yet`, subline: `Share of ${name}, ${when}`, source };
    }
    default: {
      const pts = (data.series[m.slug] ?? []).slice(-(widget.settings.window ?? 12));
      const first = pts[0], last = pts[pts.length - 1];
      const ch = first && last && first.value ? ((last.value - first.value) / Math.abs(first.value)) * 100 : 0;
      const span = pts.length > 1 ? `${pts.length - 1} ${m.period}s` : "";
      return {
        headline: last ? `${m.name} ${ch >= 0 ? "rose" : "fell"} ${Math.abs(ch).toFixed(0)} % in ${span}` : `${m.name} has no values yet`,
        subline: last ? `${m.name}, ${periodLabel(first.period, m.period, JANUARY, true)} to ${periodLabel(last.period, m.period, JANUARY, true)}` : "",
        source: `Source: ${m.name} in Ziffr, reported via ${via}`,
      };
    }
  }
}

export function StoryBody({ widget, data, m, onRowContext }: { widget: W; data: CanvasData; m: Metric; onRowContext?: (label: string, period: string) => void }) {
  const d = storyDefaults(widget, data, m);
  const s = widget.settings;
  const b = storyBreakdown(widget, data, m);
  const headline = s.headline || d.headline;
  const subline = s.subline || d.subline;
  const source = s.source || d.source;
  const empty = widget.template !== "story-line" && widget.template !== "story" && b.rows.length === 0;
  if (widget.template === "story") return <ComposedStory widget={widget} data={data} headline={headline} subline={subline} source={source} />;
  return (
    <div className="flex h-full flex-col">
      <div className="text-[length:clamp(var(--text-lg),3.4cqw,2.8rem)] leading-tight font-semibold tracking-[-0.02em] text-[var(--color-print)] font-[family-name:var(--font-heading)]">{headline}</div>
      {subline && <div className="mt-1 text-[length:clamp(0.75rem,1.5cqw,1.2rem)] text-muted-foreground">{subline}</div>}
      <div className="mt-3 min-h-0 flex-1">
        {empty ? (
          <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">Upload a breakdown with this metric’s next value: paste rows on its web form, or send label and value lines.</div>
        ) : widget.template === "ranked" ? (
          <Ranked rows={b.rows} m={m} highlight={b.highlight?.label} sum={b.additive ? b.sum : null} onRowContext={onRowContext && b.period ? (l) => onRowContext(l, b.period!) : undefined} />
        ) : widget.template === "share" ? (
          <Share rows={b.rows} m={m} highlight={b.highlight?.label} sum={b.sum} onRowContext={onRowContext && b.period ? (l) => onRowContext(l, b.period!) : undefined} />
        ) : widget.template === "pictogram" ? (
          <Pictogram rows={b.rows} highlight={b.highlight} sum={b.sum} />
        ) : (
          <StoryLine widget={widget} data={data} m={m} />
        )}
      </div>
      <div className="mt-2 truncate text-[length:clamp(11px,1.1cqw,15px)] leading-snug text-muted-foreground">{source}</div>
    </div>
  );
}

function Flag({ label }: { label: string }) {
  const code = countryCode(label);
  if (!code) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/flags/${code}.svg`} alt="" className="h-3 w-4 shrink-0 rounded-[2px] object-cover shadow-[0_0_0_0.5px_var(--color-rule-2)]" />;
}

function Ranked({ rows, m, highlight, sum, onRowContext, annotations }: { rows: BreakdownRow[]; m: Metric; highlight?: string; sum: number | null; onRowContext?: (label: string) => void; annotations?: Annotation[] }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  // Annotations attach to rows: a ring outlines the row, a callout or note follows its value.
  const marks = new Map<string, Annotation[]>();
  for (const a of annotations ?? []) {
    const t = resolveAnchor(rows, a.anchor);
    if (t) marks.set(t.label, [...(marks.get(t.label) ?? []), a]);
  }
  return (
    <ol className="flex h-full flex-col justify-center gap-1.5" aria-label={`${m.name}, largest first`}>
      {rows.slice(0, 12).map((r) => {
        const on = r.label === highlight;
        return (
          <li key={r.label} className={cn("grid grid-cols-[minmax(0,7rem)_minmax(3rem,1fr)_auto] items-center gap-2 rounded-[4px] text-xs", marks.get(r.label)?.some((a) => a.kind === "ring") && "outline-2 outline-offset-2 outline-[var(--color-accent-2)]")} onContextMenu={onRowContext ? () => onRowContext(r.label) : undefined}>
            <span className={cn("flex min-w-0 items-center gap-1.5", on && "font-semibold")}><Flag label={r.label} /><span className="truncate">{r.label}</span></span>
            <span className="h-4 rounded-r-[3px]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: on ? "var(--color-data)" : "var(--color-rule-2)" }} />
            <span className={cn("fig text-right", on && "font-semibold")}>
              {compactValue(m, r.value)}
              {sum ? <span className="ml-1.5 text-muted-foreground">{pct(r.value, sum)}%</span> : null}
            </span>
            {marks.get(r.label)?.filter((a) => a.text && a.kind !== "ring").map((a, i) => (
              <span key={i} className={cn("col-span-3 -mt-1 pl-[7.5rem] text-[11px]", a.kind === "callout" ? "font-semibold text-[var(--color-accent-2)]" : "text-muted-foreground")}>{a.kind === "callout" && a.arrow !== false ? "↑ " : ""}{a.text}</span>
            ))}
          </li>
        );
      })}
    </ol>
  );
}

function Share({ rows, m, highlight, sum, onRowContext }: { rows: BreakdownRow[]; m: Metric; highlight?: string; sum: number; onRowContext?: (label: string) => void }) {
  const tones = ["var(--color-data)", "var(--color-data-2)", "var(--color-data-3)", "var(--color-data-4)", "var(--color-rule)"];
  const ordered = [...rows].sort((a, b) => (a.label === highlight ? -1 : b.label === highlight ? 1 : b.value - a.value));
  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <div className="flex h-8 w-full overflow-hidden rounded-[4px]" role="img" aria-label={ordered.map((r) => `${r.label} ${pct(r.value, sum)} %`).join(", ")}>
        {ordered.map((r, i) => <div key={r.label} style={{ width: `${(r.value / (sum || 1)) * 100}%`, background: tones[Math.min(i, tones.length - 1)] }} />)}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {ordered.map((r, i) => (
          <li key={r.label} className={cn("flex items-center gap-1.5", r.label === highlight && "font-semibold")} onContextMenu={onRowContext ? () => onRowContext(r.label) : undefined}>
            <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: tones[Math.min(i, tones.length - 1)] }} />
            <Flag label={r.label} />
            <span className="truncate">{r.label}</span>
            <span className="fig ml-auto">{pct(r.value, sum)} %</span>
          </li>
        ))}
      </ul>
      <p className="sr-only">{m.name} total {formatValue(m, sum)}</p>
    </div>
  );
}

function Pictogram({ rows, highlight, sum }: { rows: BreakdownRow[]; highlight: BreakdownRow | null; sum: number }) {
  const n = highlight ? Math.round((highlight.value / (sum || 1)) * 10) : 0;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="grid grid-cols-5 gap-x-2 gap-y-1" role="img" aria-label={`${n} in 10`}>
        {Array.from({ length: 10 }, (_, i) => (
          <User key={i} aria-hidden className="size-8" strokeWidth={1.75} style={{ color: i < n ? "var(--color-data)" : "var(--color-rule-2)", fill: i < n ? "var(--color-data)" : "none" }} />
        ))}
      </div>
      <div className="text-center text-xs text-muted-foreground">
        {highlight?.label} <span className="fig text-foreground">{pct(highlight?.value ?? 0, sum)} %</span>, the rest {rows.length - 1} others
      </div>
    </div>
  );
}

/** The trend, drawn with Observable Plot, with callouts at chosen periods. */
function StoryLine({ widget, data, m }: { widget: W; data: CanvasData; m: Metric }) {
  const box = useRef<HTMLDivElement>(null);
  const pts = (data.series[m.slug] ?? []).slice(-(widget.settings.window ?? 12)).map((p) => ({ date: new Date(p.period), value: p.value, period: p.period }));
  // A callout from a template follows a rule (highest, latest, …) instead of a fixed period.
  const items = pts.map((p, i) => ({ ...p, label: p.period, delta: i ? p.value - pts[i - 1].value : undefined }));
  const callouts = (widget.settings.callouts ?? [])
    .map((c) => ({ ...c, point: c.rule ? resolveAnchor(items, { type: "rule", rule: c.rule }) : pts.find((p) => p.period === c.period) }))
    .filter((c) => c.point);
  useEffect(() => {
    const el = box.current;
    if (!el || pts.length < 2) return;
    const draw = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 40 || height < 40) return;
      const last = pts[pts.length - 1];
      const chart = Plot.plot({
        width,
        height,
        marginLeft: 8,
        marginRight: 56,
        marginTop: 24,
        marginBottom: 24,
        style: { fontFamily: "var(--font-body)", fontSize: "clamp(11px, 1.2cqw, 17px)", color: "var(--color-muted)", background: "transparent" },
        x: { type: "utc", ticks: 4, tickFormat: (d: Date) => periodLabel(d.toISOString().slice(0, 10), m.period, JANUARY, true), label: null },
        y: { axis: null, nice: true, zero: false },
        marks: [
          Plot.ruleY([Math.min(...pts.map((p) => p.value))], { stroke: "var(--color-rule)" }),
          Plot.lineY(pts, { x: "date", y: "value", stroke: "var(--color-data)", strokeWidth: 2, curve: "monotone-x" }),
          Plot.dot([last], { x: "date", y: "value", fill: "var(--color-data)", r: 3.5 }),
          Plot.text([last], { x: "date", y: "value", text: (d) => compactValue(m, d.value), dx: 8, textAnchor: "start", fill: "var(--color-print)", fontWeight: 600 }),
          Plot.ruleX(callouts, { x: (c) => c.point!.date, stroke: "var(--color-muted)", strokeDasharray: "2 3" }),
          Plot.dot(callouts, { x: (c) => c.point!.date, y: (c) => c.point!.value, r: 4, fill: "var(--color-cotton)", stroke: "var(--color-data)" }),
          Plot.text(callouts, { x: (c) => c.point!.date, frameAnchor: "top", text: "text", dy: -14, lineWidth: 14, fill: "var(--color-print)", fontWeight: 500 }),
        ],
      });
      el.replaceChildren(chart);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [JSON.stringify(pts.map((p) => [p.period, p.value])), JSON.stringify(callouts.map((c) => [c.point?.period, c.text])), m.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={box} className="h-full w-full" role="img" aria-label={`${m.name} over time${callouts.length ? `, ${callouts.map((c) => c.text).join("; ")}` : ""}`} />;
}

/** A composed story: kicker, headline, subline, the panels, footnotes and source (GLOSSARY: Finding, Panel). */
function ComposedStory({ widget, data, headline, subline, source }: { widget: W; data: CanvasData; headline: string; subline: string; source: string }) {
  const s = widget.settings;
  const panels = s.panels ?? [];
  const single = (panel: Panel, m: Metric) => {
    // On a line, annotations become callouts at the periods their anchors resolve to.
    const pts = (data.series[m.slug] ?? []).slice(-(panel.periods ?? s.window ?? 12)).map((p) => ({ label: p.period, period: p.period, value: p.value }));
    const lineCallouts = (panel.annotations ?? []).flatMap((a) => { const t = resolveAnchor(pts, a.anchor); return t && a.text ? [{ period: t.period, text: a.text }] : []; });
    return { template: (panel.type === "line" ? "story-line" : panel.type) as W["template"], metric_ids: [m.id], settings: { ...s, panels: undefined, period: panel.bridge?.period ?? s.period, window: panel.periods ?? s.window, callouts: [...(s.callouts ?? []), ...lineCallouts] } };
  };
  return (
    <div className="flex h-full flex-col">
      {s.kicker && <div className="mb-1 text-[length:clamp(0.75rem,1.3cqw,1.05rem)] font-medium text-[var(--color-accent-2)]">{s.kicker}</div>}
      <div className="text-[length:clamp(var(--text-xl),3.6cqw,3.2rem)] leading-tight font-semibold tracking-[-0.02em] text-[var(--color-print)] font-[family-name:var(--font-heading)]">{headline}</div>
      {subline && <div className="mt-1 text-[length:clamp(0.875rem,1.6cqw,1.3rem)] text-muted-foreground">{subline}</div>}
      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-4">
        {panels.length === 0 && <p className="m-auto text-xs text-muted-foreground">Edit the story to add a panel: period bars, a bridge, ranked bars or a line.</p>}
        {panels.map((panel, i) => (
          <div key={i} className="min-h-0 flex-1">
            <PanelView
              panel={panel}
              data={data}
              render={(m, domain) =>
                panel.type === "period-bars" ? <PeriodBars m={m} data={data} panel={panel} domain={domain} />
                : panel.type === "bridge" ? <Bridge m={m} data={data} panel={panel} />
                : panel.type === "ranked" ? <Ranked rows={storyBreakdown(single(panel, m), data, m).rows} m={m} highlight={storyBreakdown(single(panel, m), data, m).highlight?.label} sum={storyBreakdown(single(panel, m), data, m).additive ? storyBreakdown(single(panel, m), data, m).sum : null} annotations={panel.annotations} />
                : panel.type === "share" ? <Share rows={storyBreakdown(single(panel, m), data, m).rows} m={m} highlight={storyBreakdown(single(panel, m), data, m).highlight?.label} sum={storyBreakdown(single(panel, m), data, m).sum} />
                : panel.type === "pictogram" ? <Pictogram rows={storyBreakdown(single(panel, m), data, m).rows} highlight={storyBreakdown(single(panel, m), data, m).highlight} sum={storyBreakdown(single(panel, m), data, m).sum} />
                : <StoryLine widget={single(panel, m)} data={data} m={m} />
              }
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t border-border pt-2 text-[length:clamp(11px,1.1cqw,15px)] leading-snug text-muted-foreground">
        {s.footnote && <span className="max-w-[70%]">{s.footnote}</span>}
        <span className="ml-auto">{source}</span>
      </div>
    </div>
  );
}
