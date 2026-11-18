// Reading numbers people write (spec 0022; GLOSSARY: Number Style, Period, Prompt): the one reader every way a value
// arrives as text uses, and the reading of an answer written as a sentence. Pure, so the browser previews pasted
// rows and tests read with exactly the rules the core applies.
import { parseISO } from "date-fns";
import { NUMBER_STYLE_MARKS, type NumberStyle } from "./number-style";
import { DEFAULT_ANSWER_LANGUAGES } from "./numbers/languages";
import { findPeriodWords, wordsFor, type PeriodWords } from "./numbers/period-words";
import { periodStart, type YearStart } from "./periods";
import type { Period } from "./types";

export { ANSWER_LANGUAGES, DEFAULT_ANSWER_LANGUAGES, type AnswerWords } from "./numbers/languages";
export { findPeriodWords, type PeriodWords } from "./numbers/period-words";

/** The largest value, in size, a number read from text may have; anything larger is a typing slip, not a value. */
export const LARGEST_VALUE = 1e15;

/** One number written in either convention ("1.234,5", "1,234.5", "1 234,5", "1'234.5", "−5", "+5", "2,5k", "1.2M"),
 * as a number; null for anything else, and for a number that is not finite or larger than 10^15 in size. With both
 * marks, or a group that is not three digits, a number reads only one way. Only one mark followed by exactly three
 * digits ("1.500", "1,500") is ambiguous, and the Number Style settles it: its decimal mark is a decimal mark. */
