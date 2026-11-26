// A Metric's Calculation Note (spec 0060; GLOSSARY: Calculation Note, Metric Description): "How it is calculated", the
// text beside the description that says exactly what counts and what does not, where the figure comes from and which
// adjustments are made. Beside it a Derived Metric's formula, written in words. Pure, so the browser's forms and the
// core use one label and one limit.
// Security: the text is untrusted. It is cleaned and limited here, drawn as text only and never followed as markup.

import { formulaInputs } from "./formula";
import type { Metric } from "./types";

/** The most characters a Calculation Note holds in the app, as many as a description. */
export const CALCULATION_NOTE_MAX = 2000;

/** What screens call a Calculation Note. */
export const CALCULATION_NOTE_LABEL = "How it is calculated";

/** What the forms suggest writing there. */
export const CALCULATION_NOTE_HINT = "What counts and what does not, where the figure comes from, and any adjustments.";

/** A Calculation Note as it is stored: line breaks kept, ends trimmed, at most `CALCULATION_NOTE_MAX` characters, and
 * null where there is nothing to say. */
export function calculationNoteFrom(text: unknown): string | null {
  return String(text ?? "").replace(/\r\n?/g, "\n").trim().slice(0, CALCULATION_NOTE_MAX) || null;
}

/** A formula written with its inputs' names, for someone who sees `seen`: null when it reads a Metric not among them,
 * so a formula never names, nor hints at, a Metric a person may not see (ticket #619). */
export function formulaInWords(formula: string, seen: readonly Pick<Metric, "slug" | "name">[]): string | null {
  const names = new Map(seen.map((m) => [m.slug, m.name]));
  if (!formulaInputs(formula).every((s) => names.has(s))) return null;
  return formula.replace(/\{([a-z0-9-]+)\}/g, (all, slug: string) => names.get(slug) ?? all);
}
