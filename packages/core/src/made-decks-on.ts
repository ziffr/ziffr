// Whether Ziffr's own deck maker is on (GLOSSARY: Deck, Deck Description; spec 0069): the one constant the spec's first
// release is built behind. A module of its own, so a test can turn it on.

/** Off until the switch-on ticket (#1371). While off no made deck is read, changed or made, and a stored description
 * names no Metric, so a Share of it opens nothing. */
export const MADE_DECKS_ON: boolean = false;
