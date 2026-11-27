// The reply reader (spec 0064, "Reading a reply" and "The offer"; GLOSSARY: Prompt, Breakdown, Submission Rule,
// Answer Language): what a text reply to a Prompt for one figure or several says, as values, notes, a question back or
// nothing. Pure and without a database. It records nothing and decides nobody's rights: the caller says which figures
// the sender was asked for and records through the core. Numbers and periods are read by the one reader (numbers.ts)
// and rows by parse.ts. The reply is untrusted text, so its length is bounded before any pattern runs over it.
import { findPeriodWords, numbersIn, readAnswer, DEFAULT_ANSWER_LANGUAGES, type AnswerContext, type AnswerReading, type NumberInText, type PeriodWords } from "./numbers";
import { parseBreakdown, readRow } from "./parse";
import { periodStart } from "./periods";
import { isGreeting, isSignature, newText, noteFrom, plainLine, replyWords, type ReplyNote } from "./reply-cleaning";
import type { SubmissionRule } from "./types";

/** One figure a reply may answer, in the order the message lists them: "1:" is the first. */
export type ReplyFigure = {
  /** The Metric's full name, as the message wrote it. */
  name: string;
  /** The Metric's unit, which may stand beside a number that is otherwise alone. */
  unit?: string;
  period: AnswerContext["period"];
  /** The first day of the period asked for. */
  promptPeriod?: string | null;
  /** The figure's value for that period once this person's value for it is in, by whichever way; null while open. */
  value: number | null;
  rule: SubmissionRule;
  /** Whether the period is locked, so that a new value is only proposed. */
  locked?: boolean;
  /** A number of the message that takes nothing by this reply (no longer asked, or only on the form): its line is
   * reported as `closed` and it is never filled in order. */
  closed?: boolean;
};

/** What a reply is read with. */
export type ReplyContext = Pick<AnswerContext, "style" | "today" | "yearStart" | "languages" | "monthFirst"> & {
  /** The figures the message asked this person for and numbered; at least one. */
  figures: readonly ReplyFigure[];
  /** Whether the reply is an email, which is cleaned of quoted text, greeting and signature; a chat message is taken whole. */
  email: boolean;
  /** Whether the message numbered its figures (a Combined Prompt), so that "1:" is read also when it holds only one. */
  numbered?: boolean;
  /** The sender's name, a line of which ends an email's note. */
  senderName?: string | null;
  /** The offer made to this person in this place that is still open, if any. */
  openOffer?: { figure: number; value: number } | null;
};

/** Why a number was not read: readAnswer's refusals. */
type Unread = Extract<AnswerReading, { ok: false }>;

/** A value a reply gives for a figure (an index into the figures). */
export type ReplyValue = {
  figure: number;
  value: number;
  period: string;
  named: PeriodWords | null;
  /** The words that are the value, which read as today's answer to give this value: what is submitted. */
  answer: string;
  /** The rows, when the value is a Breakdown's. */
  rows: { label: string; value: number }[] | null;
  note: ReplyNote | null;
};

/** A change offered after a note that holds one other number: taken by "yes", worded by `how`. */
export type ReplyOffer = { figure: number; value: number; how: "overwrite" | "add" | "keep_both" | "correction" };

/** What a reply says. */
export type ReplyReading =
  /** Values to record; in a message for several figures also notes for figures already in, lines that named a figure
   * but could not be read, figures named that take nothing by reply, and the figures still open afterwards. */
  | { kind: "values"; values: ReplyValue[]; notes: { figure: number; note: ReplyNote; holdsNumber: boolean }[]; unread: { figure: number; reading: Unread; answer: string }[]; closed: number[]; open: number[] }
  /** One figure: nothing is recorded, and `reading` says what to answer or ask back. */
  | { kind: "not_read"; figure: number; reading: Unread }
  /** A note for a value that is in. `holdsNumber` says whether its words hold any number; `sendAlone` asks for the
   * number alone, where they hold several. */
  | { kind: "note"; figure: number; note: ReplyNote; offer: ReplyOffer | null; holdsNumber: boolean; sendAlone: boolean }
  /** Words that could mean any of these figures: nothing is saved, and Ziffr asks which. */
  | { kind: "which_figure"; figures: number[] }
  /** "Yes" to the open offer. */
  | { kind: "accept_offer"; figure: number; value: number }
  /** A refusal or thanks once a value is in: nothing is saved and the question is closed. */
  | { kind: "closed" }
  /** Nothing to save; `yes` when the reply said yes with no offer open. */
  | { kind: "nothing"; yes?: boolean };

