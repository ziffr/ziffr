// A Calendar Link's file (spec 0027, ticket #243; GLOSSARY: Calendar Link, Schedule): a person's Schedule as an
// iCalendar file (RFC 5545) of all-day events, each linking into Ziffr. Pure: the core gives it the entries, this only
// writes them, with lines folded at 75 octets, text escaped and CRLF line ends, as every calendar app expects.
import { addDays, format, parseISO } from "date-fns";
import { entryTitle, type ScheduleEntry, type ScheduleKind } from "./schedule";
import { knownTimeZone } from "./workspace-clock";

/** What the file is made of: whose and which Workspace's Schedule, the entries that have a date, and how to link. */
export type CalendarInput = {
  workspaceId: string;
  workspaceName: string;
  timeZone: string;
  entries: ScheduleEntry[];
  /** Events say only what kind and how many: no Metric, period or Action words. */
  noNames: boolean;
  /** The Installation's address, such as https://ziffr.example.com, without a trailing slash. */
  origin: string;
  /** When the file is written, for DTSTAMP. */
  now: Date;
};

const CRLF = "\r\n";

/** Text as an iCalendar TEXT value: backslashes, semicolons, commas and line breaks escaped, control characters dropped. */
export function escapeText(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n|\r/g, "\\n");
}

/** One content line folded at 75 octets: the rest goes on lines that start with a space, never splitting a character. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let octets = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    // The first line holds 75 octets; each continuation line holds 74 after its leading space.
    if (octets + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      octets = 0;
    }
    current += ch;
    octets += size;
  }
  out.push(current);
  return out.join(`${CRLF} `);
}

const KIND_WORDS: Record<ScheduleKind, [one: string, many: string]> = {
  value_due: ["value due", "values due"], approval: ["Approval", "Approvals"], task: ["Task", "Tasks"], question: ["Question", "Questions"],
};
const day = (d: string) => d.replaceAll("-", "");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** One all-day event. */
function event(uid: string, date: string, summary: string, description: string, url: string, now: Date): string[] {
  return [
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp(now)}`, `DTSTART;VALUE=DATE:${day(date)}`, `DTEND;VALUE=DATE:${day(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))}`,
    `SUMMARY:${escapeText(summary)}`, `DESCRIPTION:${escapeText(description)}`, `URL:${url}`, "TRANSP:TRANSPARENT", "END:VEVENT",
  ];
}

/** What an event's description says about how its date comes about. */
function dueRule(e: ScheduleEntry): string {
  if (e.kind === "value_due") return e.noDueDate ? "No Due Date set: the first working day after the period ends." : `Due on working day ${e.dueWorkingDays} after the period ends.`;
  if (e.kind === "approval") return "Asked on this day; overdue from the day after the period's Due Date.";
  if (e.escalation) return "The value was due on this day and is still missing.";
  return "Due on this day.";
}

/** The events with names: one per entry, with a UID that stays the same for the same duty. */
function namedEvents(input: CalendarInput): string[] {
  return input.entries.flatMap((e) => {
    const summary = `${entryTitle(e)}${e.overdue ? " (overdue)" : ""}`;
    const url = `${input.origin}${e.path}`;
    const lines = [`${e.metric.name}, ${e.period.label}.`, dueRule(e), e.standingInFor ? `Standing in for ${e.standingInFor.name}.` : null, `Open in Ziffr: ${url}`];
    const uid = `${e.kind}-${e.actionId ?? e.metric.id}-${e.period.start}-${input.workspaceId}@ziffr`;
    return event(uid, e.date!, summary, lines.filter(Boolean).join("\n"), url, input.now);
  });
}

/** The events without names: one per kind and day, saying how many, linking only to My schedule. */
function countedEvents(input: CalendarInput): string[] {
  const counts = new Map<string, { date: string; kind: ScheduleKind; n: number; overdue: boolean }>();
  for (const e of input.entries) {
    const key = `${e.date}|${e.kind}`;
    const c = counts.get(key) ?? counts.set(key, { date: e.date!, kind: e.kind, n: 0, overdue: false }).get(key)!;
    c.n++;
    c.overdue ||= e.overdue;
  }
  const url = `${input.origin}/settings/schedule`;
  return [...counts.values()].flatMap((c) => {
    const [one, many] = KIND_WORDS[c.kind];
    const summary = `Ziffr: ${c.n} ${c.n === 1 ? one : many}${c.overdue ? " (overdue)" : ""}`;
    return event(`${c.kind}-${day(c.date)}-${input.workspaceId}@ziffr`, c.date, summary, `Open My schedule in Ziffr: ${url}`, url, input.now);
  });
}

/** The whole file: a calendar with the Workspace's name and time zone, and an all-day event for each dated entry. */
export function calendarFile(input: CalendarInput): string {
  const dated = { ...input, entries: input.entries.filter((e) => e.date !== null) };
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ziffr//Schedule//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`Ziffr: ${input.noNames ? "my schedule" : `my schedule in ${input.workspaceName}`}`)}`,
    ...(knownTimeZone(input.timeZone) ? [`X-WR-TIMEZONE:${input.timeZone}`] : []), "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ...(input.noNames ? countedEvents(dated) : namedEvents(dated)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
