// How a Value Note reads wherever it is shown (GLOSSARY: Value Note; spec 0064): the words as plain text, with their
// line breaks and never as links or markup, then who wrote them and when. The note core decided that this reader may
// have it, and gave the names as this reader reads them.
import { formatDate, formatValue } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { ShownNote } from "@ziffr/core/value-notes";
import type { Metric } from "@ziffr/core/types";
import { cn } from "@/lib/utils";

/** How the Metric's numbers are written, for the number a note was said of. */
export type NoteNumbers = { metric: Pick<Metric, "decimals" | "unit" | "unit_position">; numberStyle: NumberStyle };

/** One note. `clamp` keeps a list short: the caller then links to where the whole note is. */
export function ValueNoteText({ note, metric, numberStyle, clamp, className }: NoteNumbers & { note: ShownNote; clamp?: boolean; className?: string }) {
  return (
    <div className={cn("border-l-2 border-[var(--color-rule-2)] pl-3 text-sm [overflow-wrap:anywhere]", className)}>
      <p className={cn("whitespace-pre-wrap", clamp && "line-clamp-3")}>{note.words}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Note by {note.author}, {/* The server and the browser may stand on two sides of midnight. */}
        <time dateTime={note.at} suppressHydrationWarning>{formatDate(new Date(note.at))}</time>
        {note.correctedBy && <>, corrected by {note.correctedBy}</>}
        {note.addedLater && <>, added later</>}
        {note.writtenWhenItShowed !== null && <>, written when it showed {formatValue(metric, note.writtenWhenItShowed, numberStyle)}</>}
      </p>
    </div>
  );
}
