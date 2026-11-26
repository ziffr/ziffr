"use client";
// Saving as a team template (GLOSSARY: Widget Template, Deck Template): a widget, a whole slide as a layout, or a deck. Its metrics
// become slots; notes tied to one period or row can follow a rule instead, or are left out. Drawn in the side panel (spec 0050).
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSlideLayout, saveTemplate } from "@/app/template-actions";
import { saveAsDeckTemplate } from "@/app/deck-workflow-template-actions";
import { deckSpecifics, RULES_FOR, slideSpecifics, specifics, toDeckTemplate, toSlideLayout, toTemplate, type Choices, type Specific } from "@ziffr/core/team-templates";
import type { CanvasData, Period, Slot, SlideShape, Widget } from "@ziffr/core/types";
import { periodLabel } from "@ziffr/core/periods";
import { SlideOverWindow } from "./slide-over-window";

type Submit = { name: string; description: string; labels: string[]; choices: Choices; replaceId: number | null };

export function SaveTemplateDialog({ widget, data, onClose }: { widget: Widget; data: CanvasData; onClose: () => void }) {
  const items = useMemo(() => specifics(widget), [widget]);
  return (
    <TemplateSaveDialog
      kind="widget"
      title="Save as template"
      data={data}
      items={items}
      grain={data.metrics.find((m) => m.id === widget.metric_ids[0])?.period ?? "month"}
      defaultName={widget.title ?? widget.settings.kicker ?? ""}
      preview={(choices) => toTemplate(widget, data.metrics, choices)}
      submit={(x) => saveTemplate({ widgetId: widget.id, ...x })}
      onClose={onClose}
    />
  );
}

/** "Save slide as layout…": every widget, text box and arrow on the slide. */
export function SaveSlideDialog({ deckId, shapes, data, note, onClose }: { deckId: number; shapes: SlideShape[]; data: CanvasData; /** What of the slide stays behind. */ note?: string; onClose: () => void }) {
  const items = useMemo(() => slideSpecifics(shapes), [shapes]);
  return (
    <TemplateSaveDialog
      kind="slide"
      title="Save slide as layout"
      note={note}
      data={data}
      items={items}
      grain="month"
      defaultName=""
      preview={(choices) => toSlideLayout(shapes, data.metrics, choices)}
      submit={(x) => saveSlideLayout({ deckId, shapes, ...x })}
      onClose={onClose}
    />
  );
}

/** "Save as Deck Template…": every slide of the deck, sharing one set of Slots (spec 0030). The Preview reads the
 * slides in the editor; the core saves the deck as stored. */
export function SaveDeckDialog({ deckId, slides, data, existing, note, onClose }: { deckId: number; slides: SlideShape[][]; data: CanvasData; existing: Mine[]; /** What of the deck stays behind. */ note?: string; onClose: () => void }) {
  const items = useMemo(() => deckSpecifics(slides), [slides]);
  return (
    <TemplateSaveDialog
      kind="deck"
      title="Save as Deck Template"
      note={note}
      data={data}
      items={items}
      grain="month"
      defaultName=""
      existing={existing}
      preview={(choices) => toDeckTemplate(slides, data.metrics, choices)}
      submit={(x) => saveAsDeckTemplate({ deckId, ...x })}
      onClose={onClose}
    />
  );
}

/** A template of the viewer's own that saving may replace. */
type Mine = { id: number; name: string; description: string; slots: Slot[] };
const NOUN = { widget: "template", slide: "layout", deck: "Deck Template" } as const;
const WHERE = { widget: "Find it under Templates in the Pool, or in Change view.", slide: "Find it under + Slide in any deck.", deck: "Find it under From a Deck Template on the Decks page." } as const;

type SaveProps = {
  kind: "widget" | "slide" | "deck";
  /** A sentence about what the template leaves out. */
  note?: string;
  /** The viewer's own templates of this kind; left out, the widget templates and layouts the canvas has. */
  existing?: Mine[];
  title: string;
  data: CanvasData;
  items: Specific[];
  grain: Period;
  defaultName: string;
  preview: (choices: Choices) => { slots: Slot[]; notices: string[] };
  submit: (x: Submit) => Promise<unknown>;
  onClose: () => void;
};

