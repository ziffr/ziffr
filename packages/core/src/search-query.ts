// Search (ticket #412; GLOSSARY: Metric, Period, Answer Languages): reading what a person typed into the search box
// into the words that name something and the period words, the same ones replies are read with ("march 2026", "Q3",
// "last week", "KW 46"). Pure: no database, so it is tested on its own.
import { findPeriodWords } from "./numbers";
import type { Span, YearStart } from "./periods";

/** How long a search may be; the rest is ignored. */
export const MAX_QUERY = 100;
/** How many name words and period words are used; more are ignored. */
export const MAX_TERMS = 6;
/** At most this many periods are read from one search. */
export const MAX_PERIODS = 3;

/** A search read: `all` is every word typed, `name` the words left when the period words are taken out, and the
 * periods named, each by the span it names and its first day. */
export type SearchQuery = { all: string[]; name: string[]; periods: { span: Span; start: string }[] };

/** A word as it is compared: lower case, without accents, so "Umsatz" finds "umsatz" and "cafe" finds "Café". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const wordsOf = (text: string): string[] => fold(text).split(/[\s,;:]+/).filter(Boolean).slice(0, MAX_TERMS);

/** Reads a search. Period words that name no real period ("week 60") stay part of the words. `today` is yyyy-mm-dd. */
export function parseSearchQuery(raw: unknown, today: string, yearStart: YearStart, languages: readonly string[], monthFirst = false): SearchQuery {
  const text = typeof raw === "string" ? raw.slice(0, MAX_QUERY).trim() : "";
  if (!text) return { all: [], name: [], periods: [] };
  const found = findPeriodWords(text, today, yearStart, languages, monthFirst).filter((p) => p.start !== null);
  let rest = "";
  let at = 0;
  for (const p of found) { rest += `${text.slice(at, p.from)} `; at = p.to; }
  rest += text.slice(at);
  const periods = found.slice(0, MAX_PERIODS).map((p) => ({ span: p.span, start: p.start as string }));
  return { all: wordsOf(text), name: found.length ? wordsOf(rest) : [], periods };
}

/** How well a name fits the words: 0 when it starts with the first, 1 when a word of it does, 2 when it only holds
 * every word, null when it lacks one. */
export function nameScore(name: string, terms: readonly string[]): number | null {
  if (!terms.length) return null;
  const n = fold(name);
  if (!terms.every((t) => n.includes(t))) return null;
  if (n.startsWith(terms[0])) return 0;
  return n.split(/[\s\-_/.]+/).some((w) => w.startsWith(terms[0])) ? 1 : 2;
}
