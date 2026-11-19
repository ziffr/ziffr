// Reading a paste from a spreadsheet (spec 0026; GLOSSARY: Observation, Period, Number Style, Metric): the cells a
// person copied, as the clipboard's plain text, read into values for Metrics and periods. Pure, so the same reading
// runs for the preview and for the recording, and for a dropped file's rows later. Nothing here knows who pastes:
// the caller passes only the Metrics the person may see, so a name that matches none is "not a Metric you can see
// here" whether it exists or not. Periods are read by the core's period words, numbers by its one reader.
import { parseISO } from "date-fns";
import type { NumberStyle } from "./number-style";
import { DEFAULT_ANSWER_LANGUAGES, findPeriodWords, readNumber } from "./numbers";
import { periodStart, type Span, type YearStart } from "./periods";
import type { Format, Period } from "./types";

/** The most text one paste may hold, in bytes of UTF-8, and the most values; checked before anything is read. */
export const PASTE_LIMITS = { bytes: 256 * 1024, values: 2000 } as const;

/** The cells of a paste, trimmed, as a rectangle; `top` and `left` are how many empty rows and columns were dropped
 * at the edges, so a cell's place is still the one it had in the paste. */
export type Grid = { cells: string[][]; top: number; left: number };

/** Why a paste could not be read as cells at all. */
export type GridProblem = "empty" | "too_large" | "not_cells";

/** The ways a paste is laid out (spec 0026, "Recognising the layout"). */
export type PasteLayout = "wide" | "wide_transposed" | "long" | "one_metric";

/** What the reader needs to know of a Metric the person may see. */
export type PasteMetric = { id: number; slug: string; name: string; period: Period; unit: string; format: Format };

/** What a paste is read with: the Workspace's Number Style, Fiscal Year and Answer Languages, today, the Metrics the
 * person may see, the Metric the page was opened for (for a two-column paste), and a layout the person picked. */
export type PasteContext = {
  style: NumberStyle;
  /** Today, as a yyyy-mm-dd, in the Workspace's clock. */
  today: string;
  yearStart: YearStart;
  languages?: readonly string[];
  /** Whether "10/1/2026" is 1 October (the US), not 10 January. */
  monthFirst?: boolean;
  metrics: readonly PasteMetric[];
  metricId?: number | null;
  layout?: PasteLayout | null;
};

/** Why one value of a paste records nothing; every reason names what the person can fix in the sheet. */
export type PasteProblem =
  | { reason: "no_metric" }
  | { reason: "not_visible"; text: string }
  | { reason: "ambiguous"; text: string; slugs: string[] }
  | { reason: "not_a_period"; text: string }
  | { reason: "other_length"; text: string; span: Span }
  | { reason: "future_period"; text: string }
  | { reason: "not_a_number"; text: string }
  | { reason: "spreadsheet_error"; text: string }
  | { reason: "wrong_unit"; text: string }
  | { reason: "duplicate"; places: string[] };

/** One value of a paste: its place ("C7"), the cell texts it was read from, and what was read, or why not. */
export type PasteValue = {
  place: string;
  text: string;
  metricText: string;
  periodText: string;
  metricId: number | null;
  /** The first day of the Metric's period the cell names. */
  period: string | null;
  value: number | null;
  problem: PasteProblem | null;
};

/** What a paste says: the layout it was read in, the other layouts it fits, and every value in it; or why it was
 * not read at all. `metrics` and `periods` count the rows and columns of a wide paste, or the distinct ones. */
export type PasteReading =
  | { ok: true; layout: PasteLayout; alternatives: PasteLayout[]; metrics: number; periods: number; values: PasteValue[] }
  | { ok: false; reason: GridProblem | "no_layout" }
  | { ok: false; reason: "too_many_values"; count: number };

/** A cell's place as a spreadsheet names it: row 0, column 2 is "C1"; column 26 is "AA". */
export function cellName(row: number, col: number): string {
  let letters = "";
  for (let c = col + 1; c > 0; c = Math.floor((c - 1) / 26)) letters = String.fromCharCode(65 + ((c - 1) % 26)) + letters;
  return `${letters}${row + 1}`;
}

/** Splits text into rows and cells. Quoted cells may hold the separator, line breaks and doubled quotes, as Excel and
 * Google Sheets write a cell with a line break. A row ends at \r\n, \n or \r. */
