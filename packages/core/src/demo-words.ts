// What a refused change in the demo says (GLOSSARY: Demo Mode; spec 0029, #271), and the fixed codes that carry it to
// a browser. Pure, so the web app's error screen can say the sentence for a plain form whose refusal reaches it only
// as an error's digest: the browser maps a code it knows to these words, never text from the server.

/** The sentence, where this Installation offers no trials. */
export const DEMO_READ_ONLY = "The demo can't be changed.";

/** The sentence, where it offers Trial Workspaces. */
export const DEMO_READ_ONLY_TRIAL = "The demo can't be changed. Start a trial to try it with your own numbers.";

/** What a visit's change says when the demo started fresh since its page was drawn (spec 0051). */
export const DEMO_STALE = "The demo was reset; reload.";

/** The digest a demo refusal carries to the error screen, by whether trials are offered, and for a stale page. */
export const DEMO_DIGEST = { plain: "ziffr-demo-read-only", trial: "ziffr-demo-read-only-trial", stale: "ziffr-demo-stale" } as const;

/** The sentence for a digest, or null for any other error. */
export function demoWordsForDigest(digest: string | undefined): string | null {
  return digest === DEMO_DIGEST.trial ? DEMO_READ_ONLY_TRIAL : digest === DEMO_DIGEST.plain ? DEMO_READ_ONLY : digest === DEMO_DIGEST.stale ? DEMO_STALE : protectedWordsForDigest(digest);
}

// What the demo says for a change to its own words or its showcase (spec 0051, ticket 6): where visitors may change the
// demo they may change what the seed made, but not its words and not the few objects the landing page and the tour
// point at. The sentence names no kind of object, so it is true of every one.

/** What a visitor reads for a showcase object. */
export const DEMO_SHOWCASE = "Everyone sees this one as it is. Make your own to change it.";

/** What a visitor reads for the words of something the seed made. */
export const DEMO_SEEDED_WORDS = "Everyone sees this one's words as they are. Make your own to name it.";

/** The digests these two refusals carry to the error screen. */
export const DEMO_PROTECTED_DIGEST = { showcase: "ziffr-demo-showcase", words: "ziffr-demo-words" } as const;

/** The sentence for a digest of the showcase or seeded-words refusals, or null for any other. */
export function protectedWordsForDigest(digest: string | undefined): string | null {
  return digest === DEMO_PROTECTED_DIGEST.showcase ? DEMO_SHOWCASE : digest === DEMO_PROTECTED_DIGEST.words ? DEMO_SEEDED_WORDS : null;
}
