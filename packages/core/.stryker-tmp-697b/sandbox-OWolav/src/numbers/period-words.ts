// @ts-nocheck
// Finding the words in an answer that name a Period (spec 0022; GLOSSARY: Period, Fiscal Year): "last week",
// "KW 46", "Q3", "October 2026", "12.11.", "2026-11-12", "FY 2026/27". Pure. The patterns are the same for every
// language; only the words come from the word files, so a language is data.
import { format, getISOWeeksInYear, parseISO, setISOWeek, startOfISOWeek } from "date-fns";
import { periodStart, shiftPeriod, type Span, type YearStart } from "../periods";
import { ANSWER_LANGUAGES, RELATIVE_UNITS, type AnswerWords } from "./languages";

/** A stretch of an answer that names a period: where it is, what it says, and the span it names by its first day.
 * `start` is null for words shaped like a period that name none ("week 60", "31.02."). */
export type PeriodWords = { from: number; to: number; text: string; span: Span; start: string | null };

const iso = (d: Date) => format(d, "yyyy-MM-dd");
// A period word never starts or ends inside a word or a number: "faq3" and "1.2026" name none.
const B = String.raw`(?<![\p{L}\p{N}]|[\p{N}][.,'’])`;
const E = String.raw`(?![\p{L}\p{N}]|[.,'’][\p{N}])`;
// Within a phrase, any run of spaces stands for one; the word files write a phrase with single plain spaces.
const S = String.raw`\s+`;
// An apostrophe matches either kind, so "aujourd'hui" typed on a plain keyboard is "aujourd’hui".
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, S).replace(/['’]/g, "['’]");
// Longest first, so a phrase is taken before a shorter word it starts with could be ("vorige woche" before
// "vorige"). The word files are in lower case and the patterns ignore case.
const alt = (words: string[]) => [...new Set(words)].sort((a, b) => b.length - a.length).map(esc).join("|") || "(?!)";

type Rule = { re: RegExp; read: (m: RegExpExecArray) => { span: Span; start: string | null } | null };

/** The day a calendar date is, or null when there is no such day (31 February). */
function day(y: number, m: number, d: number): string | null {
  // A day past its month's end rolls into the next month and has another day number; a month past 12 or before 1
  // rolls into another year, and so does a year below 100, which Date reads as 19xx.
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getDate() === d ? iso(date) : null;
}

/** A two-digit year as the one in this century ("26" is 2026). */
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/** The rules that find period words, built once per set of languages. */
function rules(langs: AnswerWords[], today: string, yearStart: YearStart, monthFirst: boolean): Rule[] {
  const t = parseISO(today);
  const ty = t.getFullYear();
  // A month, week, quarter or half-year named without its year is the latest one that has begun: answers are about
  // what happened, so "December" in November is last December, not one still to come.
  const latest = (startIn: (y: number) => string | null) => {
    const s = startIn(ty);
    return s && s > today ? startIn(ty - 1) : s;
  };
  const monthIndex = new Map<string, number>();
  const monthOnlyWithDate = new Set<string>();
  for (const l of langs) {
    l.fromIntl.months.forEach((forms, i) => forms.forEach((w) => monthIndex.set(w.toLowerCase(), i + 1)));
    l.byHand.months.forEach((forms, i) => forms.forEach((w) => monthIndex.set(w.toLowerCase(), i + 1)));
    l.byHand.monthsOnlyWithDate.forEach((w) => monthOnlyWithDate.add(w.toLowerCase()));
  }
  const all = (pick: (l: AnswerWords) => string[]) => langs.flatMap(pick);
  const MONTH = `(${alt([...monthIndex.keys()])})\\.?`;
  // "46. KW" and "3rd quarter" need the ordinal; "in 1 week" names no week.
  const ORDINAL = `(?:${alt(all((l) => l.byHand.ordinal))})`;
  const ORD = `${ORDINAL}?`;
  // "12 de noviembre de 2026", "12th of November".
  const JOIN = `(?:\\s+(?:${alt(all((l) => l.byHand.dateWords))}))?`;
  // A month as written, in lower case and with one space where the text has several ("w  październiku").
  const monthOf = (w: string) => monthIndex.get(w.toLowerCase().replace(/\s+/g, " "))!;
  const YEAR4 = String.raw`(20\d{2})`;
  // A year after a quarter, half or week: "Q3 2026", "Q3/26", "KW 46/2026", "Q3 FY 2026/27".
  const FY = alt(all((l) => l.byHand.fiscalYear));
  const AFTER_YEAR = String.raw`(?:\s*(?:${FY})?\s*(20\d{2})(?:\s*/\s*(\d{2}))?|\s*[/'’]\s*(20\d{2}|\d{2}))?`;
  const yearAfter = (m: RegExpExecArray, at: number): number | null => (m[at] ? Number(m[at]) : m[at + 2] ? fullYear(m[at + 2]) : null);

  // The quarter or half numbered n of a Fiscal Year: of the one starting in calendar year y when a year is named
  // (as "2026" is FY 2026/27), else the latest that has begun. With April, "Q1" is April to June, "Q4 2026" January 2027.
  const part = (span: "quarter" | "half", n: number, y: number | null) => {
    const len = span === "quarter" ? 3 : 6;
    const startIn = (yy: number) => iso(new Date(yy, yearStart - 1 + len * (n - 1), 1));
    if (y !== null) return { span, start: startIn(y) } as const;
    // The latest that has begun: this Fiscal Year's, or the one before.
    const fyStart = Number(periodStart(today, "year", yearStart).slice(0, 4));
    return { span, start: startIn(fyStart) > today ? startIn(fyStart - 1) : startIn(fyStart) } as const;
  };
  const isoWeek = (n: number, y: number) => {
    const jan4 = new Date(y, 0, 4);
    return n >= 1 && n <= getISOWeeksInYear(jan4) ? iso(startOfISOWeek(setISOWeek(jan4, n))) : null;
  };
  const week = (n: number, y: number | null) => ({ span: "week" as const, start: y === null ? latest((yy) => isoWeek(n, yy)) : isoWeek(n, y) });
  // A Fiscal Year named by one calendar year is the one starting in it, as Ziffr names it: "2026" or "FY 2026" is
  // FY 2026/27 when the year starts in April. A second year must be the next one ("2026/27").
  const fiscal = (y: number, next?: string) =>
    ({ span: "year" as const, start: next === undefined || fullYear(next) % 100 === (y + 1) % 100 ? iso(new Date(y, yearStart - 1, 1)) : null });

  const r = (src: string) => new RegExp(`${B}(?:${src})${E}`, "giu");
  const out: Rule[] = [
    // 2026-11-12
    { re: r(String.raw`(\d{4})-(\d{1,2})-(\d{1,2})`), read: (m) => ({ span: "day", start: day(Number(m[1]), Number(m[2]), Number(m[3])) }) },
    // 2026-W46
    { re: r(String.raw`(\d{4})-?w(\d{1,2})`), read: (m) => ({ span: "week", start: isoWeek(Number(m[2]), Number(m[1])) }) },
    // 12.11.2026, 12.11.26 and 12.11. (the last dot is what makes "12.11." a date and "12.11" a number)
    {
      re: new RegExp(String.raw`${B}(\d{1,2})\.(\d{1,2})\.(?:(\d{4}|\d{2})(?![\p{L}\p{N}]))?(?![\p{N}])`, "giu"),
      read: (m) => {
        const d = Number(m[1]);
        const mo = Number(m[2]);
        if (m[3]) return { span: "day", start: day(fullYear(m[3]), mo, d) };
        return { span: "day", start: latest((y) => day(y, mo, d)) };
      },
    },
    // 12/11, 12/11/2026: day first, or month first where the Workspace's country writes it so (the US). 11/2026 is a month.
    {
      re: r(String.raw`(\d{1,2})/(\d{1,2})(?:/(\d{4}|\d{2}))?`),
      read: (m) => {
        const [d, mo] = monthFirst ? [Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2])];
        return { span: "day", start: m[3] ? day(fullYear(m[3]), mo, d) : latest((y) => day(y, mo, d)) };
      },
    },
    { re: r(String.raw`(\d{1,2})/(20\d{2})`), read: (m) => ({ span: "month", start: day(Number(m[2]), Number(m[1]), 1) }) },
    // 12 Nov, 12. November 2026, 12th Nov
    {
      re: r(String.raw`(\d{1,2})${ORD}${JOIN}\s*${MONTH}(?:${JOIN}\s+${YEAR4})?`),
      read: (m) => ({ span: "day", start: m[3] ? day(Number(m[3]), monthOf(m[2]), Number(m[1])) : latest((y) => day(y, monthOf(m[2]), Number(m[1]))) }),
    },
    // Nov 12th, November 12, 2026: a month and a bare number after it is a month and a value, not a date.
    {
      re: r(String.raw`${MONTH}\s+(\d{1,2})(?:(?:${alt(all((l) => l.byHand.ordinal.filter((o) => o !== ".")))})(?:,?\s+${YEAR4})?|,?\s+${YEAR4})`),
      read: (m) => {
        const y = m[3] ?? m[4];
        return { span: "day", start: y ? day(Number(y), monthOf(m[1]), Number(m[2])) : latest((yy) => day(yy, monthOf(m[1]), Number(m[2]))) };
      },
    },
    // October, Oktober 2026, May 2026 ("may" alone is not a month)
    {
      re: r(String.raw`${MONTH}(?:${JOIN}\s+${YEAR4})?`),
      read: (m) => {
        if (!m[2] && monthOnlyWithDate.has(m[1].toLowerCase())) return null;
        const mo = monthOf(m[1]);
        return { span: "month", start: m[2] ? day(Number(m[2]), mo, 1) : latest((y) => day(y, mo, 1)) };
      },
    },
    // Q3, Q3 2026, Q3 FY 2026/27, 3rd quarter, 3. Quartal; H1 and 1. Halbjahr the same way
    ...(["quarter", "half"] as const).flatMap((span) => {
      const n = span === "quarter" ? "[1-4]" : "[12]";
      const before = alt(all((l) => l.byHand[span].before));
      const after = alt(all((l) => l.byHand[span].after));
      return [
        { re: r(String.raw`(?:${before})\s?(${n})${AFTER_YEAR}`), read: (m: RegExpExecArray) => part(span, Number(m[1]), yearAfter(m, 2)) },
        { re: r(String.raw`(${n})${ORDINAL}\s*(?:${after})${AFTER_YEAR}`), read: (m: RegExpExecArray) => part(span, Number(m[1]), yearAfter(m, 2)) },
      ];
    }),
    // week 46, KW46, KW 46/2026, 46. KW
    { re: r(String.raw`(?:${alt(all((l) => l.byHand.week.before))})\s?(\d{1,2})${AFTER_YEAR}`), read: (m) => week(Number(m[1]), yearAfter(m, 2)) },
    { re: r(String.raw`(\d{1,2})${ORDINAL}\s*(?:${alt(all((l) => l.byHand.week.after))})${AFTER_YEAR}`), read: (m) => week(Number(m[1]), yearAfter(m, 2)) },
    // FY 2026/27, FY26/27, FY 2026, 2026/27
    { re: r(String.raw`(?:${FY})\s*(\d{4}|\d{2})(?:\s*/\s*(\d{2}|\d{4}))?`), read: (m) => fiscal(fullYear(m[1]), m[2]) },
    // "2026/27" only when the second year is the next one; "2026/12" is left to the other rules.
    { re: r(String.raw`(20\d{2})\s*/\s*(\d{2})`), read: (m) => (fiscal(Number(m[1]), m[2]).start ? fiscal(Number(m[1]), m[2]) : null) },
    // 2026 on its own (see readAnswer for the one case where it is the value)
    { re: r(YEAR4), read: (m) => fiscal(Number(m[1])) },
  ];
  // today, yesterday, this week, letzten Monat, ...
  for (const unit of RELATIVE_UNITS) {
    for (const which of ["this", "last"] as const) {
      const words = all((l) => {
        const byHand = l.byHand.relative[unit]?.[which];
        return byHand ? [...l.fromIntl.relative[unit][which], ...byHand] : l.fromIntl.relative[unit][which];
      });
      const now = periodStart(today, unit, yearStart);
      const start = which === "this" ? now : shiftPeriod(now, unit, -1);
      out.push({ re: r(alt(words)), read: () => ({ span: unit, start }) });
    }
  }
  return out;
}

