// @ts-nocheck
// Reading a search (ticket #412; GLOSSARY: Period, Answer Languages): the words that name something and the period words.
import { describe, expect, it } from "vitest";
import type { YearStart } from "./periods";
import { fold, MAX_PERIODS, MAX_QUERY, MAX_TERMS, nameScore, parseSearchQuery, recordTerms } from "./search-query";

const read = (q: unknown, languages = ["en", "de"], yearStart: YearStart = 1) => parseSearchQuery(q, "2026-11-20", yearStart, languages);

describe("parseSearchQuery", () => {
  it("separates the name from a month and year, in English and German", () => {
    expect(read("churn march 2026")).toEqual({ all: ["churn", "march", "2026"], name: ["churn"], periods: [{ span: "month", start: "2026-03-01" }] });
    expect(read("Umsatz März 2026").periods).toEqual([{ span: "month", start: "2026-03-01" }]);
    expect(read("Umsatz März 2026").name).toEqual(["umsatz"]);
  });
  it("reads quarters, weeks and relative words", () => {
    expect(read("revenue Q3 2026").periods).toEqual([{ span: "quarter", start: "2026-07-01" }]);
    expect(read("besuche KW 46").periods).toEqual([{ span: "week", start: "2026-11-09" }]);
    expect(read("besuche KW 46").name).toEqual(["besuche"]);
    expect(read("visits last week").periods).toEqual([{ span: "week", start: "2026-11-09" }]);
  });
  it("follows the Workspace's languages and year start", () => {
    // Without German, "März" is a word of the name and only the year is a period.
    expect(read("umsatz märz 2026", ["en"])).toMatchObject({ name: ["umsatz", "marz"], periods: [{ span: "year", start: "2026-01-01" }] });
    expect(read("revenue Q1 2026", ["en"], 4).periods[0].start).toBe("2026-04-01");
  });
  it("leaves words that only look like a period in the name", () => {
    const q = read("week 60 report");
    expect(q.periods).toEqual([]);
    expect(q.name).toEqual([]);
    expect(q.all).toEqual(["week", "60", "report"]);
  });
  it("has no words or periods for anything but text", () => {
    for (const x of [undefined, null, 5, {}, "", "   "]) expect(read(x)).toEqual({ all: [], name: [], periods: [] });
  });
  it("is bounded", () => {
    expect(read("a".repeat(MAX_QUERY * 3)).all[0]).toHaveLength(MAX_QUERY);
    expect(read(Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ")).all).toHaveLength(MAX_TERMS);
    expect(read("x Q1 2026 Q2 2026 Q3 2026 Q4 2026").periods).toHaveLength(MAX_PERIODS);
  });
});

describe("nameScore", () => {
  it("is null unless every word is in the name, ignoring case and accents", () => {
    expect(nameScore("Churn rate", ["churn", "rate"])).toBe(0);
    expect(nameScore("Churn rate", ["churn", "x"])).toBeNull();
    expect(nameScore("Café visits", [fold("cafe")])).toBe(0);
    expect(nameScore("x", [])).toBeNull();
  });
  it("ranks a start of the name before a start of a word before the middle", () => {
    expect(nameScore("Monthly churn", ["churn"])).toBe(1);
    expect(nameScore("Monthly Xchurn", ["churn"])).toBe(2);
  });
});

describe("recordTerms", () => {
  it("drops the words that only ask to record a value, and keeps the Metric's", () => {
    expect(recordTerms(["record", "a", "value", "for", "churn"])).toEqual({ asked: true, terms: ["churn"] });
    expect(recordTerms(["enter", "visits"])).toEqual({ asked: true, terms: ["visits"] });
    expect(recordTerms(["record"])).toEqual({ asked: true, terms: [] });
  });
  it("uses every word as the Metric's name when nothing asks to record", () => {
    expect(recordTerms(["a", "value", "churn"])).toEqual({ asked: false, terms: ["a", "value", "churn"] });
  });
});
