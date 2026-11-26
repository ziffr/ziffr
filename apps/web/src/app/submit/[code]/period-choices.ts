// Which periods the personal form link offers and which one is picked to start with (GLOSSARY: Token, Prompt, Period).
// Pure, from what the core already gave the page: the running period, the periods asked for that still wait, and, for
// the link's own signed-in person, the period their address names. The core decides again what it records.

/** One period the form can be set to, with what it already holds and, for the signed-in person, the last value before it. */
export type PeriodChoice = {
  start: string;
  label: string;
  /** What is said beside it in the list, such as "asked for" or "this week". */
  notes: string[];
  has: string | null;
  running: boolean;
  last: { value: string; periodLabel: string } | null;
};

/** The choices (newest first), the one picked to start with, and whether there is anything to pick between. */
export type PeriodOffer = { choices: PeriodChoice[]; preselected: string; selectable: boolean };

type Held = { start: string; label: string; has: string | null };

/** The form's periods. With no earlier period waiting there is nothing to pick: the one the address names, else the
 * running one. Otherwise the running one and every waiting one, starting at the address's, else the newest asked for. */
export function periodOffer(i: {
  running: Held;
  /** The running period in words, such as "this week". */
  runningWords: string;
  /** The periods asked for that still wait, newest first; the running one among them when it was asked for. */
  asked: { start: string; label: string }[];
  /** An earlier period the signed-in person's address names. */
  named: Held | null;
  /** The signed-in person's address names the running period. */
  namedRunning: boolean;
  /** Values the signed-in person may see, newest first; empty for a link holder. */
  recent: { start: string; value: string; periodLabel: string }[];
}): PeriodOffer {
  const choice = (p: Held): PeriodChoice => {
    const running = p.start === i.running.start;
    const asked = i.asked.some((a) => a.start === p.start);
    const before = i.recent.find((r) => r.start < p.start);
    return { ...p, running, notes: [...(running ? [i.runningWords] : []), ...(asked ? ["asked for"] : [])], last: before ? { value: before.value, periodLabel: before.periodLabel } : null };
  };
  const earlier = i.asked.filter((a) => a.start !== i.running.start);
  if (!earlier.length) {
    const only = choice(i.named ?? i.running);
    return { choices: [only], preselected: only.start, selectable: false };
  }
  // A waiting period never shows a value: it is offered because it has none.
  const periods: Held[] = [i.running, ...earlier.map((a) => ({ ...a, has: null }))];
  if (i.named && !periods.some((p) => p.start === i.named!.start)) periods.push(i.named);
  const choices = periods.map(choice).sort((a, b) => b.start.localeCompare(a.start));
  const preselected = i.named?.start ?? (i.namedRunning ? i.running.start : i.asked[0].start);
  return { choices, preselected, selectable: true };
}
