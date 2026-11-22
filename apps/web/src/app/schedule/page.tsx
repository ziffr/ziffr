// The Schedule (GLOSSARY: Schedule, Action): one page for what a person has to do and what happened, in three views
// switched at the top: To do (below), Asked by me and Timeline. The old Actions page redirects here.
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
import { actionsAskedByMe, actionsTimeline } from "@ziffr/core/actions-overview";
import { listShareProposals } from "@ziffr/core/share-proposals";
import { getProfileMap } from "@/lib/data";
import { ShareProposalButtons } from "@/components/share-proposal-buttons";
import { ProposalFacts, proposalTitle } from "@/components/share-proposal-summary";
import { AskedView } from "./asked-view";
import { TimelineList } from "./timeline-view";
import { Choices, Pick, href, type Params } from "./choices";

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

const KINDS = [{ id: "", label: "All" }, { id: "value_due", label: "Values" }, { id: "approval", label: "Approvals" }, { id: "task", label: "Tasks" }, { id: "question", label: "Questions" }];

/** To do: values to submit, Approvals, Tasks and Questions waiting for the person, overdue first, then by Due Date. */
async function ToDo({ sp }: { sp: Params }) {
  const actor = await currentActor();
  const kind = KINDS.some((k) => k.id && k.id === sp.kind) ? sp.kind : "";
  const only = (list: ScheduleEntry[]) => (kind ? list.filter((e) => e.kind === kind) : list);
  // Today is the Workspace's, as the core counts it.
  const { timeZone, weekStart } = await workspaceClock(actor);
  const today = localTime(new Date(), timeZone).day;
  // One fetch serves the list (its next 14 days) and the week and month views (from this week on): the same function.
  const span = calendarSpan(today, weekStart);
  const [s0, link, demo, proposals] = await Promise.all([schedule(actor, span), myCalendarLink(actor), isDemo(), listShareProposals(actor)]);
  const s = { ...s0, overdue: only(s0.overdue), days: s0.days.map((d) => ({ ...d, entries: only(d.entries) })).filter((d) => d.entries.length), undated: only(s0.undated) };
  const listDays = s.days.filter((d) => d.date <= format(addDays(parseISO(today), DAYS_SHOWN - 1), "yyyy-MM-dd"));
  const nothing = !s.overdue.length && !listDays.length && !s.undated.length;
  return (
    <>
      <div className="space-y-6">
        <Choices label="Kind" current={kind ?? ""} options={KINDS} make={(id) => href(sp, { kind: id })} />
        {proposals.length > 0 && (
          <section aria-label="Share Proposals">
            <h2 className="mb-2 text-sm font-semibold">Waiting for your confirmation <span className="font-normal text-muted-foreground">{proposals.length}</span></h2>
            <p className="mb-2 text-xs text-muted-foreground">An assistant or program prepared these. Nothing is shared or sent until you confirm.</p>
            <ul className="overflow-hidden stock rounded-[var(--radius-card)]">
              {proposals.map((p) => (
                <li key={p.id} className="space-y-3 border-b border-border px-4 py-3 last:border-0">
                  <p className="font-medium">{proposalTitle(p)}</p>
                  <ProposalFacts p={p} />
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/actions/share/${p.id}`} className="text-sm font-medium underline">{p.kind === "view_link" ? "See what they will see, and confirm" : "Review and confirm"}</Link>
                    <ShareProposalButtons id={p.id} showConfirm={false} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
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

const VIEWS = [{ id: "todo", label: "To do" }, { id: "asked", label: "Asked by me" }, { id: "timeline", label: "Timeline" }];

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const view = sp.view === "asked" || sp.view === "timeline" ? sp.view : "todo";
  const num = (s?: string) => (s && /^\d{1,9}$/.test(s) ? Number(s) : null);
  const day = sp.period && /^\d{4}-\d{2}-\d{2}$/.test(sp.period) ? sp.period : null;
  const actor = await currentActor();
  return (
    <>
      <PageHeader title="Schedule" sub="What you have to do in this Workspace: values to submit by their Due Dates, Approvals waiting for you, and the Tasks and Questions assigned to you. Ask them from any widget’s ⋯ menu." />
      <div className="space-y-6">
        <Choices label="View" current={view} options={VIEWS} make={(id) => href({}, { view: id === "todo" ? "" : id })} />
        {view === "todo" && <ToDo sp={sp} />}
        {view === "asked" && <AskedView rows={await actionsAskedByMe(actor)} people={await getProfileMap()} />}
        {view === "timeline" && await (async () => {
          const timeline = await actionsTimeline(actor, { workflowId: num(sp.workflow), metricId: num(sp.metric), period: day });
          const base = { ...sp, view: "timeline" };
          return (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Pick name="workflow" label="Workflow" value={sp.workflow ?? ""} options={timeline.workflows.map((w) => ({ id: String(w.id), label: w.name }))} sp={base} />
                <Pick name="metric" label="Metric" value={sp.metric ?? ""} options={timeline.metrics.map((m) => ({ id: String(m.id), label: m.name }))} sp={base} />
                <Pick name="period" label="Period" value={day ?? ""} options={timeline.periods.map((p) => ({ id: p.start, label: p.label }))} sp={base} />
              </div>
              <TimelineList timeline={timeline} />
            </>
          );
        })()}
      </div>
    </>
  );
}