/** The longest reply read, in characters, as long as the longest email or chat message taken today. */
const REPLY_CHARS = 5000;

/** The reply as trimmed lines, without the email's quoted text and greeting, from the first line with something on it. */
function linesOf(text: string, ctx: ReplyContext, languages: readonly string[]): string[] {
  const bounded = String(text).slice(0, REPLY_CHARS);
  const body = ctx.email ? newText(bounded) : bounded;
  const lines = body.split(/\r\n?|[\n\u2028\u2029]/).map((l) => l.trim());
  const from = (at: number) => {
    const first = lines.findIndex((l, i) => i >= at && l !== "");
    return first < 0 ? lines.length : first;
  };
  let start = from(0);
  if (ctx.email && start < lines.length && isGreeting(lines[start], languages)) start = from(start + 1);
  return lines.slice(start);
}

/** The first paragraph of some lines of an email: up to an empty line or the signature. */
function paragraph(lines: string[], ctx: ReplyContext, languages: readonly string[]): string[] {
  const end = lines.findIndex((l) => l === "" || isSignature(l, languages, ctx.senderName));
  return end < 0 ? lines : lines.slice(0, end);
}

/** The lines of a note under a value: in a chat all of them; in an email the first paragraph, which may start after one
 * empty line. */
function noteUnder(lines: string[], ctx: ReplyContext, languages: readonly string[]): string[] {
  return ctx.email ? paragraph(lines.slice(lines[0] === "" ? 1 : 0), ctx, languages) : lines;
}

/** One line, with what the readers find in it. */
type Line = {
  text: string;
  /** The period words on it, other than a lone year that is the value. */
  words: PeriodWords[];
  /** The line with those words blanked out. */
  rest: string;
  numbers: NumberInText[];
};

/** A reading of one reply: the shared context and the lines' analysis. */
function reader(ctx: ReplyContext) {
  const languages = ctx.languages ?? DEFAULT_ANSWER_LANGUAGES;
  const today = periodStart(ctx.today, "day", ctx.yearStart);

  /** Each line with its period words taken out. A year on its own beside other period words, on the same line or
   * above, is the value and no period (as readAnswer has it, #126). */
  const analyse = (lines: string[]): Line[] => {
    let named = false;
    return lines.map((text) => {
      const found = findPeriodWords(text, today, ctx.yearStart, languages, ctx.monthFirst ?? false);
      const lone = (w: PeriodWords) => /^\d{4}$/.test(w.text);
      named ||= found.some((w) => !lone(w));
      const words = named ? found.filter((w) => !lone(w)) : found;
      let rest = text;
      for (const w of words) rest = rest.slice(0, w.from) + " ".repeat(w.to - w.from) + rest.slice(w.to);
      return { text, words, rest, numbers: numbersIn(rest, ctx.style) };
    });
  };

  const answerFor = (figure: ReplyFigure, text: string): AnswerReading =>
    readAnswer(text, { style: ctx.style, today: ctx.today, yearStart: ctx.yearStart, languages, monthFirst: ctx.monthFirst, period: figure.period, promptPeriod: figure.promptPeriod });

  // Each figure's name as lines are compared with it, worked out once for a reply.
  const names = ctx.figures.map((f) => plainLine(f.name));

  return { ctx, languages, today, names, analyse, answerFor };
}
type Reader = ReturnType<typeof reader>;

const CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

/** Whether a text is one number and nothing else but a unit, a currency, a percent sign or a closing full stop. */
function numberAlone(text: string, style: ReplyContext["style"], units: readonly string[]): boolean {
  const body = text.replace(/^\s*[:,]/, "");
  const numbers = numbersIn(body, style);
  if (numbers.length !== 1) return false;
  const [n] = numbers;
  const beside = `${body.slice(0, n.from)} ${body.slice(n.to)}`.replace(/[\p{Sc}%]/gu, " ");
  const isUnit = (words: string) => units.some((u) => plainLine(u) === plainLine(words));
  const words = beside.split(/\s+/).filter((w) => !CURRENCIES.has(w) && !/^(eur|usd|gbp|chf)$/i.test(w)).join(" ");
  return plainLine(words) === "" || isUnit(words) || isUnit(beside);
}

