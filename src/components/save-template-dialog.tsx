"use client";
// "Save as template…": a widget becomes a team template (GLOSSARY: Widget Template). Its metrics become
// slots; notes tied to one period or row can follow a rule instead, or are left out.
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveTemplate } from "@/app/template-actions";
import { RULES_FOR, specifics, toTemplate, type Choices } from "@/lib/team-templates";
import { periodLabel } from "@/lib/format";
import type { CanvasData, Widget } from "@/lib/types";

export function SaveTemplateDialog({ widget, data, onClose }: { widget: Widget; data: CanvasData; onClose: () => void }) {
  const mine = data.templates.filter((t) => t.owner_id === data.viewer);
  const items = useMemo(() => specifics(widget), [widget]);
  const [choices, setChoices] = useState<Choices>(() => Object.fromEntries(items.map((x) => [x.key, RULES_FOR[x.kind][0].rule])));
  const [name, setName] = useState(widget.title ?? widget.settings.kicker ?? "");
  const grain = data.metrics.find((m) => m.id === widget.metric_ids[0])?.period ?? "month";
  const [description, setDescription] = useState("");
  const [replaceId, setReplaceId] = useState<number | null>(null);
  const preview = useMemo(() => toTemplate(widget, data.metrics, choices), [widget, data.metrics, choices]);
  const [labels, setLabels] = useState<string[]>(() => preview.slots.map((s) => s.label));
  const [pending, start] = useTransition();

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogTitle>Save as template</DialogTitle>
        <DialogDescription>Everyone on the team can use it with their own metrics. Only you can change it.</DialogDescription>
        <form
          className="space-y-4 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              try {
                await saveTemplate({ widgetId: widget.id, name, description, labels, choices, replaceId });
                toast.success(replaceId ? "Template replaced" : "Template saved", { description: "Find it under Templates in the Pool, or in Change visualization." });
                onClose();
              } catch (err) {
                toast.error("Template not saved", { description: (err as Error).message });
              }
            });
          }}
        >
          {mine.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Save as</span>
              <select value={replaceId ?? ""} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : null; setReplaceId(id); const t = mine.find((x) => x.id === id); if (t) { setName(t.name); setDescription(t.description); if (t.slots.length === preview.slots.length) setLabels(t.slots.map((x) => x.label)); } }} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2">
                <option value="">A new template</option>
                {mine.map((t) => <option key={t.id} value={t.id}>Replace “{t.name}” (keeps its versions)</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Year-on-year story" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">What it is for</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line, shown when someone uses it" />
          </label>

          <div>
            <div className="mb-1 text-xs font-medium">Slots</div>
            <p className="mb-2 text-xs text-muted-foreground">Each metric becomes a slot that is filled in when the template is used. Its name in the text becomes {"{metric}"}.</p>
            <ul className="space-y-1.5">
              {preview.slots.map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Input aria-label={`Slot ${i + 1} name`} value={labels[i] ?? ""} onChange={(e) => setLabels(labels.map((l, j) => (j === i ? e.target.value : l)))} className="max-w-48" />
                  <span className="text-xs text-muted-foreground">{s.multiple ? "one or more" : "one metric"}, now {s.example}</span>
                </li>
              ))}
            </ul>
          </div>

          {items.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium">Notes tied to one period or row</div>
              <p className="mb-2 text-xs text-muted-foreground">Another metric will not have the same period or row. Let each note follow a rule, or leave it out.</p>
              <ul className="space-y-1.5">
                {items.map((x) => (
                  <li key={x.key} className="grid grid-cols-[minmax(0,1fr)_11rem] items-center gap-2">
                    <span className="truncate" title={x.text}>“{x.text}” <span className="text-xs text-muted-foreground">at {x.kind === "period" ? periodLabel(x.at, grain, true) : x.at}</span></span>
                    <select aria-label={`Rule for ${x.text}`} value={choices[x.key]} onChange={(e) => setChoices({ ...choices, [x.key]: e.target.value as Choices[string] })} className="h-9 rounded-[var(--radius-input)] border border-input bg-card px-2">
                      {RULES_FOR[x.kind].map((r) => <option key={r.rule} value={r.rule}>{r.label}</option>)}
                      <option value="drop">Leave out</option>
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.notices.length > 0 && (
            <ul className="space-y-0.5 rounded-[var(--radius-input)] bg-muted p-2.5 text-xs text-muted-foreground">
              {preview.notices.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending || !name.trim()}>{replaceId ? "Replace template" : "Save template"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
