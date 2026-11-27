"use client";
// The note field on a form that types a value in (GLOSSARY: Value Note; spec 0064): optional, and on a phone one tap
// away, so the number stays the one thing asked for. Longer words are not stopped here: the core cuts them and says so.
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ValueNoteField } from "@/components/value-note-field";
import { cn } from "@/lib/utils";

/** The most characters a note has; the core holds the limit, this only warns before sending. */
const MOST = 1000;

type Props = {
  value: string;
  onChange: (words: string) => void;
  /** The field's name in a form that posts itself. */
  name?: string;
  /** What the note is about, where a page holds several such fields: "Revenue, October 2026". */
  about?: string;
};

/** "Add a note" on a phone, the field itself everywhere else and as soon as it holds words. Hidden, never removed, so
 * what was typed stays and is sent. */
export function TuckedNote({ value, onChange, name = "note", about }: Props) {
  const [open, setOpen] = useState(false);
  const shown = open || value !== "";
  const field = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  // Focus follows the tap to the field that takes the button's place.
  useEffect(() => { if (open) field.current?.focus(); }, [open]);
  return (
    <div>
      {!shown && (
        <Button type="button" variant="ghost" className="-ml-2 px-2 underline underline-offset-4 sm:hidden" aria-expanded={false} aria-controls={id} onClick={() => setOpen(true)}>
          Add a note{about && <span className="sr-only"> for {about}</span>}
        </Button>
      )}
      <div id={id} className={cn(!shown && "max-sm:hidden")}>
        <ValueNoteField
          ref={field}
          name={name}
          label="Note (optional)"
          aria-label={about ? `Note (optional) for ${about}` : undefined}
          placeholder="What is behind this number?"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={undefined}
        />
        {[...value].length > MOST && <p role="status" className="mt-1 text-xs text-destructive">Too long: only the first 1,000 characters are saved.</p>}
      </div>
    </div>
  );
}
