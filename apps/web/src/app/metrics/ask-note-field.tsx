// The **Ask for a note** field (GLOSSARY: Metric Description, Value Note; spec 0064): when a Metric asks whoever sent
// only a number to say what is behind it. Named ask_note; the core takes only its three choices.
import { Label } from "@/components/ui/label";
import { ASK_NOTE, ASK_NOTE_DEFAULT, ASK_NOTE_HINT, ASK_NOTE_LABEL, ASK_NOTE_SETTING, type AskNote } from "@ziffr/core/ask-note";

/** A labelled choice of when to ask, with what asking means underneath. */
export function AskNoteField({ id, value, className }: { id: string; value?: AskNote; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{ASK_NOTE_SETTING}</Label>
      <select id={id} name="ask_note" defaultValue={value ?? ASK_NOTE_DEFAULT} aria-describedby={`${id}-hint`} className="mt-1 h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm max-sm:h-11">
        {ASK_NOTE.map((choice) => <option key={choice} value={choice}>{ASK_NOTE_LABEL[choice]}</option>)}
      </select>
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">{ASK_NOTE_HINT}</p>
    </div>
  );
}
