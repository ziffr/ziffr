// Value Notes on a Metric's page (GLOSSARY: Value Note, Metric; spec 0064): the one under the latest value, and the
// column of the History tab. They are read here; writing and correcting happen on the Period Record these lead to.
// Server only: the core gives them to this person (@ziffr/core/value-notes), and the page draws what it got.
import Link from "next/link";
import { ValueNoteText, type NoteNumbers } from "@/components/value-note";
import { periodRecordUrl } from "@/lib/period-record-url";
import { currentValueNotes, periodValueNotes, type PeriodNotes, type ShownNote } from "@ziffr/core/value-notes";
import { formatValue } from "@ziffr/core/format";
import { periodLabel, type YearStart } from "@ziffr/core/periods";
import type { Actor } from "@ziffr/core/actor";
import type { Metric, Point } from "@ziffr/core/types";

// How many periods of a calculated Metric its History tab lists, as many as the latest values of any other.
const LISTED = 12;
const link = "inline-flex items-center text-sm underline max-md:min-h-11 pointer-coarse:min-h-11";
const notesUrl = (slug: string, period: string) => `${periodRecordUrl(slug, period)}#notes`;

/** What the page shows of one Metric's notes. */
export type MetricNotes = {
  /** The latest period's, and its first day; null and undefined where there is none to show this person. */
  latest: PeriodNotes | null;
  last: string | undefined;
  /** The current notes of the periods the History tab lists; empty on every other tab. */
  noted: Record<string, ShownNote[]>;
  /** A calculated Metric's latest periods, which that tab lists for it; none for any other Metric. */
  calculated: Point[];
  /** The notes that stand with one row of the latest values: under "keep both" a period has several, and the newest has them. */
  of: (row: { id: number; period_start: string }) => ShownNote[] | undefined;
};

/** Reads them for the person looking. `rows` are the latest values the page lists, oldest first. */
export async function metricNotes(actor: Actor, metric: Pick<Metric, "id" | "formula">, shown: { history: boolean; rows: { id: number; period_start: string }[]; points: Point[] }): Promise<MetricNotes> {
  const last = shown.points.at(-1)?.period;
  const calculated = metric.formula ? shown.points.slice(-LISTED) : [];
  const periods = (metric.formula ? calculated.map((p) => p.period) : shown.rows.map((o) => o.period_start));
  const [latest, noted] = await Promise.all([
    last ? periodValueNotes(actor, metric.id, last) : null,
    shown.history ? currentValueNotes(actor, metric.id, periods) : ({} as Record<string, ShownNote[]>),
  ]);
  const newest = new Map(shown.rows.map((o) => [o.period_start, o.id]));
  return { latest, last, noted, calculated, of: (row) => (newest.get(row.period_start) === row.id ? noted[row.period_start] : undefined) };
}

type Of = NoteNumbers & { metric: Pick<Metric, "slug" | "period"> };

/** The newest note under the latest value, with the way to the others and the history; for who may write one and finds
 * none, the way to add it. Nothing for anyone else. */
export function LatestNote({ notes: { latest, last }, yearStart, metric, numberStyle }: Of & { notes: MetricNotes; yearStart: YearStart }) {
  if (!latest || !last) return null;
  const label = periodLabel(last, metric.period, yearStart);
  const [newest, ...others] = latest.current;
  const href = notesUrl(metric.slug, last);
  if (!newest) return latest.mayWrite ? <p className="mb-3"><Link href={href} className={link}>Add a note on {label}</Link></p> : null;
  return (
    <section aria-label={`Note on ${label}`} className="mb-4 stock rounded-[var(--radius-card)] p-3 sm:p-4">
      <h2 className="mb-1.5 text-xs text-muted-foreground">Note on {label}</h2>
      <ValueNoteText note={newest} metric={metric} numberStyle={numberStyle} />
      <Link href={href} className={`${link} mt-1`}>{others.length ? `${others.length} more, and the history` : latest.mayWrite ? "Add or change notes" : "Open this period"}</Link>
    </section>
  );
}

// A period's note in a list: the newest, cut to a few lines, and the way to the rest.
function ListedNote({ notes, period, metric, numberStyle }: Of & { notes: ShownNote[]; period: string }) {
  const [newest, ...others] = notes;
  return (
    <>
      <ValueNoteText note={newest!} metric={metric} numberStyle={numberStyle} clamp />
      <Link href={notesUrl(metric.slug, period)} className={`${link} pl-3.5 text-xs`}>{others.length ? `${others.length} more` : "Read in full"}</Link>
    </>
  );
}

const anyListed = (notes: MetricNotes) => Object.keys(notes.noted).length > 0;

/** The width a table of values takes on the History tab: the whole row once it carries a Note column. */
export const noteSpan = (notes: MetricNotes) => (anyListed(notes) ? "lg:col-span-2" : undefined);

/** The head of the Note column, there while a listed period has a note and the screen has room for it. */
export function NoteHead({ notes }: { notes: MetricNotes }) {
  return anyListed(notes) ? <th className="w-2/5 pb-2 pl-3 font-normal max-lg:hidden">Note</th> : null;
}

/** One row of the latest values with its note: in the column on a large screen, else in a row of its own under it. */
export function RowWithNote({ notes, row, metric, numberStyle, children }: Of & { notes: MetricNotes; row: { id: number; period_start: string }; children: React.ReactNode }) {
  const mine = notes.of(row);
  const note = mine && <ListedNote notes={mine} period={row.period_start} metric={metric} numberStyle={numberStyle} />;
  return (
    <>
      <tr className="border-t">
        {children}
        {anyListed(notes) && <td className="py-2 pl-3 align-top max-lg:hidden">{note}</td>}
      </tr>
      {note && <tr className="lg:hidden"><td colSpan={4} className="pb-2">{note}</td></tr>}
    </>
  );
}

/** The latest values of a calculated Metric (Derived Metric, Total), oldest first, each with its note: no values are
 * sent to such a Metric, so this is where its periods' notes are listed. Nothing where there is none to read or write. */
export function CalculatedValues({ notes, metric, numberStyle, yearStart }: Of & { notes: MetricNotes; yearStart: YearStart }) {
  const { calculated, noted, latest } = notes;
  if (!calculated.length || (!anyListed(notes) && !latest?.mayWrite)) return null;
  return (
    <section className="stock rounded-[var(--radius-card)] p-5 lg:col-span-2">
      <h2 className="mb-3 font-medium">Latest values</h2>
      <ul className="divide-y divide-border">
        {calculated.map((p) => (
          <li key={p.period} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2 text-sm lg:grid-cols-[9rem_8rem_minmax(0,1fr)]">
            <Link href={periodRecordUrl(metric.slug, p.period)} className="hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center">{periodLabel(p.period, metric.period, yearStart)}</Link>
            <span className="fig text-right">{formatValue(metric, p.value, numberStyle)}</span>
            {noted[p.period] && <div className="col-span-2 lg:col-span-1"><ListedNote notes={noted[p.period]!} period={p.period} metric={metric} numberStyle={numberStyle} /></div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
