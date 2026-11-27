// What a Pack may declare for its set-up (spec 0068, GLOSSARY: Pack, Position, Repeat): the words of its preview and
// questions, and the numbers asked at set-up that are written as targets. One small module, so the Pack format
// (ziffr.pack/3) and the guided set-up that draws the steps agree on the fields and their limits.
// Security: a Pack is untrusted input. Every one of these texts is plain text of limited length: never markup, a web
// address or code.

/** The limits of what a Pack declares for its set-up. */
export const PACK_SET_UP_LIMITS = { line: 120, happens: 4, needs: 4, listed: 90, question: 90, hint: 140, name: 40, asks: 3 } as const;

/** The spans a number asked at set-up holds for. */
export const PACK_ASK_EVERY = ["month", "quarter", "year"] as const;
/** One of them. */
export type PackAskEvery = (typeof PACK_ASK_EVERY)[number];

/** What a Pack says on the preview of its set-up: one sentence under the name, the lines under "Every week" and the
 * lines under "You need". */
export type PackSetUpWords = { line: string; happens: string[]; needs?: string[] };

/** A number asked at set-up for a Metric Catalog entry, one per line where the entry is made per line, and written as
 * that Metric's target for every period of the span. */
export type PackAsk = { question: string; name: string; every: PackAskEvery };