export function readNumber(text: string, style: NumberStyle): number | null {
  const m = /^([+\-−])?(\d(?:[\d.,'’ \u00a0\u202f\u2009]*\d)?)(?:\s?([kKM]))?$/u.exec(String(text).trim());
  if (!m) return null;
  // Digit runs and the marks between them. Every kind of space (plain, no-break, narrow no-break, thin) is one mark,
  // and so is either apostrophe: they only ever group digits. Two marks in a row leave an empty run, which neither a
  // group of three nor a decimal part (always the last run) is, so the checks below refuse it.
  const parts = m[2].replace(/[\u00a0\u202f\u2009]/gu, " ").replace(/’/gu, "'").split(/([.,' ])/u);
  const runs = parts.filter((_, i) => i % 2 === 0);
  const marks = parts.filter((_, i) => i % 2 === 1);
  const dots = marks.filter((c) => c === ".").length;
  const commas = marks.filter((c) => c === ",").length;
  const others = marks.length - dots - commas;
  let decimal: number | null = null; // index into marks
  // Both: the later one is the decimal mark. One that is not last, or a second of it, leaves two kinds of group
  // marks, which is refused below.
  if (dots && commas) decimal = marks.length - 1;
  else if (dots + commas === 1) {
    const at = marks.findIndex((c) => c === "." || c === ",");
    // Beside another mark ("1 234,5", "1'234.5") the other one groups, so this one is the decimal. Alone, it can be a
    // group of thousands: three digits after a first group of one to three that does not start with 0. Then the
    // Number Style settles it.
    const couldGroup = others === 0 && runs[1].length === 3 && runs[0].length <= 3 && !runs[0].startsWith("0");
    decimal = couldGroup && marks[at] !== NUMBER_STYLE_MARKS[style].decimal ? null : at;
  }
  // Every other mark groups, all the same one, in groups of three after a first group of one to three.
  const groupMarks = new Set(marks.filter((_, i) => i !== decimal));
  if (groupMarks.size > 1) return null;
  const intRuns = decimal === null ? runs : runs.slice(0, decimal + 1);
  if (decimal !== null && decimal !== marks.length - 1) return null;
  if (intRuns.length > 1 && (intRuns[0].length > 3 || intRuns.slice(1).some((r) => r.length !== 3))) return null;
  const int = intRuns.join("");
  const frac = decimal === null ? "" : runs[decimal + 1];
  // k and M move the decimal point, so 2,5k is exactly 2500 and not 2.5 × 1000 in floating point.
  const shift = m[3] === "M" ? 6 : m[3] ? 3 : 0;
  const point = int.length + shift;
  const digits = (int + frac).padEnd(point, "0");
  const whole = digits.slice(0, point);
  const part = digits.slice(point);
  // Nothing after the point is no fraction: "2500." is 2500.
  const v = Number(`${whole}.${part}`);
  // Too large is decided on the digits as typed: 1,000,000,000,000,000.01 is larger than 10^15, though the double
  // nearest to it is 10^15 itself.
  const ceiling = BigInt(LARGEST_VALUE);
  const size = BigInt(whole);
  if (!Number.isFinite(v) || size > ceiling || (size === ceiling && /[1-9]/.test(part))) return null;
  const signed = m[1] && m[1] !== "+" ? -v : v;
  return signed === 0 ? 0 : signed;
}

/** A number as it stands in an answer, where it stands, and its value (null when it cannot be read, "1,23,4"). */
export type NumberInText = { from: number; to: number; text: string; value: number | null };

// A number in a sentence: digits, marks between digits (a space only before a group of three), an optional sign and
// k or M. A sign after a digit is not one ("3-4" is 3 and 4). Digits that are part of a word ("2nd", "3x", "v2", "COVID-19", "1e3") are not numbers.
const NUMBER_IN_TEXT = new RegExp(
  String.raw`(?<![\p{L}\p{N}]|[\p{N}][.,'’]|\p{L}[-‐])([+\-−])?(\d+(?:(?:[.,'’]|[ \u00a0\u202f\u2009](?=\d{3}(?!\d)))\d+)*)(?:\s?([kKM]))?(?![.,'’]?[\p{L}\p{N}])`,
  "gu",
);

/** Every number in a text, in order: "2 signups, 1 churn" has two. */
export function numbersIn(text: string, style: NumberStyle): NumberInText[] {
  const out: NumberInText[] = [];
  NUMBER_IN_TEXT.lastIndex = 0;
  for (let m = NUMBER_IN_TEXT.exec(text); m; m = NUMBER_IN_TEXT.exec(text)) {
    out.push({ from: m.index, to: m.index + m[0].length, text: m[0], value: readNumber(m[0], style) });
  }
  return out;
}

/** What an answer is read with: the Workspace's Number Style and Fiscal Year, the Metric's Period, today, the Prompt's
 * period when it answers one, and the languages its words are tried in. */
export type AnswerContext = {
  style: NumberStyle;
  /** Today, as a yyyy-mm-dd or a Date. */
  today: string | Date;
  /** The Metric's Period. */
  period: Period;
  yearStart: YearStart;
  /** The first day of the period the Prompt asked for, when the answer is a reply to one. */
  promptPeriod?: string | null;
  /** The Workspace's Answer Languages, the languages period words are tried in; English and German when not given. */
  languages?: readonly string[];
  /** Whether a date such as "11/12" puts the month first, as in the US; day first otherwise. */
  monthFirst?: boolean;
};

/** What an answer says: a value for a period (`named` holds the words that named it, if any), or why it records
 * nothing and what to ask back. Every period is the first day of one of the Metric's periods. */
export type AnswerReading =
  | { ok: true; value: number; period: string; named: PeriodWords | null }
  | { ok: false; reason: "no_number" }
  | { ok: false; reason: "unreadable_number"; text: string }
  | { ok: false; reason: "several_numbers"; numbers: string[] }
  | { ok: false; reason: "year_or_value"; named: PeriodWords; year: string }
  | { ok: false; reason: "several_periods"; named: PeriodWords[] }
  | { ok: false; reason: "no_such_period"; named: PeriodWords }
  | { ok: false; reason: "not_a_period_of_metric"; named: PeriodWords & { start: string } }
  | { ok: false; reason: "other_period"; named: PeriodWords; period: string; promptPeriod: string }
  | { ok: false; reason: "future_period"; named: PeriodWords; period: string };

/** Reads an answer to a Prompt, a message or a form value, in fixed steps the same for every Connector: the words
 * that name a period are taken out first and read as the period; the period is checked against the Metric's and the
 * Prompt's; what is left must hold exactly one number, the value. "we had 2 signups last week" is 2 for last week;
 * "2 signups, 1 churn" asks back. Spec 0022, "Values in sentences". */
export function readAnswer(text: string, ctx: AnswerContext): AnswerReading {
  const today = periodStart(ctx.today, "day", ctx.yearStart);
  const current = periodStart(parseISO(today), ctx.period, ctx.yearStart);
  const languages = ctx.languages ?? DEFAULT_ANSWER_LANGUAGES;
  const found = findPeriodWords(text, today, ctx.yearStart, languages, ctx.monthFirst ?? false);
  // A year on its own beside other period words is the value, not a second period: "KW 46: 2050" is 2050 for week
  // 46 (#126). Alone, a year still names the Fiscal Year ("2026 revenue 4500"). Period words that are four digits
  // and nothing else are always such a year.
  const lone = (w: PeriodWords) => /^\d{4}$/.test(w.text);
  const words = found.some((w) => !lone(w)) ? found.filter((w) => !lone(w)) : found;
  // Period words are blanked out, so their digits are never the value.
  let rest = text;
  for (const w of words) rest = rest.slice(0, w.from) + " ".repeat(w.to - w.from) + rest.slice(w.to);
  const numbers = numbersIn(rest, ctx.style);

  // A year on its own is the value when it is the whole answer: "2026" in reply to "How many visitors?". Nothing
  // else is left, so there is no other number either.
  if (words.length === 1 && lone(words[0]) && !/[\p{L}\p{N}]/u.test(rest)) {
    const value = readNumber(words[0].text, ctx.style)!;
    return { ok: true, value, period: ctx.promptPeriod ?? current, named: null };
  }

  // 1. and 2. The period: named at most once, one of the Metric's, the Prompt's if it answers one, not to come.
  let period = ctx.promptPeriod ?? current;
  let named: PeriodWords | null = null;
  if (words.length) {
    const bad = words.find((w) => w.start === null);
    if (bad) return { ok: false, reason: "no_such_period", named: bad };
    // "last week (KW 46)" names one period twice; "last week or yesterday" names two.
    // Every word names a period that exists here: one that does not was answered above.
    const resolved = words.map((w) => ({ w, period: inMetricPeriod(w as PeriodWords & { start: string }, ctx.period, ctx.yearStart) }));
    const distinct = new Set(resolved.map((r) => r.period ?? `${r.w.span}:${r.w.start}`));
    if (distinct.size > 1) return { ok: false, reason: "several_periods", named: words };
    const first = resolved[0];
    named = first.w;
    if (first.period === null) return { ok: false, reason: "not_a_period_of_metric", named: { ...first.w, start: first.w.start! } };
    period = first.period;
    // A year written after a week, month, quarter or half-year with only a space between ("KW 46 2050", "November
    // 2025") is its year or the value; with no other number in the answer nothing tells which, so it asks back
    // rather than guess, also when that year is still to come (#126). "FY 2026" is a year by its word, which is the
    // only way a Fiscal Year is written with a space before its year.
    // The word before the year is the last one before it: the first match from the left starts where that word does.
    const attached = numbers.length === 0 && named.span !== "day" ? /(\S+)\s+(\d{4})$/u.exec(named.text) : null;
    const fy = new Set(wordsFor(languages).flatMap((l) => l.byHand.fiscalYear.map((w) => w.toLowerCase())));
    if (attached && !fy.has(attached[1].toLowerCase())) return { ok: false, reason: "year_or_value", named, year: attached[2] };
    if (ctx.promptPeriod && period !== ctx.promptPeriod) return { ok: false, reason: "other_period", named, period, promptPeriod: ctx.promptPeriod };
    if (!ctx.promptPeriod && period > current) return { ok: false, reason: "future_period", named, period };
  }

  // 3. The value is what is left: exactly one number.
  if (numbers.length === 0) return { ok: false, reason: "no_number" };
  if (numbers.length > 1) return { ok: false, reason: "several_numbers", numbers: numbers.map((n) => n.text) };
  const [n] = numbers;
  if (n.value === null) return { ok: false, reason: "unreadable_number", text: n.text };
  return { ok: true, value: n.value, period, named };
}

/** The Metric's period that period words name: the same span, or a day inside one ("yesterday" for a weekly
 * Metric is this week, or last week on a Monday). A longer or other span ("Q3" for a monthly Metric) is none. */
function inMetricPeriod(w: PeriodWords & { start: string }, period: Period, yearStart: YearStart): string | null {
  if (w.span === period || w.span === "day") return periodStart(parseISO(w.start), period, yearStart);
  return null;
}
