"use client";
// The question under a form's result (GLOSSARY: Value Note; spec 0064, "The question"): after a value that came without
// a note, the note field again, with **Save note**. It never says why it asks, and leaving it is fine. It holds only
// the code the form's result carried; the core checks it, and who may write, when the words are saved.
import { useState, useTransition } from "react";
import { saveFormNote } from "@/app/value-note-actions";
import { Button } from "@/components/ui/button";
import { ValueNoteField } from "@/components/value-note-field";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { NOTE_FIELD_QUESTION } from "@ziffr/core/ask-note";

/** The question with its field and button; once saved, what became of the words. `about` names the number where a page
 * asks about several; `redraw` draws the page under it again once saved. Give it the code as its key, so that a new
 * question starts empty. */
export function AskedNote({ code, about, redraw, className }: { code: string; about?: string; redraw?: boolean; className?: string }) {
  const [words, setWords] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (saved) return <p role="status" className={className ?? "mt-2 text-sm"}>{saved}</p>;
  const save = () => start(async () => {
    try {
      const r = await saveFormNote(code, words, redraw);
      if (isActionError(r)) setRefused(r.error);
      else if (r.saved) setSaved(r.detail);
      else setRefused(r.detail);
    } catch {
      setRefused(UNEXPECTED);
    }
  });
  // No form element of its own: it stands inside other forms. Enter in the field only starts a new line.
  return (
    <div className={className ?? "mt-2"}>
      <ValueNoteField
        label={`${NOTE_FIELD_QUESTION} (optional)`}
        aria-label={about ? `${NOTE_FIELD_QUESTION} (optional) ${about}` : undefined}
        placeholder="A few words, or leave it"
        value={words}
        onChange={(e) => setWords(e.target.value)}
        // Longer words are not stopped here: the core cuts them and says so.
        maxLength={undefined}
        className="max-sm:dark:bg-card"
      />
      <Button type="button" variant="outline" className="mt-2 max-sm:min-h-11 max-sm:w-full" disabled={pending || !words.trim()} onClick={save}>
        {pending ? "Saving…" : "Save note"}{about && <span className="sr-only"> for {about}</span>}
      </Button>
      {refused && <p role="alert" className="mt-1.5 text-sm text-destructive">{refused}</p>}
    </div>
  );
}
