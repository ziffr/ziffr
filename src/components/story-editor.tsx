"use client";
// Edits a Story Widget's words and emphasis (GLOSSARY: Story Widget). Shared by dashboards and decks.
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { storyBreakdown, storyDefaults } from "@/views/story";
import { periodLabel } from "@/lib/format";
import type { CanvasData, Callout, Metric, Widget, WidgetSettings } from "@/lib/types";

type W = Pick<Widget, "template" | "metric_ids" | "settings">;

export function StoryEditor({ widget, data, m, onSave, saveLabel = "Apply" }: { widget: W; data: CanvasData; m: Metric; onSave: (settings: WidgetSettings) => void; saveLabel?: string }) {
  const [s, setS] = useState<WidgetSettings>(widget.settings);
  const d = storyDefaults({ ...widget, settings: s }, data, m);
  const b = storyBreakdown({ ...widget, settings: s }, data, m);
  const set = <K extends keyof WidgetSettings>(k: K, v: WidgetSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const series = data.series[m.slug] ?? [];
  const callouts = s.callouts ?? [];
  const isLine = widget.template === "story-line";

  return (
    <form
      className="space-y-3 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(s);
      }}
    >
      <div className="font-semibold">Story</div>
      <Labelled label="Headline" hint="State the finding. Leave empty to use the suggestion.">
        <Textarea rows={2} value={s.headline ?? ""} placeholder={d.headline} onChange={(e) => set("headline", e.target.value)} />
      </Labelled>
      <Labelled label="Subline">
        <Input value={s.subline ?? ""} placeholder={d.subline} onChange={(e) => set("subline", e.target.value)} />
      </Labelled>

      {!isLine && b.periods.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Labelled label="Breakdown of">
            <select value={s.period ?? ""} onChange={(e) => set("period", e.target.value || null)} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2">
              <option value="">Latest ({periodLabel(b.periods[b.periods.length - 1], m.period, true)})</option>
              {[...b.periods].reverse().map((p) => <option key={p} value={p}>{periodLabel(p, m.period, true)}</option>)}
            </select>
          </Labelled>
          <Labelled label="Highlight">
            <select value={s.highlight ?? ""} onChange={(e) => set("highlight", e.target.value || null)} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2">
              <option value="">Largest ({b.rows[0]?.label ?? "none"})</option>
              {b.rows.map((r) => <option key={r.label} value={r.label}>{r.label}</option>)}
            </select>
          </Labelled>
        </div>
      )}

      {isLine && (
        <Labelled label="Callouts" hint="A short note at a moment that matters.">
          <ul className="space-y-1.5">
            {callouts.map((c, i) => (
              <li key={i} className="flex gap-1.5">
                <select
                  aria-label="Period"
                  value={c.period}
                  onChange={(e) => set("callouts", callouts.map((x, j) => (j === i ? { ...x, period: e.target.value } : x)))}
                  className="h-9 w-24 shrink-0 rounded-[var(--radius-input)] border border-input bg-card px-1.5 text-xs"
                >
                  {[...series].reverse().slice(0, s.window ?? 12).map((p) => <option key={p.period} value={p.period}>{periodLabel(p.period, m.period, true)}</option>)}
                </select>
                <Input aria-label="Callout text" value={c.text} onChange={(e) => set("callouts", callouts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                <button type="button" aria-label="Remove callout" onClick={() => set("callouts", callouts.filter((_, j) => j !== i))} className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => set("callouts", [...callouts, { period: series[series.length - 1]?.period ?? "", text: "" } as Callout])}
            className="mt-1.5 inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-input)] px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus aria-hidden className="size-3.5" /> Add callout
          </button>
        </Labelled>
      )}

      <Labelled label="Source line">
        <Input value={s.source ?? ""} placeholder={d.source} onChange={(e) => set("source", e.target.value)} />
      </Labelled>
      <Button type="submit" className="w-full">{saveLabel}</Button>
    </form>
  );
}

function Labelled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
