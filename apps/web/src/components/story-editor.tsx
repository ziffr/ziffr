"use client";
// Edits a Finding's words and emphasis (GLOSSARY: Finding). Shared by dashboards, stories and decks.
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { storyBreakdown, storyDefaults } from "@/views/story";
import { PanelEditor } from "@/components/panel-editor";
import { PlaceholderHints } from "@/components/placeholder-hints";
import { RULES_FOR } from "@ziffr/core/team-templates";
import type { AnchorRule, CanvasData, Callout, Metric, Widget, WidgetSettings } from "@ziffr/core/types";
import { periodLabel } from "@ziffr/core/periods";

type W = Pick<Widget, "template" | "metric_ids" | "settings">;

export function StoryEditor({ widget, data, m, onSave, saveLabel = "Apply" }: { widget: W; data: CanvasData; m: Metric; onSave: (settings: WidgetSettings) => void; saveLabel?: string }) {
  const [s, setS] = useState<WidgetSettings>(widget.settings);
  const d = storyDefaults({ ...widget, settings: s }, data, m);
  const b = storyBreakdown({ ...widget, settings: s }, data, m);
  const set = <K extends keyof WidgetSettings>(k: K, v: WidgetSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const series = data.series[m.slug] ?? [];
  const callouts = s.callouts ?? [];
  const isLine = widget.template === "story-line";
  const composed = widget.template === "story";

  return (
    <form
      className="space-y-3 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(s);
      }}
    >
      <div className="font-semibold">Finding</div>
      {composed && (
        <Labelled label="Kicker" hint="A short line above the headline, such as the topic and the period.">
          <Input value={s.kicker ?? ""} onChange={(e) => set("kicker", e.target.value)} />
        </Labelled>
      )}
      <Labelled label="Headline" hint="State the finding. Leave empty to use the suggestion. Words in braces fill themselves in, see below.">
        <Textarea rows={2} value={s.headline ?? ""} placeholder={d.headline} onChange={(e) => set("headline", e.target.value)} />
      </Labelled>
      <Labelled label="Subline">
        <Input value={s.subline ?? ""} placeholder={d.subline} onChange={(e) => set("subline", e.target.value)} />
      </Labelled>

      {composed && (
        <Labelled label="Panels">
          <PanelEditor panels={s.panels ?? []} data={data} onChange={(p) => set("panels", p)} />
        </Labelled>
      )}

      {!isLine && !composed && b.periods.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Labelled label="Breakdown of">
            <select value={s.period ?? ""} onChange={(e) => set("period", e.target.value || null)} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2">
              <option value="">Latest ({periodLabel(b.periods[b.periods.length - 1], m.period, data.yearStart, true)})</option>
              {[...b.periods].reverse().map((p) => <option key={p} value={p}>{periodLabel(p, m.period, data.yearStart, true)}</option>)}
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
                  aria-label="Where"
                  value={c.rule ? `rule:${c.rule}` : c.period}
                  onChange={(e) => {
                    const v = e.target.value;
                    set("callouts", callouts.map((x, j) => (j !== i ? x : v.startsWith("rule:") ? { ...x, period: "", rule: v.slice(5) as AnchorRule } : { text: x.text, period: v })));
                  }}
                  className="h-9 w-28 shrink-0 rounded-[var(--radius-input)] border border-input bg-card px-1.5 text-xs"
                >
                  <optgroup label="Follows the data">
                    {RULES_FOR.period.map((r) => <option key={r.rule} value={`rule:${r.rule}`}>{r.label}</option>)}
                  </optgroup>
                  <optgroup label="One period">
                    {[...series].reverse().slice(0, s.window ?? 12).map((p) => <option key={p.period} value={p.period}>{periodLabel(p.period, m.period, data.yearStart, true)}</option>)}
                  </optgroup>
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

      {composed && (
        <Labelled label="Footnotes">
          <Textarea rows={2} value={s.footnote ?? ""} onChange={(e) => set("footnote", e.target.value)} />
        </Labelled>
      )}
      <Labelled label="Source line">
        <Input value={s.source ?? ""} placeholder={d.source} onChange={(e) => set("source", e.target.value)} />
      </Labelled>
      <PlaceholderHints about="the Finding" />
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
