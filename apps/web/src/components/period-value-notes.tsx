"use client";
// A period's Value Notes where they are read and written (GLOSSARY: Value Note, Period Record; spec 0064): the current
// ones, writing, correcting and removing, and the history. The core says which of these the reader may do, and checks
// again on every save; this only shows what it was given.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PencilLine, Plus, Trash2, X } from "lucide-react";
import { correctNote, deleteNoteForGood, removeNote, writeNote } from "@/app/value-note-actions";
import { isActionError, UNEXPECTED, type ActionError } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { ValueNoteField } from "@/components/value-note-field";
import { ValueNoteText, type NoteNumbers } from "@/components/value-note";
import { formatDate, formatValue } from "@ziffr/core/format";
import type { PeriodNotes, ValueNoteEntry } from "@ziffr/core/value-notes";
import { cn } from "@/lib/utils";

const DONE = { written: "Written", corrected: "Corrected", removed: "Removed" } as const;
const FOR_GOOD = "Delete the words for good";

type Run = (work: () => Promise<ActionError | void>, done: string, after?: () => void) => void;

/** The notes of one period; nothing at all where there is none and the reader may not write one. */
export function PeriodValueNotes({ metricId, period, notes, title = "Notes", className, ...numbers }: NoteNumbers & { metricId: number; period: string; notes: PeriodNotes; title?: string; className?: string }) {
  // The note being corrected, or "new" for the one being written.
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const { current, history, mayWrite } = notes;
  if (!current.length && !history.length && !mayWrite) return null;
  const open = (which: typeof editing) => { setEditing(which); setRefused(null); };
  const run: Run = (work, done, after) => start(async () => {
    try {
      const r = await work();
      if (isActionError(r)) { setRefused(r.error); return; }
      setRefused(null);
      toast.success(done);
      after?.();
    } catch {
      setRefused(UNEXPECTED);
    }
  });
  const remove = async (id: number) => {
    if (await confirm({ title: "Remove this note?", description: "Its words are no longer shown. The history says who removed it.", confirmLabel: "Remove note" })) run(() => removeNote(id), "Note removed", () => open(null));
  };
  const erase = async (id: number) => {
    if (await confirm({ title: "Delete these words for good?", description: "For something that should never have been written. Every version of this note is emptied; the history still says a note was there. Messages and files already sent keep the words. This cannot be undone.", confirmLabel: "Delete for good" })) run(() => deleteNoteForGood(id), "Words deleted", () => open(null));
  };
  // A note with a button of its own above needs none in the history.
  const shown = new Set(current.map((n) => n.id));
  return (
    <section aria-label={title} className={className}>
      <h2 className="mb-2 font-medium">{title}</h2>
      {!current.length && <p className="text-sm text-muted-foreground">No note on this value yet.</p>}
      <ul className="space-y-3">
        {current.map((n) => (
          <li key={n.id}>
            {editing === n.id ? (
              <NoteForm label="Correct the note" words={n.words} submit="Save note" pending={pending} onCancel={() => open(null)} onSave={(words) => run(() => correctNote(n.id, words), "Note corrected", () => open(null))} />
            ) : (
              <>
                <ValueNoteText note={n} {...numbers} />
                {(n.mayCorrect || n.mayRemove || n.mayDeleteForGood) && (
                  <div className="mt-1 flex flex-wrap gap-x-1">
                    {n.mayCorrect && <Button size="sm" variant="ghost" disabled={pending} onClick={() => open(n.id)}><PencilLine aria-hidden /> Correct</Button>}
                    {n.mayRemove && <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(n.id)}><X aria-hidden /> Remove</Button>}
                    {n.mayDeleteForGood && <Button size="sm" variant="ghost" disabled={pending} onClick={() => erase(n.id)}><Trash2 aria-hidden /> {FOR_GOOD}</Button>}
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {mayWrite && (editing === "new"
        ? <div className="mt-3"><NoteForm label="Note" words="" submit="Save note" pending={pending} onCancel={() => open(null)} onSave={(words) => run(() => writeNote(metricId, period, words), "Note saved", () => open(null))} /></div>
        : <Button size="sm" variant="outline" className="mt-3" disabled={pending} onClick={() => open("new")}><Plus aria-hidden /> Add a note</Button>)}
      {refused && <p role="alert" className="mt-2 text-sm text-destructive">{refused}</p>}
      {history.length > current.length && (
        <details className="mt-3 text-sm">
          <summary className="w-fit cursor-pointer rounded-sm py-1 text-muted-foreground max-md:min-h-11 max-md:content-center">History of the notes</summary>
          <ol className="mt-1">
            {history.map((e, i) => (
              <HistoryLine key={i} entry={e} {...numbers}>
                {notes.mayDeleteForGood && e.kind === "written" && !e.deletedForGood && !shown.has(e.noteId) && <Button size="sm" variant="ghost" className="-ml-2" disabled={pending} onClick={() => erase(e.noteId)}><Trash2 aria-hidden /> {FOR_GOOD}</Button>}
              </HistoryLine>
            ))}
          </ol>
        </details>
      )}
      {dialog}
    </section>
  );
}

/** The field and its two buttons, for a new note and for a correction. */
function NoteForm({ label, words, submit, pending, onSave, onCancel }: { label: string; words: string; submit: string; pending: boolean; onSave: (words: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(words);
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); onSave(text); }}>
      <ValueNoteField label={label} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !text.trim()}>{pending ? "Saving…" : submit}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/** One entry of the history: what happened, who did it and when, and the words where they are still shown. */
function HistoryLine({ entry: e, metric, numberStyle, children }: NoteNumbers & { entry: ValueNoteEntry; children?: React.ReactNode }) {
  const gone = e.deletedForGood ? "Words deleted for good." : e.words === null && e.kind !== "removed" ? "Words hidden: the note was removed." : null;
  return (
    <li className="border-t border-border py-2 first:border-t-0 [overflow-wrap:anywhere]">
      <p className="text-xs text-muted-foreground">
        {DONE[e.kind]} by {e.author}, <time dateTime={e.at} suppressHydrationWarning>{formatDate(new Date(e.at))}</time>
        {e.addedLater && <>, added later</>}
        {/* A note that left with its value says which number it was said of. */}
        {e.replaced && e.saidOf !== null && <>, said of {formatValue(metric, e.saidOf, numberStyle)}</>}
      </p>
      {gone ? <p className="text-muted-foreground italic">{gone}</p> : e.words !== null && <p className={cn("whitespace-pre-wrap", e.replaced && "text-muted-foreground")}>{e.words}</p>}
      {children}
    </li>
  );
}