/** Whether a line is a number alone once its period words are out: "45", "45 €", "October: 45", and a year such as
 * "2050" that is all the line says. */
function bare(line: Line, r: Reader, units: readonly string[]): boolean {
  if (numberAlone(line.rest, r.ctx.style, units)) return true;
  return line.numbers.length === 0 && line.words.length === 1 && /^\d{4}$/.test(line.words[0].text) && numberAlone(line.text, r.ctx.style, units);
}

const unitsOf = (figures: readonly ReplyFigure[]) => figures.flatMap((f) => (f.unit ? [f.unit] : []));

/** The rows a line holds, one or several separated by ";", as parse.ts splits them. */
function rowsOn(text: string, r: Reader) {
  return text.split(";").filter((s) => s.trim() !== "").map((s) => readRow(s, r.ctx.style));
}

/** A Breakdown that starts at the first value line, and the lines after its last row. */
type Rows = { value: number; rows: { label: string; value: number }[]; answer: string; after: string[] };

/** The Breakdown a reply holds from its value line on (spec 0064): the value line is a row and there are two rows or
 * more, read as today; or the value line is a number alone and the rows right under it add up to it. */
function breakdownAt(lines: Line[], at: number, r: Reader, units: readonly string[]): Rows | null {
  const texts = lines.map((l) => l.text);
  const first = texts[at].split(";").find((s) => numbersIn(s, r.ctx.style).length > 0);
  const labelled = first !== undefined && readRow(first, r.ctx.style) !== null;
  let from = at;
  let end: number;
  if (labelled) {
    end = texts.reduce((last, t, i) => (i >= at && rowsOn(t, r).some(Boolean) ? i + 1 : last), at);
  } else {
    if (!bare(lines[at], r, units)) return null;
    from = at + 1;
    end = from;
    for (let i = from; i < texts.length; i++) {
      if (texts[i] === "") continue;
      if (!rowsOn(texts[i], r).every(Boolean)) break;
      end = i + 1;
    }
  }
  const answer = texts.slice(from, end).join("\n");
  const found = parseBreakdown(answer, r.ctx.style);
  if (!found) return null;
  const sum = found.rows.reduce((a, row) => a + row.value, 0);
  const value = found.total ?? sum;
  if (!labelled) {
    const lone = lines[at].numbers[0]?.value;
    const same = (x: number) => lone !== null && lone !== undefined && Math.abs(x - lone) <= 1e-9 * Math.max(1, Math.abs(lone));
    if (!same(sum) || !same(value)) return null;
  }
  return { value, rows: found.rows, answer, after: texts.slice(end) };
}

/** The refusal for a number alone that follows the value, which leaves it open which one is meant. */
function secondNumber(first: Line, after: Line[], r: Reader, units: readonly string[]): Unread | null {
  // A line that is only a date holds no number once its period words are out.
  const more = after.filter((l) => l.numbers.length > 0 && numberAlone(l.rest, r.ctx.style, units));
  return more.length ? { ok: false, reason: "several_numbers", numbers: [first, ...more].map((l) => l.numbers[0]?.text ?? l.text) } : null;
}

/** A value as one figure's first or new value, read from line `at` on, or why it records nothing. */
function valueAt(lines: Line[], at: number, figure: number, r: Reader, head: string): ReplyValue | Unread {
  const f = r.ctx.figures[figure];
  const units = unitsOf([f]);
  const value = (x: Omit<ReplyValue, "figure" | "note">, under: string[]): ReplyValue => ({ figure, ...x, note: noteFrom(noteUnder(under, r.ctx, r.languages)) });
  const rows = breakdownAt(lines, at, r, units);
  if (rows) {
    // A Breakdown is for the period asked for, as it is today.
    const period = f.promptPeriod ?? periodStart(r.today, f.period, r.ctx.yearStart);
    return value({ value: rows.value, period, named: null, answer: rows.answer, rows: rows.rows }, rows.after);
  }
  // Everything down to the value line is read as today, so period words on it or above it name the period.
  const answer = [...lines.slice(0, at).map((l) => l.text), head].join("\n");
  const reading = r.answerFor(f, answer);
  if (!reading.ok) return reading;
  const second = secondNumber(lines[at], lines.slice(at + 1), r, units);
  if (second) return second;
  return value({ value: reading.value, period: reading.period, named: reading.named, answer, rows: null }, lines.slice(at + 1).map((l) => l.text));
}