/** The words of the given languages; codes Ziffr has no words for are left out, so their words are never read. */
export function wordsFor(languages: readonly string[]): AnswerWords[] {
  return languages.filter((c) => Object.hasOwn(ANSWER_LANGUAGES, c)).map((c) => ANSWER_LANGUAGES[c]);
}

/** How many sets of rules are kept: one per Workspace's languages, day, year start and date order in use at once. */
const RULES_KEPT = 16;
const built = new Map<string, Rule[]>();

/** The rules for these languages, day, year start and date order, built once and reused: building them compiles
 * every pattern, which is most of the time a reading takes, and a paste reads thousands of cells (spec 0026). The
 * patterns are only used one at a time and each use starts from the beginning (lastIndex is reset), so sharing them
 * is safe. The oldest set goes when more are kept than RULES_KEPT. */
function rulesFor(languages: readonly string[], today: string, yearStart: YearStart, monthFirst: boolean): Rule[] {
  const key = `${languages.join(",")}|${today}|${yearStart}|${monthFirst}`;
  const kept = built.get(key);
  if (kept) return kept;
  const made = rules(wordsFor(languages), today, yearStart, monthFirst);
  built.set(key, made);
  if (built.size > RULES_KEPT) built.delete(built.keys().next().value!);
  return made;
}

/** Every stretch of `text` that names a period, in the order they stand, none overlapping: where two overlap, the
 * longer one wins ("October 2026" over "2026"), and of two as long the earlier. `today` is a yyyy-mm-dd;
 * `monthFirst` reads "11/12" as 12 November. */
export function findPeriodWords(text: string, today: string, yearStart: YearStart, languages: readonly string[], monthFirst = false): PeriodWords[] {
  const found: PeriodWords[] = [];
  for (const rule of rulesFor(languages, today, yearStart, monthFirst)) {
    rule.re.lastIndex = 0;
    for (let m = rule.re.exec(text); m; m = rule.re.exec(text)) {
      const read = rule.read(m);
      if (read) found.push({ from: m.index, to: m.index + m[0].length, text: m[0], ...read });
    }
  }
  found.sort((a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from);
  const kept: PeriodWords[] = [];
  // Stryker disable next-line EqualityOperator: two period words never touch, since each must end before a letter or digit may stand and each starts with one
  for (const f of found) if (!kept.some((k) => f.from < k.to && k.from < f.to)) kept.push(f);
  return kept.sort((a, b) => a.from - b.from);
}
