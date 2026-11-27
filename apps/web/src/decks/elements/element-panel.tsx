"use client";
// The side panel for the selected Slide Element in the deck editor (GLOSSARY: Slide Element; spec 0057): its words,
// colours, type and Metrics. Every change is held to the element's own schema before it reaches the slide; the core
// checks the deck again when it is saved, and only Metrics the person sees are offered, none chosen for them.
import { useValue, type Editor } from "tldraw";
import { checkedElement, elementSlots, SLIDE_ELEMENT_LIMITS, SLIDE_TONES, type SlideElement, type SlideTone } from "@ziffr/core/slide-element";
import { PICK_METRIC } from "@ziffr/core/slide-figures";
import type { CanvasData, WidgetSettings } from "@ziffr/core/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { WidgetShape } from "../widget-shape";
import { metricsAfter, pickMetric } from "./element-add";

const TONE_NAMES: Record<SlideTone, string> = { ink: "Ink", muted: "Muted", rule: "Rule", surface: "Surface", canvas: "Canvas", band: "Band", accent: "Accent", soft: "Soft accent", cover: "Cover", "cover-text": "Cover text", "cover-accent": "Cover accent", good: "Good", bad: "Bad", data: "Data" };
const toneOptions = SLIDE_TONES.map((t) => [t, TONE_NAMES[t]] as const);

type Field =
  | { type: "text"; key: string; label: string; hint?: string; long?: boolean }
  | { type: "number"; key: string; label: string; min: number; max: number; hint?: string }
  | { type: "flag"; key: string; label: string }
  | { type: "choice"; key: string; label: string; options: readonly (readonly [string | number, string])[]; unset?: string };

const text = (key: string, label: string, hint?: string): Field => ({ type: "text", key, label, hint });
const flag = (key: string, label: string): Field => ({ type: "flag", key, label });
// A whole line of words, longer than a label may be.
const line = (key: string, label: string): Field => ({ type: "text", key, label, long: true });
const tones = (key: string, label: string, unset: string): Field => ({ type: "choice", key, label, options: toneOptions, unset });
const align = [["start", "Left"], ["middle", "Centre"], ["end", "Right"]] as const;

/** The settings each kind of element offers, besides its Metrics and its words or rows. */
const FIELDS: Record<SlideElement["kind"], Field[]> = {
  words: [
    text("lead", "Lead-in", "Shown first, in its own colour and weight."), tones("leadTone", "Lead-in colour", "As the words"),
    { type: "choice", key: "font", label: "Font", options: [["heading", "Headline"], ["body", "Text"]], unset: "Text" },
    { type: "number", key: "size", label: "Size", min: SLIDE_ELEMENT_LIMITS.minSize, max: SLIDE_ELEMENT_LIMITS.maxSize },
    { type: "choice", key: "weight", label: "Weight", options: [[400, "Regular"], [500, "Medium"], [600, "Semibold"], [700, "Bold"]], unset: "Automatic" },
    tones("tone", "Colour", "Ink"), { type: "choice", key: "align", label: "Align", options: align, unset: "Left" },
    flag("caps", "In capitals"), flag("foot", "Footer line: shows the deck's footer"),
    line("empty", "While a value is missing"),
  ],
  box: [tones("fill", "Fill", "None"), tones("edge", "Edge", "None"), flag("dashed", "Dashed edge")],
  figure: [text("label", "Label", "Empty shows the Metric's name."), line("note", "Line under the value"), flag("signal", "Colour that line by good or bad"), flag("strong", "Emphasised, on the cover colour")],
  columns: [
    line("title", "Title"), flag("part", "Second Metric fills part of each column"), flag("reference", "Last Metric draws a reference line"),
    text("partLabel", "Legend of the filled part"), text("restLabel", "Legend of the rest"), text("referenceLabel", "Label of the line"),
    { type: "number", key: "periods", label: "Periods", min: 1, max: SLIDE_ELEMENT_LIMITS.periods, hint: "Empty shows the quarter so far." },
  ],
  "gap-table": [flag("total", "One Total: a row for each Metric it adds up, against its target"), line("headline", "Headline above"), text("rowLabel", "Heading of the rows", "Such as Salesperson."), text("targetLabel", "Heading of a Total's targets", "Such as Quota."), line("gapLabel", "Heading of the difference"), text("lead", "Closing line: lead-in"), line("note", "Closing line")],
  "metric-table": [{ type: "number", key: "periods", label: "Periods in the trend", min: 2, max: SLIDE_ELEMENT_LIMITS.periods }],
  definitions: [],
  list: [text("title", "Heading")],
  logo: [text("text", "Words without a logo"), { type: "choice", key: "size", label: "Size", options: [["s", "Small"], ["m", "Large"]], unset: "Small" }, { type: "choice", key: "align", label: "Align", options: [["start", "Left"], ["end", "Right"]], unset: "Right" }, tones("tone", "Colour", "Muted")],
  art: [],
};

