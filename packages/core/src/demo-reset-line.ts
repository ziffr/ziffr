// The line on every page of the demo that says when it starts fresh (GLOSSARY: Demo Mode, Demo Reset; spec 0051, ticket 7).
// Pure, so the demo bar in the browser and the page that draws it first say the same words, and they are tried without a
// database or a clock. The words and the countdown only show where visitors may change the demo (demoChangesInEffect);
// elsewhere the page keeps its old line. The time of the next reset is the schedule's, never the visitor's own clock:
// the page is given the server's time with it, and the browser counts from the difference.

const MINUTE = 60_000;
/** How often the demo starts fresh, in minutes (spec 0051, The Demo Reset); the announcement on every page names it. */
export const DEMO_RESET_MINUTES = 15;
/** A reset window: the demo starts fresh every 15 minutes, at 10, 25, 40 and 55 past the hour (spec 0051, The Demo Reset). */
const WINDOW = DEMO_RESET_MINUTES * MINUTE;
const WINDOW_OFFSET = 10 * MINUTE;

/** How long after a reset the line says "starting fresh": the core's part of a reset (Snapshots, the Outbox) still runs. */
export const STARTING_FRESH_MS = 60_000;

/** When the reset window that `at` is in began: the latest of 10, 25, 40 and 55 past the hour at or before it. */
export function resetWindowStart(at: Date): Date {
  return new Date(Math.floor((at.getTime() - WINDOW_OFFSET) / WINDOW) * WINDOW + WINDOW_OFFSET);
}

/** When the next reset window begins, that is, when the demo is next due to start fresh. */
export function nextResetWindowStart(at: Date): Date {
  return new Date(resetWindowStart(at).getTime() + WINDOW);
}

/** What the demo bar knows when its page is drawn: the Generation, when it began (null if unknown), the next slot and the server's time. All in milliseconds since 1970. */
export type DemoLineFacts = { generation: number; resetAt: number | null; nextResetAt: number; serverNow: number };

/** The line's state at a moment: counting down, due within a minute, or starting fresh (a reset just happened or is due). */
export type DemoLine = { kind: "counting"; minutes: number } | { kind: "soon" } | { kind: "fresh" };

/** The browser's clock corrected to the server's: add this to `Date.now()`. Positive when the visitor's clock is behind. */
export function clockSkew(serverNow: number, clientNow: number): number {
  return serverNow - clientNow;
}

/** What the line says at `now` (already corrected for the skew). "Starting fresh" right after a reset and once the slot has
 * passed; within a minute "soon"; else the minutes left, rounded up so that it never says 0. */
export function demoLine(facts: Pick<DemoLineFacts, "resetAt" | "nextResetAt">, now: number): DemoLine {
  if (facts.resetAt !== null && now >= facts.resetAt && now - facts.resetAt < STARTING_FRESH_MS) return { kind: "fresh" };
  const left = facts.nextResetAt - now;
  if (left <= 0) return { kind: "fresh" };
  if (left <= MINUTE) return { kind: "soon" };
  return { kind: "counting", minutes: Math.ceil(left / MINUTE) };
}

/** The words of the line, short enough to follow the page's own sentence: "Resets in 9 min." or "Starting fresh." */
export function demoLineWords(line: DemoLine): string {
  if (line.kind === "fresh") return "Starting fresh.";
  if (line.kind === "soon") return "Resets in under a minute.";
  return `Resets in ${line.minutes} min.`;
}

/** The slot after a passed one, for a demo that was clean and so was not reset (the reset job skips it): the countdown moves on. */
export function slotAfter(passed: number): number {
  return nextResetWindowStart(new Date(passed)).getTime();
}

/** How long the browser waits before it asks again whether the Generation moved, after the slot has passed: it spreads out
 * (3, 6, 12, 24, 30 seconds, each up to a third more by `spread`, a number from 0 to 1) so that many open pages do not ask at once.
 * Null once the attempts are used up: the demo was clean and was not reset. */
export function generationCheckDelay(attempt: number, spread: number): number | null {
  const base = [3000, 6000, 12000, 24000, 30000][attempt];
  if (base === undefined) return null;
  return Math.round(base * (1 + Math.min(1, Math.max(0, spread)) / 3));
}
