"use client";
// Edits the panels of a composed Story (GLOSSARY: Panel, Measure, Bridge).
import { Plus, Trash2 } from "lucide-react";
import { isArchived } from "@ziffr/core/metric-row";
import { Input } from "@/components/ui/input";
import { useSeriesReady } from "@/canvas/series-store";
import { MEASURE_LABEL } from "@/views/story-panels";
import type { Anchor, Annotation, CanvasData, MeasureId, Panel, PanelType } from "@ziffr/core/types";
import { periodLabel } from "@ziffr/core/periods";

const TYPES: { id: PanelType; label: string }[] = [
  { id: "period-bars", label: "Period bars" },
  { id: "bridge", label: "Bridge" },
  { id: "line", label: "Annotated line" },
  { id: "ranked", label: "Ranked bars (breakdown)" },
  { id: "share", label: "Part of the whole (breakdown)" },
  { id: "pictogram", label: "7 in 10 (breakdown)" },
];
const select = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-xs";

export function PanelEditor({ panels, data, onChange }: { panels: Panel[]; data: CanvasData; onChange: (p: Panel[]) => void }) {
  // A Metric ticked here may not have been sent with the page: its periods and values are fetched (ticket #125).
  useSeriesReady([...new Set(panels.flatMap((p) => p.metricIds))], data);
  const set = (i: number, patch: Partial<Panel>) => onChange(panels.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-3">
      {panels.map((p, i) => {
        const m = data.metrics.find((x) => x.id === p.metricIds[0]);
        const periods = m ? Object.keys(data.breakdowns[m.id] ?? {}).sort().reverse() : [];
        const timeSeries = p.type === "period-bars" || p.type === "line";
        return (
          <fieldset key={i} className="space-y-2 rounded-[var(--radius-input)] border border-border p-2.5">
            <legend className="sr-only">Panel {i + 1}</legend>
            <div className="flex gap-1.5">
              <select aria-label="Panel type" value={p.type} onChange={(e) => set(i, { type: e.target.value as PanelType })} className={select}>
                {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <button type="button" aria-label="Remove panel" onClick={() => onChange(panels.filter((_, j) => j !== i))} className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted"><Trash2 className="size-4" /></button>
            </div>
            <details className="text-xs" open={p.metricIds.length === 0}>
              <summary className="cursor-pointer text-muted-foreground">
                {p.metricIds.length ? p.metricIds.map((id) => data.metrics.find((x) => x.id === id)?.name).join(", ") : "Choose metrics"}
                {p.metricIds.length > 1 && " (small multiples)"}
              </summary>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                {/* An Archived Metric is offered only while the panel shows it, so it can be taken out. */}
                {data.metrics.filter((x) => !isArchived(x) || p.metricIds.includes(x.id)).map((x) => (
                  <label key={x.id} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={p.metricIds.includes(x.id)} onChange={(e) => set(i, { metricIds: e.target.checked ? [...p.metricIds, x.id] : p.metricIds.filter((id) => id !== x.id) })} className="size-3.5 accent-[var(--color-ink)]" />
                    {x.name}
                  </label>
                ))}
              </div>
            </details>
            {timeSeries && (
              <div className="grid grid-cols-2 gap-1.5">
                <select aria-label="Measure" value={p.measure ?? "value"} onChange={(e) => set(i, { measure: e.target.value as MeasureId })} className={select}>
                  {(Object.keys(MEASURE_LABEL) as MeasureId[]).map((k) => <option key={k} value={k}>{MEASURE_LABEL[k]}</option>)}
                </select>
                <Input aria-label="Periods" type="number" min={2} max={36} value={p.periods ?? (p.measure && p.measure !== "value" ? 6 : 12)} onChange={(e) => set(i, { periods: Number(e.target.value) })} className="h-9 text-xs" />
              </div>
            )}
            {p.type === "period-bars" && (
              <div className="grid grid-cols-2 gap-1.5">
                <select aria-label="Highlight" value={p.highlight ?? "last"} onChange={(e) => set(i, { highlight: e.target.value })} className={select}>
                  <option value="last">Highlight the last period</option>
                  <option value="projection">Highlight projections</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={p.projections !== false} onChange={(e) => set(i, { projections: e.target.checked })} className="size-3.5 accent-[var(--color-ink)]" /> Include projections</label>
                {p.metricIds.length > 1 && <label className="col-span-2 flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!p.sharedScale} onChange={(e) => set(i, { sharedScale: e.target.checked })} className="size-3.5 accent-[var(--color-ink)]" /> One scale for all metrics</label>}
              </div>
            )}
            {p.type === "bridge" && (
              <div className="grid grid-cols-2 gap-1.5">
                <select aria-label="Bridge" value={p.bridge?.mode ?? "rows"} onChange={(e) => set(i, { bridge: { ...p.bridge, mode: e.target.value as "rows" | "variance" } })} className={select}>
                  <option value="rows">Rows of one breakdown</option>
                  <option value="variance">Change between two periods</option>
                </select>
                <select aria-label="Period" value={p.bridge?.period ?? ""} onChange={(e) => set(i, { bridge: { mode: p.bridge?.mode ?? "rows", ...p.bridge, period: e.target.value || null } })} className={select}>
                  <option value="">Latest breakdown</option>
                  {m && periods.map((x) => <option key={x} value={x}>{periodLabel(x, m.period, data.yearStart, true)}</option>)}
                </select>
                {p.bridge?.mode === "variance" && (
                  <select aria-label="From" value={p.bridge?.from ?? ""} onChange={(e) => set(i, { bridge: { mode: "variance", ...p.bridge, from: e.target.value || null } })} className={`${select} col-span-2`}>
                    <option value="">From the breakdown before</option>
                    {m && periods.map((x) => <option key={x} value={x}>From {periodLabel(x, m.period, data.yearStart, true)}</option>)}
                  </select>
                )}
              </div>
            )}
            {(["period-bars", "bridge", "ranked", "line"] as PanelType[]).includes(p.type) && m && (
              <Annotations
                value={p.annotations ?? []}
                onChange={(a) => set(i, { annotations: a })}
                periods={(data.series[m.slug] ?? []).slice(-24).map((x) => x.period).reverse()}
                rows={[...new Set(Object.values(data.breakdowns[m.id] ?? {}).flat().map((r) => r.label))]}
                bridge={p.type === "bridge"}
                labelFor={(x) => periodLabel(x, m.period, data.yearStart, true)}
              />
            )}
            {(p.type === "period-bars" || p.type === "bridge") && (
              <div className="grid grid-cols-2 gap-1.5">
                <select aria-label="Reference line" value={p.refLine?.kind ?? ""} onChange={(e) => set(i, { refLine: e.target.value ? { kind: e.target.value as "target" | "constant" | "average", value: p.refLine?.value, label: p.refLine?.label } : null })} className={select}>
                  <option value="">No reference line</option>
                  <option value="target">Target</option>
                  <option value="average">Average</option>
                  <option value="constant">A fixed value</option>
                </select>
                {p.refLine?.kind === "constant" && <Input aria-label="Reference value" type="number" step="any" value={p.refLine.value ?? ""} onChange={(e) => set(i, { refLine: { kind: "constant", label: p.refLine?.label, value: Number(e.target.value) } })} className="h-9 text-xs" />}
              </div>
            )}
          </fieldset>
        );
      })}
      <button type="button" onClick={() => onChange([...panels, { type: "period-bars", metricIds: panels.at(-1)?.metricIds ?? [], measure: "pct-yoy", periods: 6, highlight: "last" }])} className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-input)] px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
        <Plus aria-hidden className="size-3.5" /> Add panel
      </button>
    </div>
  );
}

