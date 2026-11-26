// Numbers and Breakdown rows typed into words (GLOSSARY: Deck Template, Breakdown, Placeholder; ticket #1172): what a
// template, which the whole team reads, finds in a slide's words and leaves out. Words inside braces are Placeholders
// and are never touched. Pure, so the save dialog shows what the core will do.
import type { CanvasData } from "./types";

/** What stands where typed words were left out. */
export const LEFT_OUT = "…";

// A figure: digits that do not continue a word ("Q3" and "FY26" are names), with their sign, currency, separators and
// a unit behind them ("1,2 Mio €", "12 %").
const FIGURE = /(?<![\p{L}\p{N}_])[+\-−±]?[€$£¥]?\d+(?:(?:[.,'’]|[   ](?=\d{3}(?!\d)))\d+)*(?:[   ]?(?:k|m|M|bn|Mio|Mrd|Tsd)(?![\p{L}\p{N}])|\p{L}{1,3}(?![\p{L}\p{N}]))?(?:[   ]?[%€$£¥×])?/gu;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A pattern for a name as a word or words of its own, whatever its letters' case. */
export const wholeName = (name: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, "giu");

/** A text with `change` applied to everything outside its Placeholders. */
export const outsideBraces = (text: string, change: (part: string, at: number) => string) =>
  text.split(/(\{[^{}]*\})/).map((part, i) => (i % 2 ? part : change(part, i))).join("");

/** The row names of some Metrics' Breakdowns, the longest first so that none is cut by a shorter one. */
export function breakdownRowNames(breakdowns: CanvasData["breakdowns"], metricIds: readonly number[]): string[] {
  const names = metricIds.flatMap((id) => Object.values(breakdowns[id] ?? {}).flatMap((rows) => rows.map((r) => r.label.trim())));
  return [...new Set(names)].filter((n) => n.length > 1).sort((a, b) => b.length - a.length);
}

/** The numbers and row names typed into a text, and the text without them. The number of a list ("1. Sales") is not
 * a figure. */
export function typedWords(text: string, rows: readonly string[]): { text: string; found: string[] } {
  const found: string[] = [];
  const out = outsideBraces(text, (part, i) => {
    const named = rows.reduce((t, row) => t.replace(wholeName(row), (hit) => (found.push(hit), LEFT_OUT)), part);
    return named.replace(FIGURE, (hit: string, at: number, all: string) => {
      const listNumber = i === 0 && /^\s*$/.test(all.slice(0, at)) && /^\d{1,2}$/.test(hit) && /^[.)](\s|$)/.test(all.slice(at + hit.length));
      if (listNumber) return hit;
      found.push(hit.trim());
      return LEFT_OUT;
    });
  });
  return { text: out, found };
}
