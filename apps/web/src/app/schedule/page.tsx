// My schedule, now at /schedule (ticket #529) (spec 0027, ticket #242; GLOSSARY: Schedule, Due Date, Stand-in, Approval, Task, Question): what you have
// to do in this Workspace, overdue first, then the next 14 days, then what has no date. It shows the core's Schedule
// as it is; every entry links to where it is done. Below it, the Calendar Link (ticket #243).
import Link from "next/link";
import { addDays, format, parseISO } from "date-fns";
import { entryTitle, schedule, type ScheduleEntry } from "@ziffr/core/schedule";
import { localTime, workspaceClock } from "@ziffr/core/workspace-clock";
import { myCalendarLink } from "@ziffr/core/calendar-links";
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { calendarSpan } from "@ziffr/core/schedule-calendar";
import { CalendarLink } from "./calendar-link";
import { ScheduleViews, type Duty } from "./views";
import { PageHeader } from "@/components/page-header";

/** How many days ahead the page shows, today included. */
const DAYS_SHOWN = 14;

const dayName = (d: string) => format(parseISO(d), "EEE d MMM");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What else to say about an entry, in a few words. */
function notes(e: ScheduleEntry): string[] {
  const out: string[] = [];
  if (e.overdue) out.push(`${e.date ? `${e.kind === "approval" ? "asked" : "due"} ${dayName(e.date)}, ` : ""}${plural(e.overdueWorkingDays, "working day")} late`);
  if (e.standingInFor) out.push(`standing in for ${e.standingInFor.name}`);
  if (e.noDueDate) out.push("no Due Date set");
  if (e.escalation) out.push("Escalation");
  if (e.kind === "value_due" && !e.overdue && e.remindDaysBefore !== null) out.push(`Ziffr reminds you ${plural(e.remindDaysBefore, "day")} before`);
  if (e.text && e.kind !== "value_due") out.push(`${e.metric.name}, ${e.period.label}`);
  return out;
}

function Entries({ list }: { list: ScheduleEntry[] }) {
  return (
    <ul className="overflow-hidden stock rounded-[var(--radius-card)]">
      {list.map((e) => (
        <li key={`${e.kind}-${e.metric.id}-${e.period.start}-${e.actionId ?? ""}`} className="border-b border-border last:border-0">
          <Link href={e.path} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 hover:bg-[var(--color-paper-2)]">
            <span className="min-w-[12rem] flex-1 font-medium">{entryTitle(e)}</span>
            <span className="text-xs text-muted-foreground">{notes(e).join(" · ")}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}{hint && <span className="font-normal text-muted-foreground"> {hint}</span>}</h2>
      {children}
    </section>
  );
}

/** A duty as a calendar chip needs it: its words, its day and where it opens, nothing more than the list shows. */
const duty = (e: ScheduleEntry): Duty => ({ key: `${e.kind}-${e.metric.id}-${e.period.start}-${e.actionId ?? ""}`, kind: e.kind, title: entryTitle(e), date: e.date!, overdue: e.overdue, lateDays: e.overdueWorkingDays, path: e.path });

export default async function MySchedulePage() {
  const actor = await currentActor();
  // Today is the Workspace's, as the core counts it.
  const { timeZone, weekStart } = await workspaceClock(actor);
  const today = localTime(new Date(), timeZone).day;
  // One fetch serves the list (its next 14 days) and the week and month views (from this week on): the same function.
  const span = calendarSpan(today, weekStart);
  const [s, link, demo] = await Promise.all([schedule(actor, span), myCalendarLink(actor), isDemo()]);
  const listDays = s.days.filter((d) => d.date <= format(addDays(parseISO(today), DAYS_SHOWN - 1), "yyyy-MM-dd"));
  const nothing = !s.overdue.length && !listDays.length && !s.undated.length;
  return (
    <>
      <PageHeader title="My schedule" sub="What you have to do in this Workspace: values to submit by their Due Dates, Approvals waiting for you, and the Tasks and Questions assigned to you." />
      <div className="space-y-6">
        <ScheduleViews
          person={s.personId}
          today={s.today}
          span={span}
          weekStart={weekStart}
          overdue={s.overdue.map(duty)}
          days={s.days.map((d) => ({ date: d.date, entries: d.entries.map(duty) }))}
          list={
            <div className="space-y-6">
              {nothing && <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-4 text-sm text-muted-foreground">Nothing to do in the next {DAYS_SHOWN} days, and nothing overdue.</p>}
              {s.overdue.length > 0 && <Section title="Overdue" hint={String(s.overdue.length)}><Entries list={s.overdue} /></Section>}
              {listDays.map((d) => (
                <Section key={d.date} title={d.date === s.today ? `Today, ${dayName(d.date)}` : dayName(d.date)}><Entries list={d.entries} /></Section>
              ))}
              {!nothing && !listDays.length && <p className="text-sm text-muted-foreground">Nothing due in the next {DAYS_SHOWN} days.</p>}
            </div>
          }
        />
        {s.undated.length > 0 && <Section title="No date" hint="Tasks without a due date and Questions"><Entries list={s.undated} /></Section>}
        <CalendarLink link={link} demo={demo} />
      </div>
    </>
  );
}
