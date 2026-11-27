"use client";
// Writing a Note Widget where it stands (GLOSSARY: Note Widget): its card becomes the form, with a heading, the words and
// the highlighted look. The core checks who may save and what the words may be; the limits here only help.
import { useState } from "react";
import { PencilLine } from "lucide-react";
import { NOTE_HEADING_MAX, NOTE_TEXT_MAX } from "@ziffr/core/note-widget";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { noteTextOf } from "@/views/note-view";
import type { WidgetSettings } from "@ziffr/core/types";

/** What the form saves: the heading (none when empty) and the note's settings. */
type NoteSave = { title: string | null; settings: WidgetSettings };

type Props = {
  widget: { title: string | null; settings: WidgetSettings };
  pending: boolean;
  onSave: (note: NoteSave) => void;
  onCancel: () => void;
};

/** The pencil in a note's title bar. */
export function NoteEditButton({ called, onClick }: { called: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={`Edit words of ${called}`} title="Edit words" onMouseDown={(e) => e.stopPropagation()} onClick={onClick} className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring max-md:-my-1.5 max-md:size-11 max-[420px]:order-2"><PencilLine aria-hidden className="size-4" /></button>
  );
}

/** What stands in an empty note for who may write it. */
export function NoteStart({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-full min-h-11 w-full items-center justify-center gap-1.5 rounded-[var(--radius-input)] border-2 border-dashed border-[var(--color-rule-2)] p-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><PencilLine aria-hidden className="size-4" /> Write something</button>
  );
}

/** The form in the card's place. Escape gives up, Ctrl or ⌘ with Enter saves. */
export function NoteEditor({ widget, pending, onSave, onCancel }: Props) {
  const [heading, setHeading] = useState(widget.title ?? "");
  const [text, setText] = useState(noteTextOf(widget.settings));
  const [highlight, setHighlight] = useState(widget.settings.noteHighlight === true);
  const save = () => onSave({ title: heading.trim() || null, settings: { note: text, noteHighlight: highlight } });
  // The card's menu, its drag and the tap that opens it large stay out of the form: a long press selects words here.
  const own = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <form
      data-no-open
      aria-label="Write the note"
      className="flex min-h-0 flex-1 cursor-auto flex-col gap-2 overflow-y-auto p-3"
      onContextMenu={own}
      onPointerDown={own}
      onTouchStart={own}
      onSubmit={(e) => { e.preventDefault(); save(); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!pending) save(); }
      }}
    >
      <Input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={NOTE_HEADING_MAX} aria-label="Heading" placeholder="Heading (optional)" className="shrink-0 max-md:h-11" />
      <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={NOTE_TEXT_MAX} aria-label="Your words" placeholder={"What should people know about these numbers?\nStart a line with - for a list."} className="field-sizing-fixed min-h-20 flex-1 resize-none" />
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <label className="mr-auto flex min-h-8 items-center gap-2 text-sm max-md:min-h-11"><Checkbox checked={highlight} onCheckedChange={(on) => setHighlight(on === true)} /> Highlight</label>
        <span className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" className="max-md:h-11" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" className="max-md:h-11" disabled={pending}>Save</Button>
        </span>
      </div>
    </form>
  );
}