const oneValue = (v: ReplyValue): ReplyReading => ({ kind: "values", values: [v], notes: [], unread: [], closed: [], open: [] });

/** The first reply for one figure: the value line is the first that holds a number once period words are out. */
function firstValue(lines: Line[], r: Reader): ReplyReading {
  const at = lines.findIndex((l) => l.numbers.length > 0);
  if (at >= 0) {
    // In a message that numbered its only figure, "1:" says which one is meant and is no part of the value.
    const head = (r.ctx.numbered ? numbered(lines[at].text, 1)?.rest : undefined) ?? lines[at].text;
    const read = head === lines[at].text ? lines : [...lines.slice(0, at), ...r.analyse([head]), ...lines.slice(at + 1)];
    const v = valueAt(read, at, 0, r, head);
    return "value" in v ? oneValue(v) : { kind: "not_read", figure: 0, reading: v };
  }
  // No line holds a number: read as a whole, as today ("2026" alone is a value; "Q3" alone has no number).
  const answer = lines.map((l) => l.text).join("\n").trim();
  const reading = r.answerFor(r.ctx.figures[0], answer);
  if (!reading.ok) return { kind: "not_read", figure: 0, reading };
  return oneValue({ figure: 0, value: reading.value, period: reading.period, named: reading.named, answer, rows: null, note: null });
}

/** A note for a figure that is in, with the offer its one other number gives; nothing when no words are left. */
function noteReading(figure: number, lines: string[], r: Reader): ReplyReading {
  const note = noteFrom(lines);
  if (!note) return { kind: "nothing" };
  const f = r.ctx.figures[figure];
  const numbers = numbersOfNote(note, r);
  // A locked period takes a proposal whatever the rule; otherwise a rule that rejects a second value leaves no offer.
  const how: ReplyOffer["how"] | null = f.locked ? "correction" : f.rule === "reject" ? null : f.rule;
  const other = numbers.length === 1 ? numbers[0].value : null;
  const offer = how && other !== null && other !== f.value ? { figure, value: other, how } : null;
  return { kind: "note", figure, note, offer, holdsNumber: numbers.length > 0, sendAlone: how !== null && numbers.length > 1 };
}

/** The numbers a note's words hold, period words not counted. */
const numbersOfNote = (note: ReplyNote, r: Reader) => r.analyse(note.text.split("\n")).flatMap((l) => l.numbers);

/** The one number a note's words hold, period words not counted; null when they hold none or several. What an offer
 * made from those words offered, read again when "yes" takes it. */
export function loneNumber(words: string, ctx: Pick<ReplyContext, "style" | "today" | "yearStart" | "languages" | "monthFirst">): number | null {
  const numbers = numbersOfNote({ text: words.slice(0, REPLY_CHARS), cut: false }, reader({ ...ctx, figures: [], email: false }));
  return numbers.length === 1 ? numbers[0].value : null;
}

/** The lines of a note that is the reply itself: in an email its first paragraph, whose first line never ends it unless
 * it is all there is and only signs off. */
function wordsOf(lines: string[], r: Reader): string[] {
  if (!r.ctx.email) return lines;
  const under = paragraph(lines.slice(1), r.ctx, r.languages);
  return !under.length && isSignature(lines[0], r.languages, r.ctx.senderName) ? [] : [lines[0], ...under];
}

/** "1:" before a number or words: the figure it numbers (an index) and what follows; null for anything else. */
function numbered(text: string, count: number): { figure: number; rest: string } | null {
  const m = /^(\d{1,2}) ?:(.*)$/.exec(text);
  const figure = m ? Number(m[1]) - 1 : -1;
  return m && figure >= 0 && figure < count ? { figure, rest: m[2].trim() } : null;
}