function split(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  // A quote opens a quoted cell only as the cell's first character, after spaces; anywhere else it is text.
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' && cell.trim() === "") {
      cell = "";
      i++;
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') { cell += '"'; i += 2; }
        else if (text[i] === '"') { i++; break; }
        else cell += text[i++];
      }
      continue;
    }
    if (ch === sep) { row.push(cell); cell = ""; i++; continue; }
    if (ch === "\r" || ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += ch;
    i++;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/** The size of a text in bytes of UTF-8, as it arrives in a request. */
function bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Reads pasted text into cells (spec 0026, "Reading the grid"): tabs separate cells, as every spreadsheet puts them
 * on the clipboard. Without a tab anywhere, a semicolon or a comma is tried as a CSV would be, but only when every
 * row then has the same number of cells, more than one. Empty rows and columns at the edges are dropped. */
export function readGrid(text: string): { ok: true; grid: Grid } | { ok: false; reason: GridProblem } {
  if (typeof text !== "string") return { ok: false, reason: "empty" };
  if (bytes(text) > PASTE_LIMITS.bytes) return { ok: false, reason: "too_large" };
  const body = text.replace(/^﻿/, "");
  if (!body.trim()) return { ok: false, reason: "empty" };
  let rows: string[][] | null = null;
  if (body.includes("\t")) rows = split(body, "\t");
  else {
    for (const sep of [";", ","]) {
      const tried = split(body, sep).filter((r) => r.some((c) => c.trim()));
      if (tried[0].length > 1 && tried.every((r) => r.length === tried[0].length)) { rows = split(body, sep); break; }
    }
  }
  if (!rows) return { ok: false, reason: "not_cells" };
  const trimmed = rows.map((r) => r.map((c) => c.trim()));
  const width = Math.max(...trimmed.map((r) => r.length));
  const full = trimmed.map((r) => [...r, ...Array<string>(width - r.length).fill("")]);
  const used = (r: string[]) => r.some(Boolean);
  const top = full.findIndex(used);
  const bottom = full.length - [...full].reverse().findIndex(used);
  const kept = full.slice(top, bottom);
  const colUsed = (c: number) => kept.some((r) => r[c]);
  let left = 0;
  while (!colUsed(left)) left++;
  let right = width;
  while (!colUsed(right - 1)) right--;
  return { ok: true, grid: { cells: kept.map((r) => r.slice(left, right)), top, left } };
}

// Spreadsheet errors, as Excel, Google Sheets, LibreOffice and Numbers show them: "#N/A", "#DIV/0!", "#VALUE!",
// "#REF!", "#NAME?", "#NUM!", "#NULL!", "#SPILL!", "#CALC!", "#ERROR!", "Err:502".
const SPREADSHEET_ERROR = /^(?:#[A-Z][A-Z0-9_/]*[!?]?|#DIV\/0!|Err:\d{3})$/i;

// Currency signs and the codes they stand for, so "EUR 1.200" is read for a Metric in "€".
const SIGN_CODE: Readonly<Record<string, string>> = { "€": "EUR", $: "USD", "US$": "USD", "£": "GBP", "¥": "JPY", "₹": "INR", "₩": "KRW", "₽": "RUB", "₪": "ILS", "฿": "THB", "₺": "TRY", "zł": "PLN", "Kč": "CZK", Fr: "CHF" };
// Codes common enough that a cell such as "CHF 1'200" is taken for a value when a layout is recognised; any other
// code still reads as a value for a Metric whose unit it is.
const COMMON_CODES = new Set(["eur", "usd", "gbp", "chf", "jpy", "sek", "nok", "dkk", "pln", "czk", "huf", "cad", "aud", "nzd", "inr", "cny", "brl", "mxn", "zar", "try"]);
// What may stand around a number that is not part of it: a currency sign or code, or a percent sign.
const AROUND = String.raw`[A-Z]{3}|US\$|[$€£¥₹₩₽₪฿₺]|kr|zł|Kč|Fr\.?|%`;
const UNIT_AROUND = new RegExp(String.raw`^(?:(${AROUND})\s*)?([+\-−]?\s*(?:\d.*\d|\d)(?:\s?[kKM])?)(?:\s*(${AROUND}))?$`, "u");

/** A value cell taken apart: whether it is negative by a sign or brackets around it, the number, and the unit
 * written beside it (in lower case, "%" for percent); null when it is not shaped like a number at all, or has a
 * unit on both sides. */
function valueParts(text: string): { negative: boolean; number: string; mark: string | null } | null {
  const bracket = /^\((.+)\)$/.exec(text);
  let s = (bracket ? bracket[1] : text).trim();
  // A sign written before the currency ("-€1,200", "- 1 200 €" is the number's own sign) is taken off first.
  const sign = /^([+\-−])\s*(?=[^\d\s])/u.exec(s);
  if (sign) s = s.slice(sign[0].length);
  const around = UNIT_AROUND.exec(s);
  if (!around || (around[1] && around[3])) return null;
  const number = around[2].replace(/^([+\-−])\s+/u, "$1");
  // A sign inside brackets, or a second sign, is no way to write a number.
  if ((bracket || sign) && /^[+\-−]/u.test(number)) return null;
  const negative = !!bracket || (!!sign && sign[1] !== "+");
  return { negative, number, mark: (around[1] ?? around[3])?.replace(/\.$/, "").toLowerCase() ?? null };
}

/** The words a cell's unit may be written with for a Metric: its unit, the code of its currency sign, and "%" for a
 * percent Metric. */
function unitsOf(m: Pick<PasteMetric, "unit" | "format">): Set<string> {
  const u = m.unit.trim();
  const out = new Set<string>();
  if (u) out.add(u.toLowerCase());
  const code = Object.hasOwn(SIGN_CODE, u) ? SIGN_CODE[u] : /^[A-Za-z]{3}$/.test(u) ? u.toUpperCase() : null;
  if (code) {
    out.add(code.toLowerCase());
    for (const [sign, c] of Object.entries(SIGN_CODE)) if (c === code) out.add(sign.toLowerCase());
  }
  if (m.format === "percent" || u === "%") out.add("%");
  return out;
}

/** A value cell as a number for a Metric (spec 0026, "Reading numbers"): read in the Workspace's Number Style, with
 * a currency sign or code and a percent sign taken off only when they match the Metric's unit, and an accounting
 * negative in brackets read as negative. `null` value with no problem: the cell is empty, which is no value. */
export function readValueCell(text: string, m: Pick<PasteMetric, "unit" | "format">, style: NumberStyle): { value: number | null; problem: PasteProblem | null } {
  const t = text.trim();
  if (!t) return { value: null, problem: null };
  if (SPREADSHEET_ERROR.test(t)) return { value: null, problem: { reason: "spreadsheet_error", text: t } };
  const parts = valueParts(t);
  const v = parts ? readNumber(parts.number, style) : null;
  if (!parts || v === null) return { value: null, problem: { reason: "not_a_number", text: t } };
  if (parts.mark && !unitsOf(m).has(parts.mark)) return { value: null, problem: { reason: "wrong_unit", text: t } };
  return { value: parts.negative ? -v || 0 : v, problem: null };
}

/** Whether a cell is shaped like a value of any unit: a number with a sign, a common currency code or a percent
 * around it, or a spreadsheet error. Recognising a layout asks this; reading a value asks `readValueCell`. */
function looksLikeValue(text: string, style: NumberStyle): boolean {
  if (SPREADSHEET_ERROR.test(text)) return true;
  const parts = valueParts(text);
  if (!parts || readNumber(parts.number, style) === null) return false;
  return !parts.mark || !/^[a-z]{3}$/.test(parts.mark) || COMMON_CODES.has(parts.mark);
}

/** The period a cell names, by its span and first day, or null when it names none. The whole cell must be the
 * period: "2026-10" and "Oct-26" as spreadsheets write months, then every period word the core reads ("Q3 2026",
 * "KW 46", "01.10.2026"). A number that is not a date, such as a date serial ("46296"), is never one. `start` is
 * null for a cell shaped like a period that is none ("week 60"). */
export function readPeriodCell(text: string, ctx: PeriodReading): { span: Span; start: string | null } | null {
  // Each text is read once per context: finding period words builds its patterns anew, and a paste of 2,000 rows
  // asks about the same few period cells again and again while its layout is recognised.
  const seen = readPeriods.get(ctx) ?? new Map<string, ReturnType<typeof readPeriodCell>>();
  readPeriods.set(ctx, seen);
  if (seen.has(text)) return seen.get(text)!;
  const read = periodOfCell(text, ctx);
  seen.set(text, read);
  return read;
}

/** What period cells are read with. */
type PeriodReading = Pick<PasteContext, "today" | "yearStart" | "languages" | "monthFirst">;
const readPeriods = new WeakMap<PeriodReading, Map<string, { span: Span; start: string | null } | null>>();

/** The period a cell names, read anew (see readPeriodCell). */
function periodOfCell(text: string, ctx: PeriodReading): { span: Span; start: string | null } | null {
  const t = text.trim().replace(/\s+/g, " ");
  const isoMonth = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (isoMonth) {
    const mo = Number(isoMonth[2]);
    return { span: "month", start: mo >= 1 && mo <= 12 ? `${isoMonth[1]}-${String(mo).padStart(2, "0")}-01` : null };
  }
  // Dates written in digits with their year, the most common period cells, are read here: finding period words
  // builds its patterns for every text, too slow for 2,000 different days. They read as the period words would.
  // A plain number is no period unless it is a year of four digits: no period word is digits alone otherwise.
  if (/^\d{1,3}(?:[.,]\d+)?$|^\d{5,}(?:[.,]\d+)?$|^\d{4}[.,]\d+$/.test(t)) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/.exec(t);
  if (iso) return { span: "day", start: calendarDay(Number(iso[1]), Number(iso[2]), Number(iso[3])) };
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (dotted) return { span: "day", start: calendarDay(Number(dotted[3]), Number(dotted[2]), Number(dotted[1])) };
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (slashed) {
    const [d, mo] = ctx.monthFirst ? [slashed[2], slashed[1]] : [slashed[1], slashed[2]];
    return { span: "day", start: calendarDay(Number(slashed[3]), Number(mo), Number(d)) };
  }
  // "Oct-26", "Okt.-2026": a month and its year, as Excel shows the format mmm-yy.
  const dashed = /^(\p{L}+\.?)[-/](\d{2}|\d{4})$/u.exec(t);
  if (dashed) {
    const month = whole(`${dashed[1]} ${dashed[2].length === 2 ? `20${dashed[2]}` : dashed[2]}`, ctx);
    if (month?.span === "month") return month;
  }
  return whole(t, ctx);
}

/** A calendar day as a yyyy-mm-dd, or null when there is none (31 February). */
function calendarDay(y: number, m: number, d: number): string | null {
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The period words that are the whole of a text, or null. */
function whole(text: string, ctx: PeriodReading): { span: Span; start: string | null } | null {
  const found = findPeriodWords(text, ctx.today, ctx.yearStart, ctx.languages ?? DEFAULT_ANSWER_LANGUAGES, ctx.monthFirst ?? false);
  if (found.length !== 1 || found[0].from !== 0 || found[0].to !== text.length) return null;
  return { span: found[0].span, start: found[0].start };
}

/** The Metric's period a period cell names (spec 0026, "Reading periods"): the same span, or a day inside one ("2026-
 * 10-15" is October for a monthly Metric). A period of another length is refused, never split or combined; so is
 * one still to come. */
function periodFor(cell: string, m: PasteMetric, ctx: PasteContext): { period: string } | { problem: PasteProblem } {
  const read = readPeriodCell(cell, ctx);
  if (!read || read.start === null) return { problem: { reason: "not_a_period", text: cell } };
  if (read.span !== m.period && read.span !== "day") return { problem: { reason: "other_length", text: cell, span: read.span } };
  const period = periodStart(parseISO(read.start), m.period, ctx.yearStart);
  if (period > periodStart(parseISO(ctx.today), m.period, ctx.yearStart)) return { problem: { reason: "future_period", text: cell } };
  return { period };
}

/** A name as it is compared: without case, spaces at the ends or repeated spaces. */
const key = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/** The Metric a cell names, by slug or name, among the Metrics the person may see. A slug names one Metric; a name
 * that two Metrics share is ambiguous, and their slugs say which. */
export function findMetric(text: string, metrics: readonly PasteMetric[]): { metric: PasteMetric } | { problem: PasteProblem } {
  const k = key(text);
  if (!k) return { problem: { reason: "no_metric" } };
  const bySlug = metrics.find((m) => m.slug.toLowerCase() === k);
  if (bySlug) return { metric: bySlug };
  const byName = metrics.filter((m) => key(m.name) === k);
  if (byName.length === 1) return { metric: byName[0] };
  if (byName.length > 1) return { problem: { reason: "ambiguous", text: text.trim(), slugs: byName.map((m) => m.slug).sort() } };
  return { problem: { reason: "not_visible", text: text.trim() } };
}

/** One value cell before it is read: where it is and the cells that name its Metric and period. */
type Slot = { row: number; col: number; text: string; metricText: string; periodText: string };

/** How a layout reads the grid: the value cells, and how many Metric and period headers it has. */
type Laid = { slots: Slot[]; metrics: number; periods: number };

const isPeriod = (t: string, ctx: PasteContext) => readPeriodCell(t, ctx) !== null;
/** A cell that can only name a Metric: not empty, not a period, not a value. */
const isName = (t: string, ctx: PasteContext) => !!t && !isPeriod(t, ctx) && !looksLikeValue(t, ctx.style);

/** Metrics down the first column, periods across the first row (or, transposed, the other way round). */
function wide(cells: string[][], ctx: PasteContext, transposed: boolean): Laid | null {
  const g = transposed ? cells[0].map((_, c) => cells.map((r) => r[c])) : cells;
  if (g.length < 2 || g[0].length < 2) return null;
  const heads = g[0].slice(1);
  const names = g.slice(1).map((r) => r[0]);
  if (!heads.every((h) => !h || isPeriod(h, ctx)) || !heads.some(Boolean)) return null;
  if (!names.every((n) => !n || isName(n, ctx)) || !names.some(Boolean)) return null;
  const slots: Slot[] = [];
  for (let r = 1; r < g.length; r++) {
    for (let c = 1; c < g[r].length; c++) {
      if (!g[r][c]) continue;
      const [row, col] = transposed ? [c, r] : [r, c];
      slots.push({ row, col, text: g[r][c], metricText: g[r][0], periodText: g[0][c] });
    }
  }
  return { slots, metrics: names.filter(Boolean).length, periods: heads.filter(Boolean).length };
}

/** Rows of cells in given roles (a Metric, a period, a value), in any order of their columns, with a header row
 * skipped when present: the first row is a header when it does not fit, but every row after it does. Of two ways
 * the columns fit, the one whose value column reads most like values; of two as good, the first. */
function rows(cells: string[][], ctx: PasteContext, roles: ("metric" | "period" | "value")[], metric?: PasteMetric): Laid | null {
  // Columns empty everywhere (a spare one between) are left out, keeping each cell's place.
  const cols = cells[0].map((_, c) => c).filter((c) => cells.some((r) => r[c]));
  if (cols.length !== roles.length) return null;
  const fits = (r: string[], order: number[]) =>
    order.every((c, i) => (roles[i] === "metric" ? isName(r[c], ctx) : roles[i] === "period" ? isPeriod(r[c], ctx) : true));
  let best: { order: number[]; from: number; score: number } | null = null;
  for (const order of permutations(cols)) {
    const from = cells.every((r) => fits(r, order)) ? 0 : cells.length > 1 && cells.slice(1).every((r) => fits(r, order)) ? 1 : -1;
    if (from < 0) continue;
    const v = order[roles.indexOf("value")];
    const score = cells.slice(from).filter((r) => looksLikeValue(r[v], ctx.style)).length;
    if (!best || score > best.score) best = { order, from, score };
  }
  if (!best) return null;
  const { order } = best;
  const at = (role: "metric" | "period" | "value") => order[roles.indexOf(role)];
  const slots: Slot[] = [];
  for (let r = best.from; r < cells.length; r++) {
    const row = cells[r];
    if (!row[at("value")]) continue;
    slots.push({ row: r, col: at("value"), text: row[at("value")], metricText: metric ? metric.slug : row[at("metric")], periodText: row[at("period")] });
  }
  const distinct = (role: "metric" | "period") => new Set(cells.slice(best.from).map((r) => key(r[at(role)])).filter(Boolean)).size;
  return { slots, metrics: metric ? 1 : distinct("metric"), periods: distinct("period") };
}

/** Every order of a few items. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Reads a paste (spec 0026): the grid, its layout, and each value with its Metric, period and number, or why it
 * records nothing. Two values for the same Metric and period are both refused, never one picked. Over the limits,
 * the paste is refused whole, never cut. */
export function readPaste(text: string, ctx: PasteContext): PasteReading {
  const read = readGrid(text);
  if (!read.ok) return read;
  const { cells, top, left } = read.grid;
  const chosen = ctx.metricId == null ? undefined : ctx.metrics.find((m) => m.id === ctx.metricId);
  const tried: [PasteLayout, () => Laid | null][] = [
    ...(chosen ? [["one_metric", () => rows(cells, ctx, ["period", "value"], chosen)] as [PasteLayout, () => Laid | null]] : []),
    ["wide", () => wide(cells, ctx, false)],
    ["wide_transposed", () => wide(cells, ctx, true)],
    ["long", () => rows(cells, ctx, ["metric", "period", "value"])],
  ];
  const fit = tried.map(([layout, lay]) => ({ layout, laid: lay() })).filter((f): f is { layout: PasteLayout; laid: Laid } => f.laid !== null);
  if (!fit.length) return { ok: false, reason: "no_layout" };
  // Of the layouts that fit, the one asked for; else the one whose Metric cells name the most Metrics the person may
  // see ("Period, Metric, Value" rows also fit periods down and "Metric", "Value" across); of two as good, the first.
  const named = (f: (typeof fit)[number]) => f.laid.slots.filter((s) => f.layout === "one_metric" || "metric" in findMetric(s.metricText, ctx.metrics)).length;
  const pick = fit.find((f) => f.layout === ctx.layout) ?? fit.reduce((a, b) => (named(b) > named(a) ? b : a));
  const { slots } = pick.laid;
  if (slots.length > PASTE_LIMITS.values) return { ok: false, reason: "too_many_values", count: slots.length };

  const values: PasteValue[] = slots.map((s) => {
    const place = cellName(s.row + top, s.col + left);
    const base = { place, text: s.text, metricText: s.metricText, periodText: s.periodText, metricId: null, period: null, value: null };
    const found = chosen && pick.layout === "one_metric" ? { metric: chosen } : findMetric(s.metricText, ctx.metrics);
    if ("problem" in found) return { ...base, problem: found.problem };
    const m = found.metric;
    const when = periodFor(s.periodText, m, ctx);
    if ("problem" in when) return { ...base, metricId: m.id, problem: when.problem };
    const v = readValueCell(s.text, m, ctx.style);
    return { ...base, metricId: m.id, period: when.period, value: v.value, problem: v.problem };
  });
  // Two readable values for the same Metric and period: both refused, each naming the other's place.
  const same = new Map<string, PasteValue[]>();
  for (const v of values) {
    if (v.problem) continue;
    const k = `${v.metricId} ${v.period}`;
    same.set(k, [...(same.get(k) ?? []), v]);
  }
  for (const group of same.values()) {
    if (group.length < 2) continue;
    for (const v of group) v.problem = { reason: "duplicate", places: group.filter((o) => o !== v).map((o) => o.place) };
  }
  return { ok: true, layout: pick.layout, alternatives: fit.filter((f) => f !== pick).map((f) => f.layout), metrics: pick.laid.metrics, periods: pick.laid.periods, values };
}

const SPAN_WORD: Record<Span, string> = { day: "a day", week: "a week", month: "a month", quarter: "a quarter", half: "a half-year", year: "a year" };

/** Why a value records nothing, in words for the person who pasted it. A Metric they cannot see is named in the
 * same words whether it exists or not. */
export function pasteProblemText(p: PasteProblem, metricPeriod?: Period): string {
  switch (p.reason) {
    case "no_metric": return "No Metric is named for this value.";
    case "not_visible": return `“${p.text}” is not a Metric you can see here.`;
    case "ambiguous": return `“${p.text}” names more than one Metric: write ${p.slugs.map((s) => `“${s}”`).join(" or ")} instead.`;
    case "not_a_period": return `“${p.text}” is not a period Ziffr can read.`;
    case "other_length": return `“${p.text}” is ${SPAN_WORD[p.span]}${metricPeriod ? `, and this Metric counts in ${SPAN_WORD[metricPeriod].replace(/^an? /, "")}s` : ""}.`;
    case "future_period": return `“${p.text}” has not begun yet.`;
    case "not_a_number": return `“${p.text}” is not a number.`;
    case "spreadsheet_error": return `The cell shows the spreadsheet error ${p.text}.`;
    case "wrong_unit": return `“${p.text}” is written in another unit than this Metric’s.`;
    case "duplicate": return `The paste holds another value for this Metric and period (${p.places.join(", ")}).`;
  }
}

/** Why a paste was not read, in words for the person. */
export function pasteReadingText(r: Extract<PasteReading, { ok: false }>): string {
  switch (r.reason) {
    case "empty": return "There is nothing to read: copy some cells and paste them here.";
    case "too_large": return "That is more than 256 KB of text. Paste fewer cells at a time.";
    case "not_cells": return "Copy the cells from the spreadsheet itself.";
    case "no_layout": return "Ziffr expected Metrics in the first column and periods in the first row (or the other way round), or rows of a Metric, a period and a value.";
    case "too_many_values": return `That is ${r.count.toLocaleString("en")} values; a paste may hold at most ${PASTE_LIMITS.values.toLocaleString("en")}. Paste fewer at a time.`;
  }
}
