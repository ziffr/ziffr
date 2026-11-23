// @ts-nocheck
// The calendar views' day rules (spec 0027, ticket #507): week and month days, where duties sit, arrow keys.
import { describe, expect, it } from "vitest";
import { addDays, addMonths, calendarSpan, inSpan, monthGrid, monthStartOf, moveDay, placeEntries, step, weekDays, weekStartOf, weekdayIndex } from "./schedule-calendar";

describe("weeks", () => {
  it("counts weekdays from the week's first day", () => {
    expect([weekdayIndex("2026-11-23"), weekdayIndex("2026-11-29"), weekdayIndex("2026-11-29", 0), weekdayIndex("2026-11-22", 0)]).toEqual([0, 6, 0, 0]);
  });
  it("starts the week on Monday or on Sunday", () => {
    expect(weekStartOf("2026-11-25")).toBe("2026-11-23");
    expect(weekStartOf("2026-11-29")).toBe("2026-11-23");
    expect(weekStartOf("2026-11-29", 0)).toBe("2026-11-29");
    expect(weekDays("2026-11-25", 0)[0]).toBe("2026-11-22");
  });
  it("always has seven consecutive days, across a clock change and a year end", () => {
    for (const day of ["2026-03-29", "2026-10-25", "2026-11-01", "2026-03-08", "2026-12-31", "2028-02-29"]) {
      const days = weekDays(day);
      expect(days).toHaveLength(7);
      expect(days).toContain(day);
      days.slice(1).forEach((d, i) => expect(d).toBe(addDays(days[i], 1)));
    }
  });
  it("adds days over month, year and leap day", () => {
    expect([addDays("2026-12-31", 1), addDays("2028-02-28", 1), addDays("2026-03-01", -1)]).toEqual(["2027-01-01", "2028-02-29", "2026-02-28"]);
  });
});

describe("months", () => {
  it("finds the first of a month and moves by months", () => {
    expect([monthStartOf("2026-11-21"), addMonths("2026-11-21", 1), addMonths("2026-12-15", 1), addMonths("2026-01-31", -1), addMonths("2026-01-31", 14)]).toEqual(["2026-11-01", "2026-12-01", "2027-01-01", "2025-12-01", "2027-03-01"]);
  });
  it("lays out whole weeks and marks the days of other months", () => {
    const grid = monthGrid("2026-11-21");
    expect(grid).toHaveLength(6);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[0][0]).toEqual({ date: "2026-10-26", inMonth: false });
    expect(grid[0][6]).toEqual({ date: "2026-11-01", inMonth: true });
    expect(grid[5][0]).toEqual({ date: "2026-11-30", inMonth: true });
    expect(grid[5][1]).toEqual({ date: "2026-12-01", inMonth: false });
    expect(monthGrid("2026-12-10")).toHaveLength(5);
  });
  it("needs only four weeks for a February that starts on the week's first day", () => {
    expect(monthGrid("2027-02-10")).toHaveLength(4);
  });
  it("needs six weeks when the month reaches into a sixth, and honours a Sunday start", () => {
    expect(monthGrid("2026-08-10")).toHaveLength(6);
    expect(monthGrid("2026-11-10", 0)[0][0].date).toBe("2026-11-01");
  });
});

describe("the span asked for", () => {
  it("starts at the week of today and is the core's longest", () => {
    expect(calendarSpan("2026-11-25")).toEqual({ from: "2026-11-23", to: "2027-02-20" });
    expect(calendarSpan("2026-11-25", 0).from).toBe("2026-11-22");
  });
  it("tells whether a day is inside it, ends included", () => {
    const span = { from: "2026-11-23", to: "2027-02-20" };
    expect([inSpan("2026-11-22", span), inSpan("2026-11-23", span), inSpan("2027-02-20", span), inSpan("2027-02-21", span)]).toEqual([false, true, true, false]);
  });
});

describe("where duties sit", () => {
  const e = (date: string | null, name: string) => ({ date, name });
  it("puts dated ones on their day and overdue ones on today with their own date", () => {
    const placed = placeEntries({
      today: "2026-11-25",
      overdue: [e("2026-11-16", "late"), e("2026-11-20", "later")],
      days: [{ date: "2026-11-25", entries: [e("2026-11-25", "now")] }, { date: "2026-11-27", entries: [e("2026-11-27", "soon")] }],
    });
    expect(placed.get("2026-11-25")!.map((p) => [p.entry.name, p.originalDate])).toEqual([["now", null], ["late", "2026-11-16"], ["later", "2026-11-20"]]);
    expect(placed.get("2026-11-27")).toHaveLength(1);
    expect(placed.get("2026-11-26")).toBeUndefined();
  });
  it("places overdue ones on today when nothing else is", () => {
    expect(placeEntries({ today: "2026-11-25", overdue: [e("2026-11-01", "x")], days: [] }).size).toBe(1);
  });
});

describe("arrow keys and steps", () => {
  const span = { from: "2026-11-23", to: "2027-02-20" };
  it("moves a day or a week and stays inside the span", () => {
    expect([moveDay("2026-11-25", "ArrowRight", span), moveDay("2026-11-25", "ArrowLeft", span), moveDay("2026-11-25", "ArrowDown", span), moveDay("2026-11-30", "ArrowUp", span)]).toEqual(["2026-11-26", "2026-11-24", "2026-12-02", "2026-11-23"]);
    expect(moveDay("2026-11-23", "ArrowLeft", span)).toBe("2026-11-23");
    expect(moveDay("2027-02-20", "ArrowRight", span)).toBe("2027-02-20");
  });
  it("ignores other keys", () => {
    expect(moveDay("2026-11-25", "Enter", span)).toBeNull();
  });
  it("steps a week or a month while the span has it", () => {
    expect(step("week", "2026-11-25", 1, span)).toBe("2026-12-02");
    expect(step("week", "2026-11-25", -1, span)).toBeNull();
    expect(step("week", "2027-02-17", 1, span)).toBeNull();
    expect(step("week", "2027-02-10", 1, span)).toBe("2027-02-17");
    expect(step("month", "2026-11-25", 1, span)).toBe("2026-12-01");
    expect(step("month", "2026-12-10", -1, span)).toBe("2026-11-01");
    expect(step("month", "2026-11-25", -1, span)).toBeNull();
    expect(step("month", "2027-02-10", 1, span)).toBeNull();
  });
  it("lets a Sunday-start week step too", () => {
    expect(step("week", "2026-11-25", 1, span, 0)).toBe("2026-12-02");
  });
});
