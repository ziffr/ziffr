// A Calendar Link's file (spec 0027, ticket #243): valid iCalendar (RFC 5545) as calendar apps read it: CRLF line ends,
// lines folded at 75 octets without splitting a character, text escaped, every event with its required properties and a
// stable UID; and with "no names", nothing but kinds and counts.
import { describe, expect, it } from "vitest";
import { calendarFile, escapeText, foldLine, type CalendarInput } from "./calendar-ics";
import type { ScheduleEntry } from "./schedule";

const entry = (over: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  kind: "value_due", date: "2026-11-04", overdue: true, overdueWorkingDays: 11, metric: { id: 7, slug: "revenue", name: "Revenue, net; EU", period: "month" }, workflow: null,
  period: { start: "2026-10-01", label: "October 2026" }, actionId: null, text: null, escalation: false, standingInFor: null, noDueDate: false,
  dueWorkingDays: 3, remindDaysBefore: 2, path: "/schedule/submit/revenue", ...over,
});
const input = (over: Partial<CalendarInput> = {}): CalendarInput => ({
  workspaceId: "ws-1", workspaceName: "Acme", timeZone: "Europe/Berlin", noNames: false, origin: "https://ziffr.example", now: new Date("2026-11-19T00:00:00Z"),
  entries: [
    entry(),
    entry({ kind: "task", date: "2026-11-20", overdue: false, overdueWorkingDays: 0, actionId: 42, text: "Renegotiate the shipping rate with Müller & Söhne, before Friday\nthen call", path: "/actions/42", metric: { id: 8, slug: "shipping", name: "Shipping", period: "month" } }),
    entry({ kind: "approval", date: "2026-11-20", overdue: false, overdueWorkingDays: 0, actionId: 43, path: "/actions/43", metric: { id: 9, slug: "cost", name: "Cost", period: "month" } }),
    entry({ kind: "approval", date: "2026-11-20", overdue: false, overdueWorkingDays: 0, actionId: 44, path: "/actions/44", metric: { id: 10, slug: "payroll", name: "Payroll", period: "month" } }),
    entry({ kind: "question", date: null, overdue: false, overdueWorkingDays: 0, actionId: 45, text: "Why?", path: "/actions/45" }),
  ],
  ...over,
});

/** The file checked as a strict reader would, and its content lines unfolded. */
function parse(ics: string): { name: string; params: string; value: string }[] {
  expect(ics.endsWith("\r\n")).toBe(true);
  const physical = ics.slice(0, -2).split("\r\n");
  for (const l of physical) {
    expect(l).not.toMatch(/[\r\n]/);
    expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
  }
  const lines: string[] = [];
  for (const l of physical) if (l.startsWith(" ")) lines[lines.length - 1] += l.slice(1); else lines.push(l);
  const out = lines.map((l) => {
    const m = /^([A-Z-]+)((?:;[A-Z-]+=[^:;]+)*):(.*)$/.exec(l);
    expect(m, l).not.toBeNull();
    return { name: m![1], params: m![2], value: m![3] };
  });
  // BEGIN and END pair up, the calendar holding the events.
  const stack: string[] = [];
  for (const p of out) {
    if (p.name === "BEGIN") stack.push(p.value);
    if (p.name === "END") expect(stack.pop()).toBe(p.value);
  }
  expect(stack).toEqual([]);
  expect(out[0]).toEqual({ name: "BEGIN", params: "", value: "VCALENDAR" });
  for (const req of ["VERSION", "PRODID"]) expect(out.some((p) => p.name === req)).toBe(true);
  return out;
}

/** Each event's properties by name. */
const events = (parsed: ReturnType<typeof parse>) => {
  const out: Record<string, string>[] = [];
  let cur: Record<string, string> | null = null;
  for (const p of parsed) {
    if (p.name === "BEGIN" && p.value === "VEVENT") cur = {};
    else if (p.name === "END" && p.value === "VEVENT") { out.push(cur!); cur = null; } else if (cur) cur[p.name + p.params] = p.value;
  }
  return out;
};

describe("escapeText and foldLine", () => {
  it("escapes backslashes, semicolons, commas and line breaks, and drops control characters", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf\u0007")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
  it("folds at 75 octets, continuation lines starting with a space, never splitting a character", () => {
    const line = `SUMMARY:${"ü".repeat(80)}`;
    const folded = foldLine(line).split("\r\n");
    expect(folded.length).toBeGreaterThan(1);
    for (const l of folded) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(folded.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(line);
    expect(foldLine("SHORT:x")).toBe("SHORT:x");
  });
});

describe("calendarFile", () => {
  it("writes each dated entry as an all-day event with a stable UID, its title, its rule and its link", () => {
    const parsed = parse(calendarFile(input()));
    expect(parsed).toEqual(expect.arrayContaining([
      { name: "X-WR-TIMEZONE", params: "", value: "Europe/Berlin" }, { name: "REFRESH-INTERVAL", params: ";VALUE=DURATION", value: "PT1H" }, { name: "X-PUBLISHED-TTL", params: "", value: "PT1H" },
    ]));
    const ev = events(parsed);
    // The undated Question is not in the calendar.
    expect(ev).toHaveLength(4);
    expect(ev[0]).toMatchObject({
      UID: "value_due-7-2026-10-01-ws-1@ziffr", "DTSTART;VALUE=DATE": "20261104", "DTEND;VALUE=DATE": "20261105", DTSTAMP: "20261119T000000Z",
      SUMMARY: "Revenue\\, net\\; EU for October 2026 due (overdue)", URL: "https://ziffr.example/schedule/submit/revenue",
    });
    expect(ev[0].DESCRIPTION).toContain("Due on working day 3 after the period ends.");
    expect(ev[1]).toMatchObject({ UID: "task-42-2026-10-01-ws-1@ziffr", SUMMARY: "Task: Renegotiate the shipping rate with Müller & Söhne\\, before Friday\\nthen call" });
    expect(ev[2]).toMatchObject({ SUMMARY: "Approve: Cost for October 2026", URL: "https://ziffr.example/actions/43" });
    // The same Schedule gives the same file.
    expect(calendarFile(input())).toBe(calendarFile(input()));
  });

  it("with no names, says only what kind and how many, one event per kind and day, linking to My schedule", () => {
    const ics = calendarFile(input({ noNames: true }));
    const ev = events(parse(ics));
    expect(ev.map((e) => e.SUMMARY)).toEqual(["Ziffr: 1 value due (overdue)", "Ziffr: 1 Task", "Ziffr: 2 Approvals"]);
    expect(ev.map((e) => e.UID)).toEqual(["value_due-20261104-ws-1@ziffr", "task-20261120-ws-1@ziffr", "approval-20261120-ws-1@ziffr"]);
    expect(ev.every((e) => e.URL === "https://ziffr.example/settings/schedule")).toBe(true);
    // No Metric, period, Action words or Workspace name anywhere in the file, folded or not.
    const flat = ics.replace(/\r\n /g, "");
    for (const word of ["Revenue", "Shipping", "Cost", "Payroll", "October", "Renegotiate", "Acme", "revenue", "/actions/"]) expect(flat).not.toContain(word);
  });
});
