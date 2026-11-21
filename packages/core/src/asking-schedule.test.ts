// The Asking Schedule's rules (spec 0035, ticket #361; GLOSSARY: Asking Schedule): which days run, at what hour, the
// next run, and what is refused. Fixed days and instants only.
import { describe, expect, it } from "vitest";
import { askingHour, askingWarnings, cleanAsking, describeAsking, describeDays, isAskingDay, isAskingDue, longestGap, nextAskingDay, nextAskingRun, weekdayOf } from "./asking-schedule";
import { localTime } from "./workspace-clock";
import type { AskingDays, AskingSchedule } from "./types";

const runDays = (days: AskingDays, from: string, count: number) => Array.from({ length: count }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)).filter((d) => isAskingDay(days, d));

describe("which days run", () => {
  it("numbers weekdays from Monday to Sunday", () => {
    expect([weekdayOf("2026-11-30"), weekdayOf("2026-12-06"), weekdayOf("2026-12-07")]).toEqual([1, 7, 1]);
  });
  it("runs every day, or Monday to Friday", () => {
    expect(runDays({ kind: "every_day" }, "2026-12-01", 7)).toHaveLength(7);
    expect(runDays({ kind: "weekdays" }, "2026-12-05", 4)).toEqual(["2026-12-07", "2026-12-08"]);
  });
  it("runs chosen weekdays, also across a year end", () => {
    expect(runDays({ kind: "chosen_weekdays", days: [1, 4] }, "2026-12-28", 8)).toEqual(["2026-12-28", "2026-12-31", "2027-01-04"]);
  });
  it("runs every N days from a starting day: not before it, on it, and on each N-th day after", () => {
    const days: AskingDays = { kind: "every_n_days", n: 3, from: "2026-12-01" };
    expect(isAskingDay(days, "2026-11-28")).toBe(false);
    expect(isAskingDay(days, "2026-11-30")).toBe(false);
    expect(runDays(days, "2026-12-01", 10)).toEqual(["2026-12-01", "2026-12-04", "2026-12-07", "2026-12-10"]);
    // Across a month, a year and a leap day.
    expect(isAskingDay({ kind: "every_n_days", n: 30, from: "2027-12-31" }, "2028-01-30")).toBe(true);
    expect(isAskingDay({ kind: "every_n_days", n: 2, from: "2028-02-28" }, "2028-03-01")).toBe(true);
    expect(isAskingDay({ kind: "every_n_days", n: 2, from: "2028-02-28" }, "2028-02-29")).toBe(false);
    // A starting day in the future has not begun.
    expect(isAskingDay({ kind: "every_n_days", n: 2, from: "2027-01-01" }, "2026-12-30")).toBe(false);
  });
  it("runs a day of the month, and a day a short month lacks on its last day", () => {
    const d31: AskingDays = { kind: "month_day", day: 31 };
    expect(runDays(d31, "2026-11-25", 10)).toEqual(["2026-11-30"]);
    expect(runDays(d31, "2026-12-25", 10)).toEqual(["2026-12-31"]);
    expect(runDays({ kind: "month_day", day: 30 }, "2027-02-20", 10)).toEqual(["2027-02-28"]);
    expect(runDays({ kind: "month_day", day: 30 }, "2028-02-20", 12)).toEqual(["2028-02-29"]);
    expect(runDays({ kind: "month_day", day: "last" }, "2028-02-20", 12)).toEqual(["2028-02-29"]);
    expect(runDays({ kind: "month_day", day: 5 }, "2026-12-01", 10)).toEqual(["2026-12-05"]);
    expect(isAskingDay({ kind: "month_day", day: 1 }, "2027-01-01")).toBe(true);
  });
});

