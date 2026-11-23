// @ts-nocheck
// What a refused change in the demo says (GLOSSARY: Demo Mode; spec 0029, #271), and the fixed codes that carry it to
// a browser. Pure, so the web app's error screen can say the sentence for a plain form whose refusal reaches it only
// as an error's digest: the browser maps a code it knows to these words, never text from the server.

/** The sentence, where this Installation offers no trials. */
export const DEMO_READ_ONLY = "The demo can't be changed.";

/** The sentence, where it offers Trial Workspaces. */
export const DEMO_READ_ONLY_TRIAL = "The demo can't be changed. Start a trial to try it with your own numbers.";

/** The digest a demo refusal carries to the error screen, by whether trials are offered. */
export const DEMO_DIGEST = { plain: "ziffr-demo-read-only", trial: "ziffr-demo-read-only-trial" } as const;

/** The sentence for a digest, or null for any other error. */
export function demoWordsForDigest(digest: string | undefined): string | null {
  return digest === DEMO_DIGEST.trial ? DEMO_READ_ONLY_TRIAL : digest === DEMO_DIGEST.plain ? DEMO_READ_ONLY : null;
}