/** How far into a line a colon is looked for after a Metric's name. */
const NAME_CHARS = 300;

/** A line that starts with a figure's number, or with its full name and a colon; null for any other line, and for a
 * name two figures share. */
function labelled(text: string, r: Reader): { figure: number; rest: string } | null {
  const byNumber = numbered(text, r.ctx.figures.length);
  if (byNumber) return byNumber;
  for (let at = text.indexOf(":"); at >= 0 && at < NAME_CHARS; at = text.indexOf(":", at + 1)) {
    const head = plainLine(text.slice(0, at));
    const found = head === "" ? [] : r.names.flatMap((name, i) => (name === head ? [i] : []));
    if (found.length === 1) return { figure: found[0], rest: text.slice(at + 1).trim() };
  }
  return null;
}

/** A later reply for the one figure: a number alone or a Breakdown at its start is a new value; anything else is a note. */
function laterValue(lines: Line[], r: Reader): ReplyReading {
  // Period words may stand alone above the value ("October" and, under it, "45").
  const found = lines.findIndex((l) => l.text !== "" && !(l.words.length > 0 && !/[\p{L}\p{N}]/u.test(l.rest)));
  const at = Math.max(found, 0);
  const label = labelled(lines[at].text, r);
  const corrected = /^correction ?:(.*)$/i.exec(lines[at].text)?.[1].trim();
  const head = label?.rest ?? corrected ?? lines[at].text;
  const withHead = [...lines.slice(0, at), ...r.analyse([head]), ...lines.slice(at + 1)];
  const units = unitsOf(r.ctx.figures);
  if (bare(withHead[at], r, units) || breakdownAt(withHead, at, r, units)) {
    const v = valueAt(withHead, at, 0, r, head);
    return "value" in v ? oneValue(v) : { kind: "not_read", figure: 0, reading: v };
  }
  // The note keeps the reply's words, but not the "1:" that only says which figure it is for.
  const texts = lines.map((l) => l.text);
  if (numbered(texts[0], 1)) texts[0] = numbered(texts[0], 1)!.rest;
  const from = texts.findIndex((t) => t !== "");
  return from < 0 ? { kind: "nothing" } : noteReading(0, wordsOf(texts.slice(from), r), r);
}

/** A reply whose lines say which figure they are for: each figure's number read clearly is a value; other words are a
 * note where its value is in. */
function labelledFigures(texts: string[], labels: ({ figure: number; rest: string } | null)[], r: Reader): ReplyReading {
  const { figures } = r.ctx;
  const starts = labels.flatMap((l, i) => (l ? [i] : []));
  const parts = starts.map((start, i) => ({ ...labels[start]!, under: texts.slice(start + 1, starts[i + 1] ?? texts.length) }));
  const values: ReplyValue[] = [];
  const notes: { figure: number; note: ReplyNote; holdsNumber: boolean }[] = [];
  const unread: { figure: number; reading: Unread; answer: string }[] = [];
  const closed: number[] = [];
  const noted: { figure: number; lines: string[] }[] = [];
  for (const figure of [...new Set(parts.map((p) => p.figure))].sort((a, b) => a - b)) {
    const f = figures[figure];
    if (f.closed) { closed.push(figure); continue; }
    const units = unitsOf([f]);
    const own = parts.filter((p) => p.figure === figure);
    const heads = own.map((p) => r.analyse([p.rest])[0]);
    const alone = heads.filter((h) => bare(h, r, units));
    if (!alone.length) {
      if (f.value === null) {
        // Words are no value: the figure stays open, with the reason where the number reader has one.
        const reading = r.answerFor(f, own[0].rest);
        if (!reading.ok) unread.push({ figure, reading, answer: own[0].rest });
        continue;
      }
      const lines = own.flatMap((p) => (r.ctx.email ? [p.rest, ...paragraph(p.under, r.ctx, r.languages)] : [p.rest, ...p.under]));
      noted.push({ figure, lines });
      continue;
    }
    const [part] = own;
    const reading = r.answerFor(f, part.rest);
    if (!reading.ok) { unread.push({ figure, reading, answer: part.rest }); continue; }
    // Two lines for one figure, or a second number alone under it, leave it open which one is meant.
    const second = own.length > 1 ? { ok: false as const, reason: "several_numbers" as const, numbers: heads.flatMap((h) => h.numbers.map((n) => n.text)) } : secondNumber(heads[0], r.analyse(part.under), r, units);
    if (second) { unread.push({ figure, reading: second, answer: part.rest }); continue; }
    values.push({ figure, value: reading.value, period: reading.period, named: reading.named, answer: part.rest, rows: null, note: noteFrom(noteUnder(part.under, r.ctx, r.languages)) });
  }
  if (!values.length && !unread.length && !closed.length && noted.length === 1) return noteReading(noted[0].figure, noted[0].lines, r);
  for (const n of noted) {
    const note = noteFrom(n.lines);
    if (note) notes.push({ figure: n.figure, note, holdsNumber: numbersOfNote(note, r).length > 0 });
  }
  return { kind: "values", values, notes, unread, closed, open: stillOpen(figures, values) };
}

