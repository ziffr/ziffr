// The Number Style (spec 0022, ticket #108; GLOSSARY: Number Style): how a Workspace writes numbers, which mark groups
// the digits and which is the decimal. Pure, so the browser can preview a style with the same rules the server uses.
//
// A style is stored as one of four keys, each the number 1234.5 written in it: "1,234.5" (the default, what every
// Workspace showed before), "1.234,5", "1 234,5" and "1'234.5". The key's space is a plain one; which space a
// writer prints is the writer's choice. `workspaces.number_style` is null until an Owner or Admin picks one, and the
// style then follows the Workspace Profile's country, so a Workspace whose country is set later still gets it.

import { NUMBER_STYLES, type NumberStyle } from "@ziffr/figures";

export { NUMBER_STYLES, type NumberStyle };

/** The style of a Workspace with neither a chosen style nor a country with a style of its own. */
export const DEFAULT_NUMBER_STYLE: NumberStyle = "1,234.5";

/** The mark between groups of three digits and the decimal mark, per style. */
export const NUMBER_STYLE_MARKS: Readonly<Record<NumberStyle, { group: string; decimal: string }>> = {
  "1,234.5": { group: ",", decimal: "." },
  "1.234,5": { group: ".", decimal: "," },
  "1 234,5": { group: " ", decimal: "," },
  "1'234.5": { group: "'", decimal: "." },
};

/** Whether a value is one of the four style keys. */
export function isNumberStyle(x: unknown): x is NumberStyle {
  // No typeof check: includes() matches only one of the four strings, so nothing else gets through.
  return (NUMBER_STYLES as readonly unknown[]).includes(x);
}

// Countries whose usual style is not the default; every other ISO 3166-1 alpha-2 code writes 1,234.5. Short on
// purpose: only countries where the usual style is clear, and an Owner can always pick another.
const COUNTRY_STYLE: Readonly<Record<string, NumberStyle>> = {
  ...Object.fromEntries(["DE", "AT", "NL", "BE", "ES", "IT", "PT", "DK", "BR", "ID", "TR", "GR"].map((c) => [c, "1.234,5"])),
  ...Object.fromEntries(["FR", "SE", "NO", "FI", "PL", "CZ", "SK", "HU", "RU", "UA", "ZA"].map((c) => [c, "1 234,5"])),
  CH: "1'234.5",
  LI: "1'234.5",
};

/** The style a country usually writes, from its ISO 3166-1 alpha-2 code; the default for no or an unknown country. */
export function numberStyleForCountry(country: string | null | undefined): NumberStyle {
  return country && Object.hasOwn(COUNTRY_STYLE, country) ? COUNTRY_STYLE[country] : DEFAULT_NUMBER_STYLE;
}

/** The style a Workspace writes in: the one stored if an Owner or Admin chose one, else its country's. */
export function effectiveNumberStyle(stored: unknown, country: string | null | undefined): NumberStyle {
  return isNumberStyle(stored) ? stored : numberStyleForCountry(country);
}

/** The style shown with an example a person recognises it by, such as "1.234,5 (12,5 %)". */
export function numberStyleExample(style: NumberStyle): string {
  return `${style} (12${NUMBER_STYLE_MARKS[style].decimal}5 %)`;
}