/** The window: opens the side panel with the form in it, and tells the screen when the panel is closed. */
function TemplateSaveDialog(props: SaveProps) {
  return (
    <SlideOverWindow title={props.title} description="Everyone on the team can use it with their own metrics. Only you can change it." onClose={props.onClose}>
      <TemplateSaveForm {...props} />
    </SlideOverWindow>
  );
}

function TemplateSaveForm({ kind, data, items, grain, defaultName, existing, note, preview: make, submit, onClose }: SaveProps) {
  const mine: Mine[] = existing ?? data.templates.filter((t) => t.owner_id === data.viewer && t.kind === kind);
  const [choices, setChoices] = useState<Choices>(() => Object.fromEntries(items.map((x) => [x.key, RULES_FOR[x.kind][0].rule])));
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [replaceId, setReplaceId] = useState<number | null>(null);
  const preview = useMemo(() => make(choices), [make, choices]);
  const [labels, setLabels] = useState<string[]>(() => preview.slots.map((s) => s.label));
  const [pending, start] = useTransition();
  const noun = NOUN[kind];
  const Noun = `${noun[0].toUpperCase()}${noun.slice(1)}`;

  return (
        <form
          className="space-y-4 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              try {
                unwrap(await submit({ name, description, labels, choices, replaceId }));
                toast.success(replaceId ? `${Noun} replaced` : `${Noun} saved`, { description: WHERE[kind] });
                onClose();
              } catch (err) {
                toast.error(`${Noun} not saved`, { description: shown(err) });
              }
            });
          }}
        >
          {note && <p role="note" className="rounded-[var(--radius-input)] border border-input bg-muted/40 p-2.5 text-xs">{note}</p>}
          {mine.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Save as</span>
              <select value={replaceId ?? ""} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : null; setReplaceId(id); const t = mine.find((x) => x.id === id); if (t) { setName(t.name); setDescription(t.description); if (t.slots.length === preview.slots.length) setLabels(t.slots.map((x) => x.label)); } }} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2">
                <option value="">A new {noun}</option>
                {mine.map((t) => <option key={t.id} value={t.id}>Replace “{t.name}” (keeps its versions)</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder={kind === "slide" ? "e.g. Monthly KPI slide" : kind === "deck" ? "e.g. Quarterly board meeting" : "e.g. Year-on-year Finding"} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">What it is for</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line, shown when someone uses it" />
          </label>

          <div>
            <div className="mb-1 text-xs font-medium">Slots</div>
            <p className="mb-2 text-xs text-muted-foreground">Each metric becomes a slot that is filled in when the {noun} is used. Its name in the text becomes {"{metric}"}.</p>
              {preview.slots.length === 0 && <p className="text-xs text-muted-foreground">No metrics on it: it is used as it is.</p>}
            <ul className="space-y-1.5">
              {preview.slots.map((s, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <Input aria-label={`Slot ${i + 1} name`} value={labels[i] ?? ""} onChange={(e) => setLabels(labels.map((l, j) => (j === i ? e.target.value : l)))} className="w-full" />
                  <span className="text-xs text-muted-foreground">{s.multiple ? "one or more" : "one metric"}, now {(s.exampleIds ?? []).map((id) => data.metrics.find((m) => m.id === id)?.name).filter(Boolean).join(", ")}</span>
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
                  <li key={x.key} className="space-y-1">
                    <span className="truncate" title={x.text}>“{x.text}” <span className="text-xs text-muted-foreground">at {x.kind === "period" ? periodLabel(x.at, grain, data.yearStart, true) : x.at}</span></span>
                    <select aria-label={`Rule for ${x.text}`} value={choices[x.key]} onChange={(e) => setChoices({ ...choices, [x.key]: e.target.value as Choices[string] })} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2">
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
            <Button type="submit" disabled={pending || !name.trim()}>{replaceId ? `Replace ${noun}` : `Save ${noun}`}</Button>
          </div>
        </form>
  );
}