describe("the hour", () => {
  const every: AskingSchedule = { hour: 14, days: { kind: "every_day" } };
  it("is its own, or the Workspace's when blank", () => {
    expect(askingHour(every, 8)).toBe(14);
    expect(askingHour({ hour: null, days: every.days }, 8)).toBe(8);
    expect(askingHour({ hour: 0, days: every.days }, 8)).toBe(0);
  });
  it("is due from its hour on a run day, not before, not on another day", () => {
    const s: AskingSchedule = { hour: 14, days: { kind: "chosen_weekdays", days: [1] } };
    expect(isAskingDue(s, 8, { day: "2026-12-07", hour: 13 })).toBe(false);
    expect(isAskingDue(s, 8, { day: "2026-12-07", hour: 14 })).toBe(true);
    expect(isAskingDue(s, 8, { day: "2026-12-07", hour: 23 })).toBe(true);
    expect(isAskingDue(s, 8, { day: "2026-12-08", hour: 14 })).toBe(false);
  });
  it("runs at the next hour when a clock change skips it, and once when it repeats", () => {
    const s: AskingSchedule = { hour: 2, days: { kind: "every_day" } };
    // Europe/Berlin, 28 March 2027: 02:00 does not exist; 01:30 is followed by 03:00.
    expect(isAskingDue(s, 8, localTime(new Date("2027-03-28T00:30:00Z"), "Europe/Berlin"))).toBe(false);
    expect(localTime(new Date("2027-03-28T01:00:00Z"), "Europe/Berlin").hour).toBe(3);
    expect(isAskingDue(s, 8, localTime(new Date("2027-03-28T01:00:00Z"), "Europe/Berlin"))).toBe(true);
    // 31 October 2027: 02:00 comes twice; both are on the same day, which is claimed once.
    const a = localTime(new Date("2027-10-31T00:30:00Z"), "Europe/Berlin");
    const b = localTime(new Date("2027-10-31T01:30:00Z"), "Europe/Berlin");
    expect([a.day, a.hour, b.day, b.hour]).toEqual(["2027-10-31", 2, "2027-10-31", 2]);
    // America/New_York is a day behind UTC late in the evening: the run day is the Workspace's day.
    expect(localTime(new Date("2026-12-07T03:00:00Z"), "America/New_York")).toEqual({ day: "2026-12-06", hour: 22 });
    expect(isAskingDue({ hour: 20, days: { kind: "chosen_weekdays", days: [7] } }, 8, localTime(new Date("2026-12-07T03:00:00Z"), "America/New_York"))).toBe(true);
  });
});

describe("the next run", () => {
  const s = (days: AskingDays, hour = 14) => ({ hour, days });
  it("is today when today runs and its hour has not come, else the next run day", () => {
    const mon = s({ kind: "chosen_weekdays", days: [1] });
    expect(nextAskingRun(mon, 8, { day: "2026-12-07", hour: 9 })).toBe("2026-12-07");
    expect(nextAskingRun(mon, 8, { day: "2026-12-07", hour: 14 })).toBe("2026-12-14");
    expect(nextAskingRun(mon, 8, { day: "2026-12-09", hour: 3 })).toBe("2026-12-14");
  });
  it("finds a starting day in the future, and nothing when there is none soon", () => {
    expect(nextAskingDay({ kind: "every_n_days", n: 5, from: "2027-03-01" }, "2026-12-01")).toBe("2027-03-01");
    expect(nextAskingDay({ kind: "every_n_days", n: 5, from: "2030-03-01" }, "2026-12-01")).toBeNull();
  });
});

describe("what is refused and what is kept", () => {
  it("has none when nothing is given", () => {
    expect(cleanAsking(undefined)).toBeUndefined();
    expect(cleanAsking(null)).toBeUndefined();
  });
  it("keeps a valid setting and drops extra keys", () => {
    expect(cleanAsking({ hour: 14, extra: 1, days: { kind: "chosen_weekdays", days: [4, 1, 4], x: 1 } })).toEqual({ hour: 14, days: { kind: "chosen_weekdays", days: [1, 4] } });
    expect(cleanAsking({ days: { kind: "weekdays" } })).toEqual({ hour: null, days: { kind: "weekdays" } });
    expect(cleanAsking({ hour: 0, days: { kind: "every_n_days", n: 90, from: "2026-12-01" } })).toEqual({ hour: 0, days: { kind: "every_n_days", n: 90, from: "2026-12-01" } });
    expect(cleanAsking({ hour: 23, days: { kind: "month_day", day: "last" } })).toEqual({ hour: 23, days: { kind: "month_day", day: "last" } });
  });
  it.each([
    ["a string", "daily"], ["an array", []], ["no days", { hour: 1 }], ["an unknown kind", { days: { kind: "hourly" } }],
    ["an hour of 24", { hour: 24, days: { kind: "every_day" } }], ["a fractional hour", { hour: 1.5, days: { kind: "every_day" } }], ["a text hour", { hour: "8", days: { kind: "every_day" } }],
    ["no weekdays", { days: { kind: "chosen_weekdays", days: [] } }], ["weekday 8", { days: { kind: "chosen_weekdays", days: [8] } }], ["weekday 0", { days: { kind: "chosen_weekdays", days: [0] } }],
    ["every 1 day", { days: { kind: "every_n_days", n: 1, from: "2026-12-01" } }], ["every 91 days", { days: { kind: "every_n_days", n: 91, from: "2026-12-01" } }],
    ["a starting day that is not a day", { days: { kind: "every_n_days", n: 3, from: "2026-02-30" } }], ["a starting day in 1999", { days: { kind: "every_n_days", n: 3, from: "1999-12-01" } }], ["no starting day", { days: { kind: "every_n_days", n: 3 } }],
    ["day 0", { days: { kind: "month_day", day: 0 } }], ["day 32", { days: { kind: "month_day", day: 32 } }], ["day 'first'", { days: { kind: "month_day", day: "first" } }],
  ])("refuses %s with a sentence", (_, v) => {
    expect(() => cleanAsking(v)).toThrow(/asking schedule is not valid/);
  });
});