const stillOpen = (figures: readonly ReplyFigure[], values: ReplyValue[]) =>
  figures.flatMap((f, i) => (f.value === null && !f.closed && !values.some((v) => v.figure === i) ? [i] : []));

/** A reply to a message for several figures. */
function severalFigures(lines: Line[], r: Reader): ReplyReading {
  const { figures } = r.ctx;
  const texts = lines.map((l) => l.text);
  const labels = texts.map((t) => labelled(t, r));
  if (labels.some(Boolean)) return labelledFigures(texts, labels, r);
  const open = stillOpen(figures, []);
  const units = unitsOf(figures);
  const alone = lines.flatMap((l, i) => (bare(l, r, units) ? [i] : []));
  // Numbers alone are taken in order, and only when there is exactly one for every open figure (decision 3).
  if (open.length && alone.length === open.length) {
    const values: ReplyValue[] = [];
    const unread: { figure: number; reading: Unread; answer: string }[] = [];
    alone.forEach((at, i) => {
      const figure = open[i];
      const reading = r.answerFor(figures[figure], texts[at]);
      if (!reading.ok) { unread.push({ figure, reading, answer: texts[at] }); return; }
      const note = noteFrom(noteUnder(texts.slice(at + 1, alone[i + 1] ?? texts.length), r.ctx, r.languages));
      values.push({ figure, value: reading.value, period: reading.period, named: reading.named, answer: texts[at], rows: null, note });
    });
    return { kind: "values", values, notes: [], unread, closed: [], open: stillOpen(figures, values) };
  }
  const nothingRead: ReplyReading = { kind: "values", values: [], notes: [], unread: [], closed: [], open };
  if (open.length && alone.length) return nothingRead;
  const filled = figures.flatMap((f, i) => (f.value === null ? [] : [i]));
  if (!filled.length) return nothingRead;
  if (filled.length > 1) return { kind: "which_figure", figures: filled };
  return noteReading(filled[0], wordsOf(texts, r), r);
}

/** Whether a reply is one of these words and nothing else (an email's signature aside). */
function saysOnly(texts: string[], words: string[], r: Reader): boolean {
  const under = noteUnder(texts.slice(1), r.ctx, r.languages);
  return words.includes(plainLine(texts[0])) && under.every((t) => t === "");
}

/** Reads a text reply (spec 0064, "Reading a reply"). The same reader takes every Connector's replies; an email is
 * cleaned first. */
export function readReply(text: string, ctx: ReplyContext): ReplyReading {
  const r = reader(ctx);
  const texts = linesOf(text, ctx, r.languages);
  if (!texts.length) return { kind: "nothing" };
  const offer = ctx.openOffer;
  const yes = saysOnly(texts, replyWords(r.languages, "yes"), r);
  if (yes && offer) return { kind: "accept_offer", figure: offer.figure, value: offer.value };
  if (ctx.figures.some((f) => f.value !== null)) {
    // "Yes" with no open offer saves nothing: it never approves, sends back or confirms anything.
    if (yes) return { kind: "nothing", yes: true };
    if (saysOnly(texts, ["-", ...replyWords(r.languages, "no")], r)) return { kind: "closed" };
  }
  const lines = r.analyse(texts);
  if (ctx.figures.length > 1) return severalFigures(lines, r);
  return ctx.figures[0].value === null ? firstValue(lines, r) : laterValue(lines, r);
}