const RULES: { id: Extract<Anchor, { type: "rule" }>["rule"]; label: string }[] = [
  { id: "max", label: "the highest" }, { id: "min", label: "the lowest" }, { id: "last", label: "the last" }, { id: "first", label: "the first" }, { id: "largest-step", label: "the largest step" },
];

/** Annotations attach to what they are about: a rule, a period or a row (GLOSSARY: Annotation). */
function Annotations({ value, onChange, periods, rows, bridge, labelFor }: { value: Annotation[]; onChange: (a: Annotation[]) => void; periods: string[]; rows: string[]; bridge: boolean; labelFor: (p: string) => string }) {
  const set = (i: number, patch: Partial<Annotation>) => onChange(value.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const anchorKey = (a: Anchor) => (a.type === "rule" ? `rule:${a.rule}` : a.type === "period" ? `period:${a.period}` : `row:${a.label}`);
  const parseAnchor = (k: string): Anchor => {
    const [t, ...rest] = k.split(":");
    const v = rest.join(":");
    return t === "rule" ? { type: "rule", rule: v as never } : t === "period" ? { type: "period", period: v } : { type: "row", label: v };
  };
  return (
    <div className="space-y-1.5">
      {value.map((a, i) => (
        <div key={i} className="space-y-1 rounded-[var(--radius-input)] bg-[var(--color-paper-2)] p-1.5">
          <div className="grid grid-cols-[6rem_1fr_auto] gap-1">
            <select aria-label="Kind" value={a.kind} onChange={(e) => set(i, { kind: e.target.value as Annotation["kind"] })} className={select}>
              <option value="callout">Callout</option>
              <option value="ring">Ring</option>
              <option value="note">Note</option>
            </select>
            <select aria-label="Attached to" value={anchorKey(a.anchor)} onChange={(e) => set(i, { anchor: parseAnchor(e.target.value) })} className={select}>
              <optgroup label="Follows the data">
                {RULES.filter((r) => bridge || r.id !== "largest-step").map((r) => <option key={r.id} value={`rule:${r.id}`}>{r.label}</option>)}
              </optgroup>
              {!bridge && periods.length > 0 && <optgroup label="A period">{periods.map((p) => <option key={p} value={`period:${p}`}>{labelFor(p)}</option>)}</optgroup>}
              {rows.length > 0 && <optgroup label="A row">{rows.map((r) => <option key={r} value={`row:${r}`}>{r}</option>)}</optgroup>}
            </select>
            <button type="button" aria-label="Remove annotation" onClick={() => onChange(value.filter((_, j) => j !== i))} className="flex size-9 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted"><Trash2 className="size-3.5" /></button>
          </div>
          {a.kind !== "ring" && (
            <div className="flex items-center gap-1.5">
              <Input aria-label="Text" value={a.text ?? ""} placeholder="e.g. Booking error, corrected" onChange={(e) => set(i, { text: e.target.value })} className="h-8 text-xs" />
              {a.kind === "callout" && <label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" checked={a.arrow !== false} onChange={(e) => set(i, { arrow: e.target.checked })} className="size-3.5 accent-[var(--color-ink)]" /> Arrow</label>}
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, { kind: "callout", anchor: { type: "rule", rule: bridge ? "largest-step" : "max" }, text: "", arrow: true }])} className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-input)] px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
        <Plus aria-hidden className="size-3.5" /> Add annotation
      </button>
    </div>
  );
}
