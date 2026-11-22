// The types and helpers an Extension is written against (GLOSSARY: Extension Kit). They are the only thing besides
// `@ziffr/figures` that an Extension may import, so everything an author needs from Ziffr is here and is plain data.

/** A series of numbers, oldest first. An Extension is handed one and never changes it. */
export type Series = readonly number[];

/** What a Method gives instead of a number when it should not answer (a flat, empty or too short series, NaN). */
export type Refusal = { readonly refused: string };

/** Says why a Method does not answer. A Method refuses rather than return a number that means nothing. */
export function refuse(reason: string): Refusal {
  return { refused: reason };
}
