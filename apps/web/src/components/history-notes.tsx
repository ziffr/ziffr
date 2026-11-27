// The Value Notes in a Widget's history panel (GLOSSARY: Value Note, Widget; spec 0064): the newest periods that have
// one, newest first, under the chart. Read only, as the note core gave them; each leads to its Period Record.
import Link from "next/link";
import { ValueNoteText, type NoteNumbers } from "@/components/value-note";
import { periodRecordUrl } from "@/lib/period-record-url";
import { periodLabel, type YearStart } from "@ziffr/core/periods";
import type { ShownNote } from "@ziffr/core/value-notes";
import type { Metric } from "@ziffr/core/types";

// As many periods as a panel has room for before its list of values; the rest are on the Metric's History tab.
const PERIODS = 4;

/** The notes of the newest periods that have one; nothing where there is none. */
export function HistoryNotes({ notes, metric, yearStart, numberStyle }: { notes: Record<string, ShownNote[]>; metric: NoteNumbers["metric"] & Pick<Metric, "slug" | "period">; yearStart: YearStart; numberStyle: NoteNumbers["numberStyle"] }) {
  const periods = Object.keys(notes).sort().reverse().slice(0, PERIODS);
  if (!periods.length) return null;
  return (
    <div className="border-b p-3">
      <div className="mb-1 text-xs font-medium text-muted-foreground">Notes</div>
      <ul className="space-y-2">
        {periods.map((p) => {
          const [newest, ...others] = notes[p]!;
          return (
            <li key={p}>
              <Link href={`${periodRecordUrl(metric.slug, p)}#notes`} className="inline-flex items-center text-xs underline max-md:min-h-11 max-md:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11">
                {periodLabel(p, metric.period, yearStart, true)}{others.length ? `, ${others.length} more` : ""}
              </Link>
              <ValueNoteText note={newest!} metric={metric} numberStyle={numberStyle} clamp />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
