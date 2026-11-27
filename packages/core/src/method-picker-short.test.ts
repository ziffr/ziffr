// How close a Method is (GLOSSARY: Method, Metric): the count in the Metric's period, and a day only where it is certain.
import { describe, expect, it } from "vitest";
import { entryOf, type EntryId } from "./method-picker";
import { periodsShort, type CanvasFact } from "./method-picker-fit";
import { readyDay, shortWords, type History } from "./method-picker-short";
import { JANUARY } from "./periods";

const TODAY = "2026-11-27";
const fact = (id: number, name: string, over: Partial<CanvasFact> = {}): CanvasFact => ({ id, name, period: "day", aggregation: "sum", periods: 1, hasTarget: false, breakdownLatest: false, breakdownBefore: false, builtFrom: [], ...over });
const words = (id: EntryId, canvas: CanvasFact[], history: History = { starts: [TODAY], derived: false }) => {
  const entry = entryOf(id)!;
  return shortWords(entry, periodsShort(entry, canvas)!, canvas, history, JANUARY, TODAY);
};

describe("the day a Metric is ready", () => {
  it("counts the next days from today's value, or from today where yesterday's is the latest", () => {
    expect(readyDay([TODAY], 4, "day", JANUARY, TODAY)).toBe("2026-11-30");
    expect(readyDay(["2026-11-26"], 4, "day", JANUARY, TODAY)).toBe("2026-11-29");
    expect(readyDay([], 2, "day", JANUARY, TODAY)).toBe("2026-11-28");
  });
  it("names the last day of the last week or month needed", () => {
    expect(readyDay(["2026-11-23"], 3, "week", JANUARY, TODAY)).toBe("2026-12-13");
    expect(readyDay(["2026-10-01"], 3, "month", JANUARY, TODAY)).toBe("2026-12-31");
  });
  it("says nothing with a gap, an old latest value, a value ahead or nothing missing", () => {
    expect(readyDay(["2026-11-24", TODAY], 4, "day", JANUARY, TODAY)).toBeNull();
    expect(readyDay(["2026-11-20"], 4, "day", JANUARY, TODAY)).toBeNull();
    expect(readyDay(["2026-11-28"], 4, "day", JANUARY, TODAY)).toBeNull();
    expect(readyDay([TODAY], 1, "day", JANUARY, TODAY)).toBeNull();
  });
});

describe("the line in place of not now", () => {
  it("says the count and the day for one Metric", () => {
    expect(words("usual", [fact(1, "Steps")])).toMatch(/^1 of \d+ days\. Ready on .+ if you add one each day\.$/);
    expect(words("forecast", [fact(1, "Steps", { period: "month" })], { starts: ["2026-11-01"], derived: false })).toMatch(/^1 of \d+ months\. Ready by .+ if you add one each month\.$/);
  });
  it("says only how many are missing for a calculated Metric, a gap, a date question, a missing Target Range and several Metrics", () => {
    const plain = /^1 of \d+ days\. \d+ more needed\.$/;
    expect(words("usual", [fact(1, "Steps")], { starts: [TODAY], derived: true })).toMatch(plain);
    expect(words("usual", [fact(1, "Steps")], { starts: ["2026-11-01"], derived: false })).toMatch(plain);
    expect(words("after-date", [fact(1, "Steps")])).toMatch(plain);
    expect(words("reach-target", [fact(1, "Steps")])).toMatch(plain);
    expect(words("correlation", [fact(1, "Steps"), fact(2, "Sleep", { periods: 400 })])).toMatch(/^Steps has 1 of \d+ days\. \d+ more needed\.$/);
  });
  it("is not given where an entry can run or the canvas holds too few Metrics", () => {
    expect(periodsShort(entryOf("usual")!, [fact(1, "Steps", { periods: 400 })])).toBeNull();
    expect(periodsShort(entryOf("correlation")!, [fact(1, "Steps")])).toBeNull();
  });
});
