// The rules of the Feedback Prompt (ticket #722; GLOSSARY: Feedback Prompt): when the card may appear, how long it
// waits after it was shown, and what each answer does. Pure, so the cadence is tested without a database; the
// operations that keep the state are in feedback-prompt.ts.

/** On how many different days a person must have submitted values before the card may appear. */
export const FEEDBACK_MIN_DAYS = 3;
/** How often the card is shown at most, when nobody answers it: the third time is the last. */
export const FEEDBACK_MAX_SHOWINGS = 3;
/** Days to wait after the first and after the second showing. */
export const FEEDBACK_WAIT_DAYS = [30, 60] as const;
/** Days to wait after someone said what is missing, before asking again without the request for a star. */
export const FEEDBACK_AFTER_NO_DAYS = 90;
/** The longest "What is missing?" a person may send. */
export const FEEDBACK_WORDS_MAX = 1000;

/** How the asking stands for one person. */
export type PromptState = { shownCount: number; nextAskAt: Date | null; stopped: boolean; answer: "no" | "starred" | "never" | null };

/** The state of someone who was never asked. */
export const FRESH_STATE: PromptState = { shownCount: 0, nextAskAt: null, stopped: false, answer: null };

const DAY_MS = 86_400_000;
const later = (a: Date | null, b: Date) => (a && a.getTime() > b.getTime() ? a : b);

/** Whether the card may be shown now, leaving aside how active the person is. */
export function isDue(state: PromptState, now: Date): boolean {
  return !state.stopped && (state.nextAskAt === null || state.nextAskAt.getTime() <= now.getTime());
}

/** The state once the card was shown. The wait starts at once, so a person who leaves the page is not asked again
 * the next day; the third showing is the last. */
export function afterShown(state: PromptState, now: Date): PromptState {
  const shownCount = state.shownCount + 1;
  if (shownCount >= FEEDBACK_MAX_SHOWINGS) return { ...state, shownCount, nextAskAt: null, stopped: true };
  const wait = FEEDBACK_WAIT_DAYS[Math.min(shownCount - 1, FEEDBACK_WAIT_DAYS.length - 1)] * DAY_MS;
  return { ...state, shownCount, nextAskAt: later(state.nextAskAt, new Date(now.getTime() + wait)) };
}

/** The state after "Star on GitHub" or "Don't ask again": never asked again. */
export function afterStopped(state: PromptState, answer: "starred" | "never"): PromptState {
  return { ...state, stopped: true, nextAskAt: null, answer };
}

/** The state after someone said what is missing: asked again only after a long while, if the showings allow. */
export function afterNo(state: PromptState, now: Date): PromptState {
  return { ...state, answer: "no", nextAskAt: later(state.nextAskAt, new Date(now.getTime() + FEEDBACK_AFTER_NO_DAYS * DAY_MS)) };
}

/** Whether a yes is followed by the request for a star: not for someone who said earlier that something is missing. */
export function asksForStar(state: PromptState): boolean {
  return state.answer !== "no";
}

/** A "What is missing?" as it would be kept, or why it cannot be. */
export function cleanWords(input: unknown): { ok: true; words: string } | { ok: false; reason: string } {
  if (typeof input !== "string") return { ok: false, reason: "Write what is missing." };
  // Control and format characters (zero-width, direction overrides) could hide text where an Installation Admin reads it.
  if (/[\p{Cc}\p{Cf}]/u.test(input.replace(/[\n\t]/g, " "))) return { ok: false, reason: "Those words have characters that cannot be shown." };
  const words = input.trim();
  if (!words) return { ok: false, reason: "Write what is missing." };
  if ([...words].length > FEEDBACK_WORDS_MAX) return { ok: false, reason: `Keep it to ${FEEDBACK_WORDS_MAX} characters.` };
  return { ok: true, words };
}

/** Whether the Feedback Prompt is on, for the settings in effect: ZIFFR_FEEDBACK_PROMPT when it is "true" or "false",
 * otherwise on for hosted Ziffr (a deployment of Ziffr Cloud) and off everywhere else. */
export function feedbackPromptOn(settings: Record<string, string | undefined>, hosted: boolean): boolean {
  const raw = settings.ZIFFR_FEEDBACK_PROMPT?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return hosted;
}
