"use client";
// "Insert value" in the deck editor (GLOSSARY: Placeholder, Slide; ticket #1172): pick a Metric and what to show of it,
// and the words go into the selected text box, or into a new one, filled each time the slide is shown. Nobody types
// braces. Beside it, what the selected box reads now.
// Visibility: only Metrics the person sees are offered, and none is chosen for them: adding one shows it to everyone
// the deck is shared with, and the core checks it again when the deck is saved.
import { useState } from "react";
import { Hash } from "lucide-react";
import { toast } from "sonner";
import { createShapeId, renderPlaintextFromRichText, toRichText, useValue, type Editor, type TLShape, type TLShapeId, type TLShapePartial, type TLTextShape } from "tldraw";
import { addTextValue, appendWords, richRuns, TEXT_METRICS_MAX, TEXT_SHAPE_TYPES, TEXT_VALUES, textList, textMetricIds, type TextValueKey } from "@ziffr/core/slide-text";
import type { CanvasData } from "@ziffr/core/types";
import { Button } from "@/components/ui/button";
import { SlideOverWindow } from "@/components/slide-over-window";
import { spotInView } from "../layouts";
import { filledWords } from "./live-text";

/** The size of a text box made for a value: wide enough for a name or a sentence. */
const NEW_BOX = { w: 480, h: 60 };

/** The text box a value goes into: the one being typed in, else the one selected alone. */
function targetOf(editor: Editor): TLShapeId | null {
  const id = editor.getEditingShapeId() ?? editor.getOnlySelectedShapeId();
  const shape = id ? editor.getShape(id) : undefined;
  return shape && TEXT_SHAPE_TYPES.has(shape.type) ? shape.id : null;
}

/** Puts one more value into a text box, or into a new one on the slide in view. False when the box can name no more
 * Metrics, or there is nowhere to put one. */
export function insertValue(editor: Editor, target: TLShapeId | null, key: TextValueKey, metricIds: number[]): boolean {
  const shape = target ? editor.getShape(target) : undefined;
  const rich = (shape?.props as { richText?: unknown } | undefined)?.richText;
  const list = shape ? textList(shape) : undefined;
  const added = addTextValue(shape ? richRuns(rich) : [], Array.isArray(list) ? (list as number[]) : [], key, metricIds);
  if (!added) return false;
  const meta = { ...shape?.meta, metrics: added.list };
  editor.markHistoryStoppingPoint("insert value");
  if (!shape) {
    const at = spotInView(editor, NEW_BOX);
    if (!at) return false;
    editor.createShape<TLTextShape>({ id: createShapeId(), type: "text", parentId: at.slide, x: at.spot.x, y: at.spot.y, meta, props: { richText: toRichText(added.words), autoSize: false, w: at.spot.w, size: "m", font: "sans", color: "black" } });
    editor.selectNone();
    return true;
  }
  // Into the words being typed, at the cursor; otherwise at the end of the box.
  const typing = editor.getEditingShapeId() === shape.id ? editor.getRichTextEditor() : null;
  if (typing && !typing.isDestroyed) {
    editor.updateShape({ id: shape.id, type: shape.type, meta } as TLShapePartial);
    typing.chain().focus().insertContent(added.words).run();
    return true;
  }
  // A box that grew with its words now has a width of its own, so that longer values wrap instead of moving it.
  const fixed = shape.type === "text" && (shape as TLTextShape).props.autoSize ? { autoSize: false, w: Math.max(NEW_BOX.w, (shape as TLTextShape).props.w) } : {};
  editor.updateShape({ id: shape.id, type: shape.type, meta, props: { richText: appendWords(rich, added.words), ...fixed } } as TLShapePartial);
  // Let go of the box, so that it reads its values.
  editor.selectNone();
  return true;
}

const select = "mt-1 h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm";

type Choice = Pick<CanvasData["metrics"][number], "id" | "name">;

