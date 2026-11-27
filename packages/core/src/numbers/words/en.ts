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
    reply: {
      yes: ["yes", "yes please", "yes, please"],
      no: ["no", "no thanks", "no, thanks", "no thank you", "no, thank you", "nope", "thanks", "thank you", "thanks a lot", "many thanks", "thx"],
      greetings: ["hi", "hello", "hey", "dear", "good morning", "good afternoon", "good evening"],
      closings: ["best", "best regards", "kind regards", "warm regards", "regards", "best wishes", "all the best", "many thanks", "thanks", "thank you", "thanks and regards", "cheers", "sincerely", "yours sincerely", "br"],
      sentFrom: ["sent from my …", "get outlook for …"],
    },
  },
};
