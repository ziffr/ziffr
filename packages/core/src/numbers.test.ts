import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs, valueText } from "./test/reference/check";
import { exactOf, isNearestDouble, roundedText } from "./test/reference/exact";
import { referenceNumber } from "./test/reference/write";
import { ANSWER_LANGUAGES, findPeriodWords, numbersIn, readAnswer, readNumber, type AnswerReading, type AnswerWords } from "./numbers";
import { answerLanguagesForCountry, checkAnswerLanguages, monthFirstIn } from "./numbers/languages";
import { NUMBER_STYLES, type NumberStyle } from "./number-style";
import { parseBreakdown } from "./parse";
import { shiftPeriod, type YearStart } from "./periods";
import { parseSeriesLine } from "./series-lines";
import type { Period } from "./types";

// Spec 0022, Testing Decisions, "Reading": one table of texts with their value in each Number Style, run against the
// reader and every caller, so no two places read the same text differently. Columns: 1,234.5 | 1.234,5 | 1 234,5 |
// 1'234.5. `rows: false` for texts a pasted row never holds (a value in millions).
type Row = { text: string; values: [number | null, number | null, number | null, number | null]; rows?: false };
const all = (v: number | null): Row["values"] => [v, v, v, v];
const READING: Row[] = [
  { text: "12", values: all(12) },
  { text: "1,5", values: all(1.5) },
  { text: "12,50", values: all(12.5) },
  { text: "0,5", values: all(0.5) },
  { text: "1,2345", values: all(1.2345) },
  { text: "0,500", values: all(0.5) },
  { text: "1.500", values: [1.5, 1500, 1500, 1.5] },
  { text: "1,500", values: [1500, 1.5, 1.5, 1500] },
  { text: "126,657", values: [126657, 126.657, 126.657, 126657] },
  { text: "1.234,5", values: all(1234.5) },
  { text: "1,234.5", values: all(1234.5) },
  { text: "1'234.5", values: all(1234.5) },
  { text: "1’234.5", values: all(1234.5) },
  { text: "1 234,5", values: all(1234.5) },
  { text: "1 234,5", values: all(1234.5) },
  { text: "1 234,5", values: all(1234.5) },
  { text: "1.234.567", values: all(1234567) },
  { text: "1,234,567", values: all(1234567) },
  { text: "12.345,67", values: all(12345.67) },
  { text: "1 000 000", values: all(1000000) },
  { text: "2,5k", values: all(2500) },
  { text: "1.1k", values: all(1100) },
  { text: "1.2M", values: all(1200000), rows: false },
  { text: "−5", values: all(-5) },
  { text: "-5", values: all(-5) },
  { text: "+5", values: all(5) },
  { text: "-0", values: all(0) },
  // k after a space, and k moving the point inside the fraction.
  { text: "2,5 k", values: all(2500) },
  { text: "1.2345k", values: all(1234.5) },
  // A first group of four, or a mark beside another kind, is no group of thousands: the mark is the decimal.
  { text: "1234.567", values: all(1234.567) },
  { text: "1234,567", values: all(1234.567) },
  { text: "1 234,567", values: all(1234.567) },
  { text: "1'234.567", values: all(1234.567) },
  // Any space groups like a plain one, either apostrophe like the other; the groups still must be three digits.
  { text: "1 234 567", values: all(1234567) },
  { text: "1’234'567", values: all(1234567) },
  { text: "1 23", values: all(null) },
  { text: "1’23", values: all(null) },
  { text: "1234.567.890", values: all(null) },
  { text: "1.234.56", values: all(null) },
  { text: "1e3", values: all(null) },
  { text: "1,23,4", values: all(null) },
  { text: "1.234,5.6", values: all(null) },
  { text: "12,34.5", values: all(null) },
  { text: "9".repeat(400), values: all(null) },
  { text: "10000000000000000", values: all(null) },
  { text: "no idea", values: all(null) },
];

const TODAY = "2026-11-18"; // a Wednesday in ISO week 47
const APRIL: YearStart = 4;
const at = (period: Period, promptPeriod?: string) => ({ style: "1,234.5" as NumberStyle, today: TODAY, period, yearStart: APRIL, promptPeriod });

describe("readNumber and every caller read a text the same way", () => {
  NUMBER_STYLES.forEach((style, i) => {
    describe(`in ${style}`, () => {
      it.each(READING.map((r) => [r.text, r.values[i], r] as const))("%s → %s", (text, expected, row) => {
        expect(readNumber(text, style)).toBe(expected);
        // A message, a reply by email, Slack or Telegram, the form: all read as an answer.
        const answer = readAnswer(text, { ...at("week"), style });
        expect(answer.ok ? answer.value : null).toBe(expected);
        if (row.rows === false) return;
        // A pasted breakdown, and a pasted or typed Target Series row.
        expect(parseBreakdown(`Germany\t${text}\nAustria\t1`, style)?.rows[0].value ?? null).toBe(expected);
        expect(parseSeriesLine(`2026-12\t${text}`, "month", APRIL, style)?.value ?? null).toBe(expected);
      });
    });
  });

  it("finds the one number left in a sentence, never digits that are part of a word", () => {
    expect(numbersIn("2nd place, 3x faster, v2, B2B, COVID-19, 1e3", "1,234.5")).toEqual([]);
    expect(numbersIn("2 signups and 1 cancellation", "1,234.5").map((n) => n.value)).toEqual([2, 1]);
    expect(numbersIn("3-4", "1,234.5").map((n) => n.value)).toEqual([3, 4]);
    expect(numbersIn("Umsatz: 4,75 Mio", "1.234,5").map((n) => n.value)).toEqual([4.75]);
    expect(numbersIn("it was 12.", "1,234.5").map((n) => n.value)).toEqual([12]);
    expect(numbersIn("we had 12 signups", "1,234.5")).toEqual([{ from: 7, to: 9, text: "12", value: 12 }]);
  });

  it("reads a number with spaces around it", () => {
    for (const style of NUMBER_STYLES) expect(readNumber(" 12 ", style)).toBe(12);
  });
});