const NAMES: Record<SlideElement["kind"], string> = { words: "Words", box: "Box", figure: "Figure", columns: "Column chart", "gap-table": "Gap table", "metric-table": "Metric table", definitions: "Definitions", list: "Numbered list", logo: "Logo place", art: "Cover art" };

/** What each Slot of an element is, in words. */
function slotName(e: SlideElement, i: number): string {
  if (e.kind === "columns") return i === 0 ? "Columns" : e.part && i === 1 ? "Filled part" : "Reference line";
  if (e.kind === "gap-table") return e.total ? "Total" : i === 0 ? "Metric" : "Compared with";
  return `Metric ${i + 1}`;
}

const select = "mt-1 h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm";

function Control({ field, element, set }: { field: Field; element: Record<string, unknown>; set: (key: string, value: unknown) => void }) {
  const value = element[field.key];
  if (field.type === "flag")
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(field.key, e.target.checked || undefined)} className="size-4 accent-[var(--color-ink)]" />
        {field.label}
      </label>
    );
  return (
    <label className="block text-sm">
      <span className="font-medium">{field.label}</span>
      {field.type === "choice" ? (
        <select value={String(value ?? "")} onChange={(e) => set(field.key, field.options.find(([v]) => String(v) === e.target.value)?.[0])} className={select}>
          {field.unset !== undefined && <option value="">{field.unset}</option>}
          {field.options.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
        </select>
      ) : field.type === "number" ? (
        <Input type="number" min={field.min} max={field.max} value={typeof value === "number" ? value : ""} onChange={(e) => { const n = Number(e.target.value); set(field.key, e.target.value === "" ? undefined : Math.min(field.max, Math.max(field.min, Math.round(n)))); }} className="mt-1" />
      ) : (
        <Input value={String(value ?? "")} maxLength={field.long ? SLIDE_ELEMENT_LIMITS.words : SLIDE_ELEMENT_LIMITS.label} onChange={(e) => set(field.key, e.target.value || undefined)} className="mt-1" />
      )}
      {"hint" in field && field.hint && <span className="mt-1 block text-xs text-muted-foreground">{field.hint}</span>}
    </label>
  );
}

const rowsText = (e: Extract<SlideElement, { kind: "list" }>) => e.items.map((i) => (i.note ? `${i.text} | ${i.note}` : i.text)).join("\n");
const readRows = (value: string) => value.split("\n").slice(0, SLIDE_ELEMENT_LIMITS.items).map((line) => {
  const [t, ...rest] = line.split("|");
  const note = rest.join("|").trim();
  return { text: t.replace(/\s+$/, "").slice(0, SLIDE_ELEMENT_LIMITS.label), ...(note ? { note: note.slice(0, SLIDE_ELEMENT_LIMITS.label) } : {}) };
});

/** An element's Metrics, a choice for each: a Slot nobody filled reads "Pick a Metric", and one more is added by
 * choosing it. Only Metrics the person sees are offered, and none is ever chosen for them. */
