import { describe, expect, it } from "vitest";
import { ANSWER_LANGUAGES, numbersIn, readAnswer, readNumber, type AnswerReading } from "./numbers";
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
    for (const bad of [[], ["xx"], ["en", "xx"], "en", null, [1], Array(21).fill("en")]) expect(checkAnswerLanguages(bad)).toBeNull();
  });
});