// Spec 0022, Testing Decisions, "Sentences": answers with the value and period readAnswer must find, or the reason it
// asks back, for a weekly, monthly, quarterly and yearly Metric, today 18 Nov 2026 and a Fiscal Year from April.
// Weeks: this 2026-11-16, last 2026-11-09. Quarters: Q3 FY 2026/27 is 2026-10-01. Years: FY 2026/27 is 2026-04-01.
type Expect = { value: number; period: string } | { ask: Exclude<AnswerReading, { ok: true }>["reason"] };
// Each row is read in English and its own language, as a Workspace whose country speaks it does by default.
type Sentence = { lang: string; text: string; style?: NumberStyle; prompt?: "last" | "this"; monthFirst?: boolean; week: Expect; month: Expect; quarter: Expect; year: Expect };
const v = (value: number, period: string) => ({ value, period });
const ask = (reason: Exclude<AnswerReading, { ok: true }>["reason"]) => ({ ask: reason });
const NOT = ask("not_a_period_of_metric");
const now = (value: number) => ({ week: v(value, "2026-11-16"), month: v(value, "2026-11-01"), quarter: v(value, "2026-10-01"), year: v(value, "2026-04-01") });
const SENTENCES: Sentence[] = [
  { lang: "en", text: "we had 2 signups last week", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "en", text: "in week 46 we had 2 signups", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "de", text: "KW 46: 2", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "de", text: "46. KW: 2", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "de", text: "wir hatten letzte Woche 2 Anmeldungen", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "de", text: "in der letzten Woche 2", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "en", text: "2 signups, 1 churn", week: ask("several_numbers"), month: ask("several_numbers"), quarter: ask("several_numbers"), year: ask("several_numbers") },
  { lang: "en", text: "Q3 revenue 4500", week: NOT, month: NOT, quarter: v(4500, "2026-10-01"), year: NOT },
  { lang: "en", text: "Q3 FY 2026/27: 4500", week: NOT, month: NOT, quarter: v(4500, "2026-10-01"), year: NOT },
  { lang: "en", text: "Q2 4500", week: NOT, month: NOT, quarter: v(4500, "2026-07-01"), year: NOT },
  { lang: "de", text: "3. Quartal: 4500", week: NOT, month: NOT, quarter: v(4500, "2026-10-01"), year: NOT },
  { lang: "en", text: "October: 12,5", week: NOT, month: v(12.5, "2026-10-01"), quarter: NOT, year: NOT },
  { lang: "de", text: "im Oktober 12,5", week: NOT, month: v(12.5, "2026-10-01"), quarter: NOT, year: NOT },
  { lang: "de", text: "letzten Monat 1.500", style: "1.234,5", week: NOT, month: v(1500, "2026-10-01"), quarter: NOT, year: NOT },
  { lang: "en", text: "last month 1.500", style: "1,234.5", week: NOT, month: v(1.5, "2026-10-01"), quarter: NOT, year: NOT },
  { lang: "en", text: "2026: 1500", week: NOT, month: NOT, quarter: NOT, year: v(1500, "2026-04-01") },
  { lang: "en", text: "FY 2026/27: 9", week: NOT, month: NOT, quarter: NOT, year: v(9, "2026-04-01") },
  { lang: "en", text: "yesterday 340 pc", ...now(340) },
  { lang: "de", text: "gestern 340 Stk", ...now(340) },
  { lang: "en", text: "we closed 3 today", ...now(3) },
  { lang: "de", text: "12.11.: 4", week: v(4, "2026-11-09"), month: v(4, "2026-11-01"), quarter: v(4, "2026-10-01"), year: v(4, "2026-04-01") },
  { lang: "en", text: "12 Nov: 4", week: v(4, "2026-11-09"), month: v(4, "2026-11-01"), quarter: v(4, "2026-10-01"), year: v(4, "2026-04-01") },
  { lang: "en", text: "Nov 12th: 4", week: v(4, "2026-11-09"), month: v(4, "2026-11-01"), quarter: v(4, "2026-10-01"), year: v(4, "2026-04-01") },
  { lang: "en", text: "2026-11-12 4", week: v(4, "2026-11-09"), month: v(4, "2026-11-01"), quarter: v(4, "2026-10-01"), year: v(4, "2026-04-01") },
  { lang: "de", text: "12.11.2026: 4", week: v(4, "2026-11-09"), month: v(4, "2026-11-01"), quarter: v(4, "2026-10-01"), year: v(4, "2026-04-01") },
  // A reply to last week's Prompt that names this week.
  { lang: "en", text: "this week 3", prompt: "last", week: ask("other_period"), month: NOT, quarter: NOT, year: NOT },
  { lang: "de", text: "diese Woche 3", prompt: "this", week: v(3, "2026-11-16"), month: NOT, quarter: NOT, year: NOT },
  // A Prompt's period applies when the answer names none.
  { lang: "en", text: "3", prompt: "last", week: v(3, "2026-11-09"), month: v(3, "2026-10-01"), quarter: v(3, "2026-07-01"), year: v(3, "2025-04-01") },
  // Periods still to come.
  { lang: "en", text: "December 2026: 5", week: NOT, month: ask("future_period"), quarter: NOT, year: NOT },
  { lang: "de", text: "Dezember 2026: 5", week: NOT, month: ask("future_period"), quarter: NOT, year: NOT },
  { lang: "en", text: "week 50 2026: 5", week: ask("future_period"), month: NOT, quarter: NOT, year: NOT },
  { lang: "en", text: "Q4 2026: 5", week: NOT, month: NOT, quarter: ask("future_period"), year: NOT },
  { lang: "en", text: "2027: 5", week: NOT, month: NOT, quarter: NOT, year: ask("future_period") },
  // A month named without a year is the latest that has begun: December is last December.
  { lang: "en", text: "December: 5", week: NOT, month: v(5, "2025-12-01"), quarter: NOT, year: NOT },
  // A year (#126): on its own beside another period it is the value; written right after a period with nothing else
  // in the answer it could be its year or the value, so it asks back; with another number it is the period's year.
  { lang: "en", text: "KW 46: 2050", week: v(2050, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "en", text: "2050 visits in KW 46", week: v(2050, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "de", text: "Oktober 2026: 2026", week: NOT, month: v(2026, "2026-10-01"), quarter: NOT, year: NOT },
  { lang: "en", text: "KW 46 2050 visits", week: ask("year_or_value"), month: NOT, quarter: NOT, year: NOT },
  { lang: "en", text: "week 46 2025", week: ask("year_or_value"), month: NOT, quarter: NOT, year: NOT },
  { lang: "en", text: "November 2025", week: NOT, month: ask("year_or_value"), quarter: NOT, year: NOT },
  { lang: "en", text: "Q3 2026", week: NOT, month: NOT, quarter: ask("year_or_value"), year: NOT },
  { lang: "en", text: "Q3 FY 2026", week: NOT, month: NOT, quarter: ask("no_number"), year: NOT },
  { lang: "en", text: "Nov 2025 4500", week: NOT, month: v(4500, "2025-11-01"), quarter: NOT, year: NOT },
  { lang: "en", text: "2026 revenue 4500", week: NOT, month: NOT, quarter: NOT, year: v(4500, "2026-04-01") },
  // Two periods, or one that does not exist.
  { lang: "en", text: "last week or yesterday 3", week: ask("several_periods"), month: ask("several_periods"), quarter: ask("several_periods"), year: ask("several_periods") },
  { lang: "en", text: "last week (week 46): 2", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "en", text: "week 60: 3", week: ask("no_such_period"), month: ask("no_such_period"), quarter: ask("no_such_period"), year: ask("no_such_period") },
  // Words that are not period words, and digits that are part of a word.
  { lang: "en", text: "we may have 3", ...now(3) },
  { lang: "en", text: "2nd place, 3 deals", ...now(3) },
  { lang: "en", text: "v2 launch: 5", ...now(5) },
  { lang: "en", text: "COVID-19 cases: 4", ...now(4) },
  { lang: "en", text: "one of our customers", week: ask("no_number"), month: ask("no_number"), quarter: ask("no_number"), year: ask("no_number") },
  { lang: "en", text: "3-4", week: ask("several_numbers"), month: ask("several_numbers"), quarter: ask("several_numbers"), year: ask("several_numbers") },
  { lang: "en", text: "€1,200 this month", week: NOT, month: v(1200, "2026-11-01"), quarter: NOT, year: NOT },
  { lang: "de", text: "KW46/2026: 2", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "en", text: "Q3/26 4500", week: NOT, month: NOT, quarter: v(4500, "2026-10-01"), year: NOT },
  { lang: "en", text: "May 2026: 7", week: NOT, month: v(7, "2026-05-01"), quarter: NOT, year: NOT },
  // A date with a slash is day first, or month first where the country writes it so (the US).
  { lang: "en", text: "12/11: 4", week: v(4, "2026-11-09"), month: v(4, "2026-11-01"), quarter: v(4, "2026-10-01"), year: v(4, "2026-04-01") },
  { lang: "en", text: "11/12: 4", monthFirst: true, week: v(4, "2026-11-09"), month: v(4, "2026-11-01"), quarter: v(4, "2026-10-01"), year: v(4, "2026-04-01") },
  { lang: "en", text: "11/12/2026: 4", monthFirst: true, week: v(4, "2026-11-09"), month: v(4, "2026-11-01"), quarter: v(4, "2026-10-01"), year: v(4, "2026-04-01") },
  { lang: "en", text: "10/2026: 5", week: NOT, month: v(5, "2026-10-01"), quarter: NOT, year: NOT },
  { lang: "en", text: "12th of November: 4", week: v(4, "2026-11-09"), month: v(4, "2026-11-01"), quarter: v(4, "2026-10-01"), year: v(4, "2026-04-01") },
  // French.
  { lang: "fr", text: "la semaine dernière nous avons eu 2 inscriptions", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "fr", text: "semaine 46 : 2", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "fr", text: "T3 : 4500", week: NOT, month: NOT, quarter: v(4500, "2026-10-01"), year: NOT },
  { lang: "fr", text: "3e trimestre : 4500", week: NOT, month: NOT, quarter: v(4500, "2026-10-01"), year: NOT },
  { lang: "fr", text: "octobre : 12,5", week: NOT, month: v(12.5, "2026-10-01"), quarter: NOT, year: NOT },
  { lang: "fr", text: "le mois dernier 1 234,5", style: "1 234,5", week: NOT, month: v(1234.5, "2026-10-01"), quarter: NOT, year: NOT },
  { lang: "fr", text: "aujourd'hui 3", ...now(3) },
  { lang: "fr", text: "12 novembre : 4", week: v(4, "2026-11-09"), month: v(4, "2026-11-01"), quarter: v(4, "2026-10-01"), year: v(4, "2026-04-01") },
  { lang: "fr", text: "décembre 2026 : 5", week: NOT, month: ask("future_period"), quarter: NOT, year: NOT },
  // Spanish.
  { lang: "es", text: "la semana pasada tuvimos 2 altas", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "es", text: "T3: 4500", week: NOT, month: NOT, quarter: v(4500, "2026-10-01"), year: NOT },
  { lang: "es", text: "el mes pasado 7", week: NOT, month: v(7, "2026-10-01"), quarter: NOT, year: NOT },
  { lang: "es", text: "12 de noviembre: 4", week: v(4, "2026-11-09"), month: v(4, "2026-11-01"), quarter: v(4, "2026-10-01"), year: v(4, "2026-04-01") },
  { lang: "es", text: "octubre de 2026: 5", week: NOT, month: v(5, "2026-10-01"), quarter: NOT, year: NOT },
  { lang: "es", text: "ayer 340", ...now(340) },
  // Italian.
  { lang: "it", text: "la settimana scorsa 2 iscrizioni", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "it", text: "ottobre: 12,5", week: NOT, month: v(12.5, "2026-10-01"), quarter: NOT, year: NOT },
  { lang: "it", text: "3° trimestre: 4500", week: NOT, month: NOT, quarter: v(4500, "2026-10-01"), year: NOT },
  { lang: "it", text: "ieri 340", ...now(340) },
  // "set" is September in Italian, and an English word: alone it names no month.
  { lang: "it", text: "we set up 3 meetings", ...now(3) },
  // Dutch.
  { lang: "nl", text: "vorige week 2 aanmeldingen", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "nl", text: "week 46: 2", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  { lang: "nl", text: "Q3 4500", week: NOT, month: NOT, quarter: v(4500, "2026-10-01"), year: NOT },
  { lang: "nl", text: "oktober: 12,5", week: NOT, month: v(12.5, "2026-10-01"), quarter: NOT, year: NOT },
  { lang: "nl", text: "gisteren 340", ...now(340) },
  // A year on its own is the value, not the period.
  { lang: "en", text: "2026", ...now(2026) },
  { lang: "en", text: "Q3", week: NOT, month: NOT, quarter: ask("no_number"), year: NOT },
  // A date is never a year with the value before it, nor a year alone.
  { lang: "en", text: "2026-11-12", week: ask("no_number"), month: ask("no_number"), quarter: ask("no_number"), year: ask("no_number") },
  { lang: "en", text: "12 November 2025", week: ask("no_number"), month: ask("no_number"), quarter: ask("no_number"), year: ask("no_number") },
  // A Fiscal Year written after a quarter is its year, not a value.
  { lang: "en", text: "Q3 2026/27", week: NOT, month: NOT, quarter: ask("no_number"), year: NOT },
  // Any run of spaces between a period and a year.
  { lang: "en", text: "week 46  2025", week: ask("year_or_value"), month: NOT, quarter: NOT, year: NOT },
  // Only a year by itself beside other period words is the value: "2026/27" and "FY 2026" are periods.
  { lang: "en", text: "2026/27 and last week", week: ask("several_periods"), month: ask("several_periods"), quarter: ask("several_periods"), year: ask("several_periods") },
  { lang: "en", text: "FY 2026 or last week: 3", week: ask("several_periods"), month: ask("several_periods"), quarter: ask("several_periods"), year: ask("several_periods") },
  { lang: "en", text: "2026 2027", week: ask("several_periods"), month: ask("several_periods"), quarter: ask("several_periods"), year: ask("several_periods") },
  // Both period words are blanked out, so the digits of the second are not a number.
  { lang: "en", text: "2 signups last week (week 46)", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
  // Two words name one period when they fall in the same one of the Metric's; two that are not its periods are two.
  { lang: "en", text: "yesterday (this week): 3", week: v(3, "2026-11-16"), month: ask("several_periods"), quarter: ask("several_periods"), year: ask("several_periods") },
  { lang: "en", text: "Q2 or Q3: 4500", week: ask("several_periods"), month: ask("several_periods"), quarter: ask("several_periods"), year: ask("several_periods") },
  { lang: "en", text: "today or last week: 3", week: ask("several_periods"), month: ask("several_periods"), quarter: ask("several_periods"), year: ask("several_periods") },
  // Month forms added by hand.
  { lang: "en", text: "Sept: 5", week: NOT, month: v(5, "2026-09-01"), quarter: NOT, year: NOT },
  { lang: "de", text: "Jänner: 5", week: NOT, month: v(5, "2026-01-01"), quarter: NOT, year: NOT },
  // A month and a number with a dot after it is a month and a value, not a date ("12." is no ordinal after a month).
  { lang: "de", text: "im Oktober 12.", week: NOT, month: v(12, "2026-10-01"), quarter: NOT, year: NOT },
  // Dates with a year other than this one.
  { lang: "en", text: "November 12th, 2025: 4", week: v(4, "2025-11-10"), month: v(4, "2025-11-01"), quarter: v(4, "2025-10-01"), year: v(4, "2025-04-01") },
  { lang: "en", text: "November 12, 2025: 4", week: v(4, "2025-11-10"), month: v(4, "2025-11-01"), quarter: v(4, "2025-10-01"), year: v(4, "2025-04-01") },
  { lang: "de", text: "12.11.2025: 4", week: v(4, "2025-11-10"), month: v(4, "2025-11-01"), quarter: v(4, "2025-10-01"), year: v(4, "2025-04-01") },
  // Days, months and weeks that do not exist.
  { lang: "de", text: "5.13.2026: 4", week: ask("no_such_period"), month: ask("no_such_period"), quarter: ask("no_such_period"), year: ask("no_such_period") },
  { lang: "en", text: "0026-11-12: 4", week: ask("no_such_period"), month: ask("no_such_period"), quarter: ask("no_such_period"), year: ask("no_such_period") },
  { lang: "en", text: "week 0: 3", week: ask("no_such_period"), month: ask("no_such_period"), quarter: ask("no_such_period"), year: ask("no_such_period") },
];

describe("readAnswer reads sentences", () => {
  for (const period of ["week", "month", "quarter", "year"] as const) {
    describe(`for a ${period}ly Metric`, () => {
      it.each(SENTENCES.map((s) => [s.text, s] as const))("%s", (_, s) => {
        const current = { week: "2026-11-16", month: "2026-11-01", quarter: "2026-10-01", year: "2026-04-01" }[period];
        const promptPeriod = s.prompt === "last" ? shiftPeriod(current, period, -1) : s.prompt === "this" ? current : undefined;
        const r = readAnswer(s.text, { ...at(period, promptPeriod), style: s.style ?? "1,234.5", languages: [...new Set(["en", "de", s.lang])], monthFirst: s.monthFirst });
        const e = s[period];
        if ("ask" in e) expect(r.ok ? r : r.reason).toBe(e.ask);
        else expect(r.ok ? { value: r.value, period: r.period } : r).toEqual(e);
      });
    });
  }

  it("names what it found when it asks back", () => {
    expect(readAnswer("2 signups, 1 churn", at("week"))).toMatchObject({ reason: "several_numbers", numbers: ["2", "1"] });
    expect(readAnswer("this week 3", at("week", "2026-11-09"))).toMatchObject({ reason: "other_period", period: "2026-11-16", promptPeriod: "2026-11-09", named: { text: "this week" } });
    expect(readAnswer("Q3 revenue 4500", at("month"))).toMatchObject({ reason: "not_a_period_of_metric", named: { text: "Q3", span: "quarter", start: "2026-10-01" } });
    expect(readAnswer("1,23,4 signups", at("week"))).toEqual({ ok: false, reason: "unreadable_number", text: "1,23,4" });
  });

  it("reads only the languages it is given", () => {
    expect(readAnswer("letzte Woche 2", { ...at("week"), languages: ["en"] })).toMatchObject({ ok: true, value: 2, period: "2026-11-16" });
    expect(readAnswer("letzte Woche 2", { ...at("week"), languages: ["xx"] })).toMatchObject({ ok: true, value: 2, period: "2026-11-16" });
  });

  it("has rows for every language with a word file", () => {
    for (const code of Object.keys(ANSWER_LANGUAGES)) expect(SENTENCES.some((s) => s.lang === code), code).toBe(true);
  });

  it("has no word that two languages read as different periods", () => {
    // What each word names: a month by number, "this" or "last" with a span, or a numbered span.
    const meanings = (code: string) => {
      const w = ANSWER_LANGUAGES[code];
      const m = new Map<string, string>();
      const add = (word: string, meaning: string) => m.set(word.toLowerCase(), meaning);
      [w.fromIntl.months, w.byHand.months].forEach((months) => months.forEach((forms, i) => forms.forEach((f) => add(f, `month ${i + 1}`))));
      for (const [unit, r] of Object.entries(w.fromIntl.relative)) for (const [which, words] of Object.entries(r)) words.forEach((x) => add(x, `${which} ${unit}`));
      for (const [unit, r] of Object.entries(w.byHand.relative)) for (const [which, words] of Object.entries(r ?? {})) (words ?? []).forEach((x) => add(x, `${which} ${unit}`));
      for (const span of ["week", "quarter", "half"] as const) [...w.byHand[span].before, ...w.byHand[span].after].forEach((x) => add(x, `numbered ${span}`));
      w.byHand.fiscalYear.forEach((x) => add(x, "fiscal year"));
      return m;
    };
    const codes = Object.keys(ANSWER_LANGUAGES);
    const clashes: string[] = [];
    for (const a of codes) for (const b of codes) {
      if (a >= b) continue;
      const mb = meanings(b);
      for (const [word, meaning] of meanings(a)) if (mb.has(word) && mb.get(word) !== meaning) clashes.push(`${a}/${b} "${word}": ${meaning} or ${mb.get(word)}`);
    }
    expect(clashes).toEqual([]);
  });
});

describe("Answer Languages", () => {
  it("default to English plus the country's languages, and take only known ones", () => {
    expect(answerLanguagesForCountry(null)).toEqual(["en"]);
    expect(answerLanguagesForCountry("US")).toEqual(["en"]);
    expect(answerLanguagesForCountry("DE")).toEqual(["en", "de"]);
    expect(answerLanguagesForCountry("CH")).toEqual(["en", "de", "fr", "it"]);
    expect(answerLanguagesForCountry("BE")).toEqual(["en", "nl", "fr"]);
    expect(monthFirstIn("US")).toBe(true);
    expect(monthFirstIn("GB")).toBe(false);
    expect(checkAnswerLanguages(["fr", "en", "fr"])).toEqual(["en", "fr"]);
    expect(checkAnswerLanguages(Array(20).fill("en"))).toEqual(["en"]);
    // ["en"] is not a code, though it reads as one as a property name.
    for (const bad of [[], ["xx"], ["en", "xx"], "en", null, [1], [["en"]], [["en"], "en"], Array(21).fill("en")]) expect(checkAnswerLanguages(bad)).toBeNull();
  });
  it("name English once for every country", () => {
    for (const c of ["DE", "AT", "LI", "FR", "MC", "ES", "MX", "AR", "IT", "SM", "NL", "BE", "CH", "LU"]) expect(answerLanguagesForCountry(c).filter((l) => l === "en"), c).toEqual(["en"]);
  });
  it("write every word in lower case, a phrase with single plain spaces", () => {
    const words = (x: unknown): string[] => (typeof x === "string" ? [x] : x && typeof x === "object" ? Object.values(x).flatMap(words) : []);
    for (const l of Object.values(ANSWER_LANGUAGES)) {
      for (const w of [...words(l.fromIntl), ...words(l.byHand)]) {
        expect(w, `${l.code}: ${w}`).toBe(w.toLowerCase());
        expect(w, `${l.code}: ${w}`).not.toMatch(/\s(?<! )|  /u);
      }
      // Words a period word can start with start with a letter, so two period words never touch (the catalogue's
      // mutant for the overlap test in period-words.ts relies on it).
      const h = l.byHand;
      const first = [...words(l.fromIntl), ...words(h.relative), ...words(h.months), ...h.week.before, ...h.quarter.before, ...h.half.before, ...h.fiscalYear];
      for (const w of first) expect(w, `${l.code}: ${w}`).toMatch(/^\p{L}/u);
    }
  });
  it("read a language's words however its file writes them (a word file made for this test)", () => {
    // A month form with a space, and a word that starts a longer one of the same kind.
    const months = ANSWER_LANGUAGES.en.byHand.months.map((forms, i) => (i === 9 ? [...forms, "w październiku"] : forms));
    const zz = { ...ANSWER_LANGUAGES.en, code: "zz", name: "Test", byHand: { ...ANSWER_LANGUAGES.en.byHand, months, relative: { week: { last: ["vorige", "vorige woche"] } } } };
    const registry = ANSWER_LANGUAGES as Record<string, AnswerWords>;
    registry.zz = zz;
    try {
      const found = (t: string) => findPeriodWords(t, "2026-11-18", 1, ["zz"]).map((w) => [w.text, w.from, w.to, w.start]);
      expect(found("w  październiku: 4")).toEqual([["w  październiku", 0, 15, "2026-10-01"]]);
      expect(found("vorige woche: 3")).toEqual([["vorige woche", 0, 12, "2026-11-09"]]);
      expect(readAnswer("w  październiku: 4", { ...at("month"), languages: ["zz"] })).toMatchObject({ ok: true, value: 4, period: "2026-10-01" });
    } finally {
      delete registry.zz;
    }
  });
});

describe("every form the readers know (#126)", () => {
  it("refuses numbers whose marks cannot be read one way", () => {
    // Two marks in a row, a mixed number ending in a space group, two kinds of group marks, a decimal mark not last.
    for (const t of ["1..5", "1,234.567 8", "1'234 567", "1,5 000"]) for (const style of NUMBER_STYLES) expect(readNumber(t, style), `${t} in ${style}`).toBeNull();
  });
  it("decides too large on the digits as typed, not on the double nearest to them", () => {
    // 10^15 and a cent rounds to the double 10^15, yet it is larger than the largest value (found by a generated test).
    expect(readNumber("1000000000000000", "1,234.5")).toBe(1e15);
    expect(readNumber("1000000000000000.00", "1,234.5")).toBe(1e15);
    expect(readNumber("1000000000000000.01", "1,234.5")).toBeNull();
    expect(readNumber("1,000,000,000,000,000.009", "1,234.5")).toBeNull();
    expect(readNumber("1000000000000001", "1,234.5")).toBeNull();
  });

  it("takes today as a Date too", () => {
    expect(readAnswer("3", { style: "1,234.5", today: new Date(2026, 10, 18), period: "week", yearStart: 1 })).toEqual({ ok: true, value: 3, period: "2026-11-16", named: null });
  });
  it("finds no period in a day or a Fiscal Year that does not exist", () => {
    const ctx = { style: "1,234.5" as const, today: "2026-11-18", period: "month" as const, yearStart: 1 as const };
    expect(readAnswer("31.02.2026: 4", ctx)).toMatchObject({ ok: false, reason: "no_such_period", named: { text: "31.02.2026", start: null } });
    expect(readAnswer("FY 2026/28: 4", ctx)).toMatchObject({ ok: false, reason: "no_such_period", named: { text: "FY 2026/28", start: null } });
  });
  it("names half-years, ISO weeks, dates with years and the latest quarter that has begun", () => {
    const found = (t: string, today = "2026-11-18") => findPeriodWords(t, today, 1, ["en", "de"]).map((w) => [w.text, w.span, w.start]);
    expect(found("H2 2026")).toEqual([["H2 2026", "half", "2026-07-01"]]);
    expect(found("Q2", "2026-02-10")).toEqual([["Q2", "quarter", "2025-04-01"]]);
    expect(found("2026-W46")).toEqual([["2026-W46", "week", "2026-11-09"]]);
    expect(found("12 November 2026")).toEqual([["12 November 2026", "day", "2026-11-12"]]);
    expect(found("November 12, 2026")).toEqual([["November 12, 2026", "day", "2026-11-12"]]);
    // "2026/27" is a Fiscal Year only when the second year is the next one: "2026/12" is the year and a number.
    expect(found("2026/27")).toEqual([["2026/27", "year", "2026-01-01"]]);
    expect(found("2026/12")).toEqual([["2026", "year", "2026-01-01"]]);
    // ISO weeks run from 1 to 52 or 53: 2026 has 53, 2025 has 52.
    expect(found("week 1 2026")).toEqual([["week 1 2026", "week", "2025-12-29"]]);
    expect(found("2026-W53")).toEqual([["2026-W53", "week", "2026-12-28"]]);
    expect(found("2025-W53")).toEqual([["2025-W53", "week", null]]);
    // Halves are only 1 and 2.
    expect(found("H3")).toEqual([]);
    // A month that begins today has begun.
    expect(found("November", "2026-11-01")).toEqual([["November", "month", "2026-11-01"]]);
    // Day first unless told otherwise.
    expect(found("12/11")).toEqual([["12/11", "day", "2026-11-12"]]);
  });
  it("finds words with either apostrophe", () => {
    for (const t of ["aujourd'hui", "aujourd’hui"]) expect(findPeriodWords(t, "2026-11-18", 1, ["fr"]).map((w) => [w.text, w.start])).toEqual([[t, "2026-11-18"]]);
  });
  it("keeps period words that do not overlap, in the order they stand", () => {
    const found = (t: string) => findPeriodWords(t, "2026-11-18", 1, ["en"]).map((w) => w.text);
    expect(found("today or last week")).toEqual(["today", "last week"]);
    expect(found("Q3, today or last week")).toEqual(["Q3", "today", "last week"]);
    // Of two that overlap, the longer one, even when it starts later; of two as long, the earlier.
    expect(found("12 Nov 13th")).toEqual(["Nov 13th"]);
    expect(found("Nov 12th Nov")).toEqual(["Nov 12th", "Nov"]);
  });
  it("skips empty lines of a breakdown and takes its total", () => {
    expect(parseBreakdown("A 1\n\nB 2\nTotal 3", "1,234.5")).toEqual({ rows: [{ label: "A", value: 1 }, { label: "B", value: 2 }], total: 3 });
  });
  it("takes a colon with or without spaces, quoted labels, and leaves out a row with no label", () => {
    // `"  9` has only spaces inside its quote: no label, so no row.
    const text = 'Germany:5\nAustria: 1.234,5\n  "Swiss" 7\n" Italy"  2\n"  9';
    expect(parseBreakdown(text, "1.234,5")).toEqual({
      rows: [{ label: "Germany", value: 5 }, { label: "Austria", value: 1234.5 }, { label: "Swiss", value: 7 }, { label: "Italy", value: 2 }],
      total: null,
    });
  });
  it("reads signs and k, keeps digits inside a label, and leaves out what is no row", () => {
    // "2025 100" starts with a number, so it is no label; "1..2" is no number; "5x" has something after the number.
    const text = "Returns -5\nSales 5  k\nQ1 bonus 3\n2025 100\nBad 1..2\nOdd 5x";
    expect(parseBreakdown(text, "1,234.5")).toEqual({
      rows: [{ label: "Returns", value: -5 }, { label: "Sales", value: 5000 }, { label: "Q1 bonus", value: 3 }],
      total: null,
    });
  });
});

describe("a pasted breakdown with a parent column (spec 0041, ticket 12)", () => {
  it("reads a third cell as the label of the row's parent, from a spreadsheet's tabs, and an empty cell as the top", () => {
    const text = "Name\tValue\tParent\nGermany\t100\t\nBerlin\t60\tGermany\nMunich\t1.234,5 €\t Germany \nAustria\t50";
    expect(parseBreakdown(text, "1.234,5")).toEqual({
      rows: [{ label: "Germany", value: 100 }, { label: "Berlin", value: 60, parent: "Germany" }, { label: "Munich", value: 1234.5, parent: "Germany" }, { label: "Austria", value: 50 }],
      total: null,
    });
  });
  it("takes quotes round a parent, a total with a parent cell, signs and k, and leaves a parent that starts with a digit as no parent column", () => {
    expect(parseBreakdown('A\t5\t"B"\nB\t-2k\t\nTotal\t3\tB', "1,234.5")).toEqual({ rows: [{ label: "A", value: 5, parent: "B" }, { label: "B", value: -2000 }], total: 3 });
    // "5\t9" is a label with a tab in it and a number, as before; the third cell is a number, not a parent.
    expect(parseBreakdown("A\t5\t9\nB 1", "1,234.5")?.rows.map((r) => [r.label, r.value, r.parent])).toEqual([["A\t5", 9, undefined], ["B", 1, undefined]]);
  });
  it("reads a CSV file's three columns the same way", () => {
    expect(parseBreakdown("Name,Value,Parent\nGermany,100,\nBerlin,60,Germany\n\"Hamburg, Nord\",5.5,\"Germany\"\nAustria,50", "1,234.5")).toEqual({
      rows: [{ label: "Germany", value: 100 }, { label: "Berlin", value: 60, parent: "Germany" }, { label: "Hamburg, Nord", value: 5.5, parent: "Germany" }, { label: "Austria", value: 50 }],
      total: null,
    });
  });
  it("keeps reading every other form as before: no parent", () => {
    expect(parseBreakdown("A 1;B 2", "1,234.5")).toEqual({ rows: [{ label: "A", value: 1 }, { label: "B", value: 2 }], total: null });
    expect(parseBreakdown("A\t1\nB\t2", "1,234.5")?.rows.every((r) => !("parent" in r))).toBe(true);
  });
});

describe("reading what Ziffr writes", () => {
  const { numRuns, seed } = runs();
  it(`reads every number written in a Number Style back in that style, exactly (${numRuns * 5} values, seed ${seed})`, () => {
    fc.assert(
      fc.property(valueText, fc.integer({ min: 0, max: 6 }), fc.constantFrom(...NUMBER_STYLES), fc.boolean(), fc.constantFrom("", "+", "−"), (text, decimals, style, group, sign) => {
        // Written by the reference writer, not by format.ts: digits rounded to `decimals`, grouped or not.
        const written = referenceNumber(text, decimals, style, group);
        const rounded = exactOf(roundedText(exactOf(text), decimals));
        const sized = rounded.num < 0n ? -rounded.num : rounded.num;
        const big = sized > 10n ** 15n * rounded.den;
        // Grouped it is written for people, with the minus sign "−"; ungrouped for files, with "-" (#184). A sign typed
        // in front: "+" changes nothing, "−" (the minus sign) negates, as "-" does.
        const negative = /^[-−]/.test(written);
        if (negative) expect(written[0], written).toBe(group ? "−" : "-");
        const typed = sign && !negative ? `${sign}${written}` : written;
        const negate = sign === "−" && !negative;
        const read = readNumber(typed, style);
        if (big) expect(read, typed).toBeNull();
        else expect(read !== null && isNearestDouble(negate ? -read : read, rounded), `${typed} in ${style} read as ${read}`).toBe(true);
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
});

describe("period words are found with rules built once (spec 0026)", () => {
  it("reads the same with the rules built anew, reused, and built again after many others pushed them out", () => {
    const read = (today: string) => findPeriodWords("last week, Q3 and 12.11.", today, 1, ["en", "de"]).map((w) => [w.text, w.span, w.start]);
    const first = read("2026-11-18");
    expect(read("2026-11-18")).toEqual(first);
    // More days than sets of rules are kept: the first set goes, and is built again the same.
    const days = Array.from({ length: 20 }, (_, i) => shiftPeriod("2026-01-01", "day", i));
    for (const d of days) expect(read(d)[0][1]).toBe("week");
    expect(read("2026-11-18")).toEqual(first);
    expect(read("2026-01-05")).toEqual(read(days[4]));
  });
});
