// The words an answer may name its Period with, one file per language (spec 0022; GLOSSARY: Period, Prompt). Pure
// data in one shape, so the reader in numbers.ts never depends on a language and adding one is adding a file.
import { de } from "./words/de";
import { en } from "./words/en";

/** The spans "this" and "last" are said of; "this day" and "last day" are "today" and "yesterday". */
export const RELATIVE_UNITS = ["day", "week", "month", "quarter", "year"] as const;

/** One span "this" and "last" are said of. */
export type RelativeUnit = (typeof RELATIVE_UNITS)[number];

/** The words `Intl` knows: "today" and "last week" from RelativeTimeFormat, the months from DateTimeFormat. */
export type IntlWords = {
  /** Per span, the words for the one running now and the one before ("this week", "last week"). */
  relative: Record<RelativeUnit, { this: string[]; last: string[] }>;
  /** Twelve lists, January first: each month's name and its short form ("october", "oct"). */
  months: string[][];
};

/** A word that stands before or after a number to name a week, quarter or half-year ("KW 46", "3. Quartal"). */
export type NumberedWords = { before: string[]; after: string[] };

/** The words added by hand: abbreviations, other ways of saying "last week", and the forms words take in a sentence. */
export type HandWords = {
  /** More ways to name this or the last span, including inflected forms ("in der letzten Woche"). */
  relative: Partial<Record<RelativeUnit, { this?: string[]; last?: string[] }>>;
  /** Twelve lists, January first: further forms of each month ("sept", "w październiku"); may be empty. */
  months: string[][];
  /** Month words that are also everyday words ("may"): read as a month only next to a day or a year. */
  monthsOnlyWithDate: string[];
  /** Words for a week with its number ("week 46", "KW 46", "46. KW"). */
  week: NumberedWords;
  /** Words for a quarter with its number ("Q3", "3rd quarter"). */
  quarter: NumberedWords;
  /** Words for a half-year with its number ("H1", "1. Halbjahr"). */
  half: NumberedWords;
  /** Words before a Fiscal Year ("FY 2026/27"). */
  fiscalYear: string[];
  /** What follows a number to make it an ordinal ("3rd", "3."), as in "12th Nov" or "46. KW". */
  ordinal: string[];
};

/** The words of one language: what `Intl` knows, then what was added by hand. Every word is written in lower case. */
export type AnswerWords = {
  /** The language's code, such as "de". */
  code: string;
  /** The language's name in English, such as "German". */
  name: string;
  /** Generated from `Intl` and checked in, so the file does not change with the runtime. */
  fromIntl: IntlWords;
  /** Added by hand. */
  byHand: HandWords;
};

/** Every language Ziffr reads answers in, by code. */
export const ANSWER_LANGUAGES: Readonly<Record<string, AnswerWords>> = { en, de };

/** The languages answers are read in until a Workspace chooses its own: English and German (spec 0022, #109). */
export const DEFAULT_ANSWER_LANGUAGES: readonly string[] = ["en", "de"];
