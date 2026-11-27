// Breakdown parsing (GLOSSARY: Breakdown, Number Style). Pure, so the form previews pasted rows with the rules the
// core applies; the numbers are read by the one reader (numbers.ts), in the Workspace's Number Style.
import type { NumberStyle } from "./number-style";
import { readNumber } from "./numbers";

const TOTAL = /^(total|gesamt|summe|sum)$/i;

// The header cell that says a third column holds parents (English and German, as the words for a total are): without one, a third cell is a unit or a note, as it always was.
const PARENT_HEADER = /^(parent( row| name)?|eltern(zeile)?|übergeordnet(e zeile|es element)?|gehört zu)$/i;
const hasParentHeader = (text: string): boolean => {
  const first = text.split(/\r?\n|;/).find((l) => l.trim() !== "");
  return first?.split(/[\t,]/).some((c) => PARENT_HEADER.test(c.trim().replace(/^["']|["']$/g, ""))) === true;
};

// A line is a label, a separator and a number, then perhaps a unit and a quote: "Germany: 1.234 €". The label is the
// shortest start of the line after which the rest reads that way. A line copied from a spreadsheet with a parent column
// has the parent, the label of another row of the same list, in a third cell (spec 0041, ticket 12): tabs apart, or
// commas as a CSV file writes it. A parent is text, so it cannot start with a digit, as a label cannot, and an empty
// cell is a row at the top (there the line has only two cells, which is the plain case).
const QUOTE = /["']/;
const SPACE = /\s/;
const TAB = /\t/;
const DIGIT = /\d/;
const SIGN = /[+\-−]/;
// What a number goes on with after its first digit, every kind of group mark included.
const IN_NUMBER = /[\d.,'’ \u00a0\u202f]/;
// A label stays on one line.
const LINE_END = /[\n\r\u2028\u2029]/;
const UNIT = /^(%|€|eur|k)/i;
// What may close a line after the number: a unit, a quote, both or neither.
const CLOSING = /^(%|€|eur|k|)["']?$/i;

/** For each position of a line, where the run of such characters starting there ends: the position itself where none
 * starts. */
function runEnds(line: string, one: RegExp): number[] {
  const ends = new Array<number>(line.length + 1).fill(line.length);
  for (let i = line.length; i--; ) ends[i] = one.test(line[i]) ? ends[i + 1] : i;
  return ends;
}

/** For each position of a line, the last position up to it that passes; -1 before the first one. */
function lastPassing(line: string, passes: (at: number) => boolean): number[] {
  const last: number[] = [];
  // Stryker disable next-line UnaryOperator: no number ends this close to the start of a line, so 1 is passed over as -1 is.
  let found = -1;
  for (let i = 0; i <= line.length; i++) {
    if (passes(i)) found = i;
    last.push(found);
  }
  return last;
}

/** The position after a quote that stands here, else this position. */
const pastQuote = (line: string, at: number): number => (QUOTE.test(line.charAt(at)) ? at + 1 : at);

/** The unit that stands here, as typed; empty when none does. */
const unitAt = (line: string, at: number): string => UNIT.exec(line.slice(at, at + 3))?.[1] ?? "";

/** The first digit of a number that starts here, with or without a sign; -1 when none starts here. */
function firstDigit(line: string, at: number): number {
  const digit = SIGN.test(line.charAt(at)) ? at + 1 : at;
  return DIGIT.test(line.charAt(digit)) ? digit : -1;
}

/** What follows a label: the number as typed, the unit and, in a table with a parent column, the parent cell. */
type Cells = { number: string; unit: string; parent?: string };
/** Reads what follows a label that ends at a position; null when it does not read that way. */
type After = (end: number) => Cells | null;

/** Finds the number that starts at a position and reaches as far as what follows it still closes the line. `closes` says,
 * for each position, what closes the line from there. */
function longestNumber<T>(line: string, closes: (at: number) => T | null): (at: number) => { number: string; closed: T } | null {
  const ends = runEnds(line, IN_NUMBER);
  const closed = Array.from({ length: line.length + 1 }, (_, i) => closes(i));
  const last = lastPassing(line, (i) => closed[i] !== null);
  return (at) => {
    const digit = firstDigit(line, at);
    // Stryker disable next-line EqualityOperator: a digit follows a label, so it never stands at 0.
    if (digit < 0) return null;
    const end = last[ends[digit + 1]];
    // Stryker disable next-line EqualityOperator: nothing closes a line at a digit, so end is never digit.
    return end > digit ? { number: line.slice(at, end), closed: closed[end]! } : null;
  };
}

/** Label and number: a tab, colon or comma between them, or spaces. */
function plainCells(line: string): After {
  const spaces = runEnds(line, SPACE);
  const number = longestNumber(line, (i) => CLOSING.exec(line.slice(spaces[i])));
  return (end) => {
    const after = pastQuote(line, end);
    let at = spaces[after];
    if (line[at] === ":" || line[at] === ",") at = spaces[at + 1];
    if (at === after) return null;
    const found = number(pastQuote(line, at));
    return found && { number: found.number, unit: found.closed[1] };
  };
}

/** Reads the parent cell that starts at a position and holds no further separator; null when none starts there. */
function parentCell(line: string, separator: string): (at: number) => string | null {
  const lastSeparator = line.lastIndexOf(separator);
  const startingAt = (at: number) => {
    if (at >= line.length || DIGIT.test(line[at]) || lastSeparator > at) return null;
    const closing = line.length - 1;
    return line.slice(at, closing > at && QUOTE.test(line[closing]) ? closing : line.length);
  };
  // A quote that opens the cell is not part of it, unless nothing can be read after it.
  return (at) => (QUOTE.test(line.charAt(at)) ? startingAt(at + 1) : null) ?? startingAt(at);
}

/** Label, number and parent, tabs between the cells. */
function tabCells(line: string): After {
  const spaces = runEnds(line, SPACE);
  const tabs = runEnds(line, TAB);
  const cell = parentCell(line, "\t");
  // The unit and the parent after a number, when the white space after it ends here.
  const rest = (at: number): { unit: string; parent: string } | null => {
    const unit = unitAt(line, at);
    const tab = pastQuote(line, at + unit.length);
    if (line[tab] !== "\t") return null;
    // The parent follows the tabs; where nothing reads there, the last tab opens the parent cell.
    const next = tabs[tab];
    const parent = cell(next) ?? (next - 1 > tab ? cell(next - 1) : null);
    return parent === null ? null : { unit, parent };
  };
  // The white space may end past all of it, or else at a tab inside it, the latest such tab first.
  const lastTab = lastPassing(line, (i) => rest(i) !== null);
  const number = longestNumber(line, (i) => {
    const past = rest(spaces[i]);
    if (past) return past;
    // A tab found before i is outside this white space, and before the first character there is none.
    const tab = lastTab[spaces[i] - 1];
    return tab >= i ? rest(tab) : null;
  });
  return (end) => {
    const tab = pastQuote(line, end);
    if (line[tab] !== "\t") return null;
    const found = number(pastQuote(line, tabs[tab]));
    return found && { number: found.number, ...found.closed };
  };
}

/** Label, number and parent as a CSV file writes them: commas between the cells, the number with no comma of its own. */
function csvCells(line: string): After {
  const spaces = runEnds(line, SPACE);
  const digits = runEnds(line, DIGIT);
  const cell = parentCell(line, ",");
  return (end) => {
    const comma = pastQuote(line, end);
    if (line[comma] !== ",") return null;
    const at = pastQuote(line, spaces[comma + 1]);
    const digit = firstDigit(line, at);
    // Stryker disable next-line ConditionalExpression,EqualityOperator: without a digit no comma is found below either, and a digit never stands at 0.
    if (digit < 0) return null;
    let stop = digits[digit];
    if (line[stop] === "." && DIGIT.test(line.charAt(stop + 1))) stop = digits[stop + 1];
    const unit = unitAt(line, spaces[stop]);
    const second = spaces[pastQuote(line, spaces[stop] + unit.length)];
    if (line[second] !== ",") return null;
    // Where nothing reads after the white space, its last character opens the parent cell.
    const next = spaces[second + 1];
    const parent = cell(next) ?? (next > second + 1 ? cell(next - 1) : null);
    return parent === null ? null : { number: line.slice(at, stop), unit, parent };
  };
}

/** The shortest label after which the line reads as these cells. A quote that opens the line is not part of the label,
 * unless the line reads only with it. */
function split(line: string, cells: After): (Cells & { label: string }) | null {
  const longest = line.split(LINE_END)[0].length;
  for (const start of QUOTE.test(line.charAt(0)) ? [1, 0] : [0]) {
    for (let end = start + 1; end <= longest; end++) {
      const found = cells(end);
      if (found) return { label: line.slice(start, end), ...found };
    }
  }
  return null;
}

/** One line of a Breakdown as a row: its label, its number and, in a table with a parent column, its parent; null for a
 * line that is no row. A line naming the total is a row too. */
export function readRow(raw: string, style: NumberStyle, parents = false): { label: string; value: number; parent?: string } | null {
  // Trimmed first, so a quote after leading spaces still opens the label. An empty line matches nothing below.
  // A trailing comma is an empty last cell of a CSV line.
  const line = raw.trim().replace(/,$/, "");
  // The lines are already split at ";", and every other separator is one a row knows: "Germany\t1 234,5" is Germany and 1234.5.
  const m = (parents ? split(line, tabCells(line)) ?? split(line, csvCells(line)) : null) ?? split(line, plainCells(line));
  if (!m) return null;
  const label = m.label.trim();
  const value = readNumber(`${m.number.trim()}${m.unit.toLowerCase() === "k" ? "k" : ""}`, style);
  if (value === null || !label || /^\d/.test(label)) return null;
  const parent = m.parent?.trim();
  return parent ? { label, value, parent } : { label, value };
}

/** Reads "label value" lines (from Excel, CSV or a chat) into rows, each with the label of its parent when the header names a parent column and a third cell names one. Needs two or more rows to count as a breakdown. */
export function parseBreakdown(text: string, style: NumberStyle, options: { parents?: boolean } = {}): { rows: { label: string; value: number; parent?: string }[]; total: number | null } | null {
  const rows: { label: string; value: number; parent?: string }[] = [];
  // Only a table pasted or loaded on the web (never a message from mail, Slack or Telegram, where a third cell or a line of text is something else) may have a parent column, and only under a header that says so.
  const parents = options.parents === true && hasParentHeader(text);
  let total: number | null = null;
  for (const raw of text.split(/\r?\n|;/)) {
    const row = readRow(raw, style, parents);
    if (!row) continue;
    if (TOTAL.test(row.label)) total = row.value;
    else rows.push(row);
  }
  return rows.length >= 2 ? { rows, total } : null;
}