export function ElementMetrics({ element, ids, metrics: all, onChange }: { element: SlideElement; ids: number[]; metrics: { id: number; name: string; total?: unknown }[]; onChange: (ids: number[]) => void }) {
  const { min, max } = elementSlots(element);
  // A gap table of a Total reads nothing else.
  const metrics = element.kind === "gap-table" && element.total ? all.filter((m) => m.total) : all;
  if (max === 0) return null;
  const pick = (slot: number, value: string) => onChange(pickMetric(element, ids, slot, Number(value)));
  const unused = metrics.filter((m) => !ids.includes(m.id));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Metrics</legend>
      {Array.from({ length: Math.max(min, ids.length) }, (_, i) => (
        <label key={i} className="block text-xs text-muted-foreground">
          {slotName(element, i)}
          {/* Slots fill in order. */}
          <select value={ids[i] ?? ""} disabled={i > ids.length} onChange={(e) => pick(i, e.target.value)} className={select}>
            {i >= ids.length && <option value="">{PICK_METRIC}</option>}
            {i < ids.length && !metrics.some((m) => m.id === ids[i]) && <option value={ids[i]}>A Metric you cannot see</option>}
            {metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      ))}
      {ids.length >= min && ids.length < max && unused.length > 0 && (
        <select aria-label="Add a Metric" value="" onChange={(e) => pick(ids.length, e.target.value)} className={select}>
          <option value="">Add a Metric…</option>
          {unused.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      {ids.length > min && <Button variant="outline" onClick={() => onChange(ids.slice(0, -1))}>Remove last</Button>}
    </fieldset>
  );
}

/** The selected Slide Element's settings, beside the canvas; nothing when the selection is not one element. */
export function ElementPanel({ editor, data }: { editor: Editor; data: CanvasData }) {
  const shape = useValue("selected element", () => {
    const s = editor.getOnlySelectedShape();
    return s && s.type === "ziffr-widget" && (s as WidgetShape).props.template === "slide" ? (s as WidgetShape) : null;
  }, [editor]);
  if (!shape) return null;
  const settings = JSON.parse(shape.props.settings || "{}") as WidgetSettings;
  const element = settings.element;
  if (!element) return null;
  const ids = shape.props.metricIds;
  const save = (next: SlideElement, metrics: number[] = ids) => {
    // A change the format does not take (too long a line) is not applied; the field keeps what it had.
    try { checkedElement(next); } catch { return; }
    editor.updateShape<WidgetShape>({ id: shape.id, type: "ziffr-widget", props: { settings: JSON.stringify({ ...settings, element: next }), metricIds: metricsAfter(element, next, metrics) } });
  };
  const set = (key: string, value: unknown) => {
    const next = { ...element, [key]: value } as Record<string, unknown>;
    if (value === undefined) delete next[key];
    // A table turned to a Total keeps its Metric only where that is one.
    save(next as SlideElement, key === "total" && value && !data.metrics.find((m) => m.id === ids[0])?.total ? [] : ids);
  };
  return (
    <section aria-label={`${NAMES[element.kind]} settings`} className="stock space-y-3 rounded-[var(--radius-card)] p-3">
      <h2 className="text-sm font-semibold">{NAMES[element.kind]}</h2>
      {element.kind === "words" && (
        <label className="block text-sm">
          <span className="font-medium">Words</span>
          <Textarea rows={3} value={element.text.join("\n")} onChange={(e) => save({ ...element, text: e.target.value.split("\n").slice(0, SLIDE_ELEMENT_LIMITS.paragraphs) })} className="mt-1" />
          <span className="mt-1 block text-xs text-muted-foreground">{"Filled from the Metrics below: {latest}, {change}, {difference 1 2}, {left 1 2}, {gap 1 2}, {quarter}, {quarter week}, {weeks left}, {calculation note}, {slide}."}</span>
        </label>
      )}
      {element.kind === "list" && (
        <label className="block text-sm">
          <span className="font-medium">Rows</span>
          <Textarea rows={5} value={rowsText(element)} onChange={(e) => save({ ...element, items: readRows(e.target.value) })} className="mt-1" />
          <span className="mt-1 block text-xs text-muted-foreground">One row per line; text after | stands at the right.</span>
        </label>
      )}
      {/* Offered where there is a Total to pick, or the table is of one already. */}
      {FIELDS[element.kind].filter((f) => f.key !== "total" || data.metrics.some((m) => m.total) || (element.kind === "gap-table" && element.total)).map((f) => <Control key={f.key} field={f} element={element as unknown as Record<string, unknown>} set={set} />)}
      <ElementMetrics element={element} ids={ids} metrics={data.metrics} onChange={(next) => save(element, next)} />
    </section>
  );
}