describe("what the owner is told", () => {
  it("measures the longest gap between run days", () => {
    expect(longestGap({ kind: "every_day" })).toBe(1);
    expect(longestGap({ kind: "weekdays" })).toBe(3);
    expect(longestGap({ kind: "chosen_weekdays", days: [1, 4] })).toBe(4);
    expect(longestGap({ kind: "chosen_weekdays", days: [3] })).toBe(7);
    expect(longestGap({ kind: "every_n_days", n: 3, from: "2026-12-01" })).toBe(3);
    expect(longestGap({ kind: "month_day", day: 5 })).toBe(31);
  });
  it("warns about skipped periods and about Prompts after the Due Date", () => {
    const third: AskingSchedule = { hour: 14, days: { kind: "every_n_days", n: 3, from: "2026-12-01" } };
    expect(askingWarnings(third, ["day"], 3)).toEqual(["Metrics with a short period are asked for the last period only; the periods in between are not asked for."]);
    expect(askingWarnings(third, ["week", "month"], 3)).toEqual([]);
    expect(askingWarnings(third, ["week"], 1)).toEqual(["On this schedule a Prompt can reach people after the Due Date."]);
    expect(askingWarnings({ hour: null, days: { kind: "every_day" } }, ["day"], 0)).toEqual([]);
    expect(askingWarnings({ hour: null, days: { kind: "month_day", day: 5 } }, ["month"], 3)).toEqual(["On this schedule a Prompt can reach people after the Due Date."]);
  });
  it("says the days and the time in words", () => {
    expect(describeDays({ kind: "every_n_days", n: 3, from: "2026-12-01" })).toBe("every third day from 1 December 2026");
    expect(describeDays({ kind: "every_n_days", n: 2, from: "2026-12-01" })).toBe("every second day from 1 December 2026");
    expect(describeDays({ kind: "every_n_days", n: 5, from: "2026-12-01" })).toBe("every 5 days from 1 December 2026");
    expect(describeDays({ kind: "chosen_weekdays", days: [1, 4, 7] })).toBe("Monday, Thursday and Sunday");
    expect(describeDays({ kind: "chosen_weekdays", days: [2] })).toBe("every Tuesday");
    expect(describeDays({ kind: "month_day", day: 1 })).toBe("on the 1st of the month");
    expect(describeDays({ kind: "month_day", day: 2 })).toBe("on the 2nd of the month");
    expect(describeDays({ kind: "month_day", day: 13 })).toBe("on the 13th of the month");
    expect(describeDays({ kind: "month_day", day: 22 })).toBe("on the 22nd of the month");
    expect(describeDays({ kind: "month_day", day: "last" })).toBe("on the last day of the month");
    expect(describeDays({ kind: "weekdays" })).toBe("every weekday");
    expect(describeAsking({ hour: null, days: { kind: "every_day" } }, 8, "Europe/Berlin")).toBe("Runs every day at 08:00 (Europe/Berlin).");
    expect(describeAsking({ hour: 14, days: { kind: "weekdays" } }, 8, "America/Los_Angeles")).toBe("Runs every weekday at 14:00 (America/Los Angeles).");
  });
});
