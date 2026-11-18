// English words that name a Period in an answer (spec 0022; GLOSSARY: Period, Answer Language): "last week", "October",
// "Q3", "week 46". The shape is in ../languages.ts.
import type { AnswerWords } from "../languages";

/** English. */
export const en: AnswerWords = {
  code: "en",
  name: "English",
  // fromIntl: generated from Intl by scripts/answer-words.mjs, do not edit by hand.
  fromIntl: {
    relative: {
      day: { this: ["today"], last: ["yesterday"] },
      week: { this: ["this week"], last: ["last week"] },
      month: { this: ["this month"], last: ["last month"] },
      quarter: { this: ["this quarter"], last: ["last quarter"] },
      year: { this: ["this year"], last: ["last year"] },
    },
    months: [
      ["january", "jan"],
      ["february", "feb"],
      ["march", "mar"],
      ["april", "apr"],
      ["may"],
      ["june", "jun"],
      ["july", "jul"],
      ["august", "aug"],
      ["september", "sep"],
      ["october", "oct"],
      ["november", "nov"],
      ["december", "dec"],
    ],
  },
  // end fromIntl
  byHand: {
    relative: {
      week: { this: ["this wk", "this past week"], last: ["previous week", "past week", "the week before", "last wk"] },
      month: { last: ["previous month", "past month"] },
      quarter: { last: ["previous quarter", "past quarter"] },
      year: { last: ["previous year", "past year"] },
    },
    months: [[], [], [], [], [], [], [], [], ["sept"], [], [], []],
    // "We may have 3" names no month; "May 2026" and "12 May" do.
    monthsOnlyWithDate: ["may"],
    week: { before: ["week", "wk", "cw", "w"], after: ["week"] },
    quarter: { before: ["q", "quarter"], after: ["quarter"] },
    half: { before: ["h", "half"], after: ["half"] },
    fiscalYear: ["fy"],
    ordinal: ["st", "nd", "rd", "th"],
    dateWords: ["of"],
  },
};