function MetricSelect({ label, value, metrics, onChange }: { label: string; value: string; metrics: Choice[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium">{label}</span>
      <select required value={value} onChange={(e) => onChange(e.target.value)} className={select}>
        <option value="">Pick a Metric</option>
        {metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </label>
  );
}

/** The form: a Metric, what to show of it, and for a difference the Metric it is compared with. */
export function InsertValueForm({ metrics, onInsert, onClose }: { metrics: Choice[]; onInsert: (key: TextValueKey, metricIds: number[]) => void; onClose: () => void }) {
  const [metric, setMetric] = useState("");
  const [what, setWhat] = useState<TextValueKey>("latest");
  const [other, setOther] = useState("");
  const pair = what === "difference";
  const ready = metric !== "" && (!pair || other !== "");
  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onInsert(what, pair ? [Number(metric), Number(other)] : [Number(metric)]);
      }}
    >
      <MetricSelect label="Metric" value={metric} metrics={metrics} onChange={setMetric} />
      <label className="block">
        <span className="text-xs font-medium">What to show</span>
        <select value={what} onChange={(e) => setWhat(e.target.value as TextValueKey)} className={select}>
          {TEXT_VALUES.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </select>
        <span className="mt-1 block text-xs text-muted-foreground">Shows {TEXT_VALUES.find((v) => v.key === what)!.hint}.</span>
      </label>
      {pair && <MetricSelect label="Compared with" value={other} metrics={metrics.filter((m) => String(m.id) !== metric)} onChange={setOther} />}
      <p className="text-xs text-muted-foreground">Everyone the deck is shared with then sees this Metric. Someone who may not see it reads nothing of it.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!ready}>Insert</Button>
      </div>
    </form>
  );
}

/** The button that opens "Insert value" in the side panel; off until the editor is there and there is a Metric to
 * show. */
export function InsertValueButton({ editor, data, className }: { editor: Editor | null; data: CanvasData; className?: string }) {
  // The box picked when the button was pressed; null: a new one.
  const [open, setOpen] = useState<{ target: TLShapeId | null } | null>(null);
  const close = () => setOpen(null);
  return (
    <>
      <Button variant="outline" className={className} disabled={!editor || !data.metrics.length} onClick={() => editor && setOpen({ target: targetOf(editor) })}>
        <Hash aria-hidden /> Insert value
      </Button>
      {open && editor && (
        <SlideOverWindow short title="Insert value" description={open.target ? "It goes into the text box you picked, and is filled each time the slide is shown." : "It goes into a new text box on the slide in view, and is filled each time the slide is shown."} onClose={close}>
          <InsertValueForm
            metrics={data.metrics}
            onClose={close}
            onInsert={(key, ids) => {
              if (insertValue(editor, open.target, key, ids)) close();
              else toast.error("Not inserted", { description: `A text box names ${TEXT_METRICS_MAX} Metrics at most. Use another box.` });
            }}
          />
        </SlideOverWindow>
      )}
    </>
  );
}

/** Beside the canvas for the selected text box: what it reads now, the Metrics it names and one more value. Nothing
 * when the selection is not one text box. */
export function TextBoxPanel({ editor, data }: { editor: Editor; data: CanvasData }) {
  const shape = useValue("selected text box", (): TLShape | null => {
    const s = editor.getOnlySelectedShape();
    return s && TEXT_SHAPE_TYPES.has(s.type) ? s : null;
  }, [editor]);
  const reads = useValue("selected text box reads", () => {
    const rich = shape ? filledWords(editor, shape) : undefined;
    return rich === undefined ? null : renderPlaintextFromRichText(editor, rich as never);
  }, [editor, shape]);
  if (!shape) return null;
  const names = textMetricIds(shape).map((id) => data.metrics.find((m) => m.id === id)?.name ?? "a Metric you cannot see");
  return (
    <section aria-label="Text box" className="stock space-y-2 rounded-[var(--radius-card)] p-3">
      <h2 className="text-sm font-semibold">Text box</h2>
      {reads !== null && names.length > 0 && (
        <div className="text-sm">
          <p className="text-xs font-medium">Reads now</p>
          <p className="whitespace-pre-line [overflow-wrap:anywhere]">{reads}</p>
          <p className="mt-1 text-xs text-muted-foreground">From {names.join(", ")}. While the box is selected it shows the words in braces that stand for the values.</p>
        </div>
      )}
      <InsertValueButton editor={editor} data={data} className="w-full" />
    </section>
  );
}
