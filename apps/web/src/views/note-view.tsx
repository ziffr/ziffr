"use client";
// Draws a Note Widget's words (GLOSSARY: Note Widget): paragraphs and simple lists, as text only.
// Security: the words are another person's and reach View Links. They are given to React as text, never as markup, and
// nothing in them is made a link. A slide's copy comes from a browser unchecked, so its shape is checked here too.
import { useLayoutEffect, useRef, useState } from "react";
import { noteBlocks, NOTE_TEXT_MAX } from "@ziffr/core/note-widget";
import type { TemplateId, WidgetSettings } from "@ziffr/core/types";

/** A note's text as it can be drawn: a string within its length, else nothing. */
export const noteTextOf = (settings: Pick<WidgetSettings, "note">): string => (typeof settings.note === "string" ? settings.note.slice(0, NOTE_TEXT_MAX) : "");

/** The class that makes a highlighted note's card a callout (globals.css); nothing for every other widget. */
export const noteCardClass = (widget: { template: TemplateId; settings: WidgetSettings }): string | undefined =>
  (widget.template === "note" && widget.settings.noteHighlight === true ? "note-highlight" : undefined);

/** Whether words are cut off in their room, so that the room has to be reached by keyboard to scroll it. */
function useOverflows(text: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    return () => seen.disconnect();
  }, [text]);
  return { ref, overflows };
}

/** A note's words in its card: they wrap, keep their line breaks and scroll where the card is too short. A note with
 * neither a heading nor words says so, rather than standing as an empty card. */
export function NoteBody({ settings, heading }: { settings: WidgetSettings; heading?: string | null }) {
  const text = noteTextOf(settings);
  const { ref, overflows } = useOverflows(text);
  const blocks = noteBlocks(text);
  if (!blocks.length && !heading) return <p className="widget-text-sm text-muted-foreground">Nothing written yet.</p>;
  return (
    <div ref={ref} tabIndex={overflows ? 0 : undefined} role={overflows ? "region" : undefined} aria-label={overflows ? "Note" : undefined} className="widget-text-sm h-full space-y-2 overflow-y-auto leading-relaxed [overflow-wrap:anywhere]">
      {/* Colour is not the only sign of a callout. */}
      {settings.noteHighlight === true && <p className="sr-only">Highlighted</p>}
      {blocks.map((b, i) => {
        if (b.kind === "text") return <p key={i} className="whitespace-pre-wrap">{b.lines.join("\n")}</p>;
        const items = b.items.map((item, n) => <li key={n}>{item}</li>);
        return b.ordered ? <ol key={i} start={b.start} className="list-decimal space-y-0.5 ps-5">{items}</ol> : <ul key={i} className="list-disc space-y-0.5 ps-5">{items}</ul>;
      })}
    </div>
  );
}
