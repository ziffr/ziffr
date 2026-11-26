// Which periods a personal form link records, in words (GLOSSARY: Token): the running period, or one asked of its Token
// that is still due (asked-periods.ts). Pure.

/** What a form link is told for a period it does not record. */
export const LINK_PERIOD_REFUSED = { outcome: "rejected_period", detail: "Nothing was recorded: a form link records the current period or one you were asked for. Check the period under “For” and type the number alone." };

/** A form link's answer for a period asked of it that was answered while the form was sending: the usual refusal, or
 * only `sent`, the words about the sender's own number. */
export function answeredMeanwhile(outcome: string, sent: string): { ok: boolean; outcome: string; detail: string } {
  return outcome === "rejected_duplicate" ? { ok: false, ...LINK_PERIOD_REFUSED } : { ok: true, outcome, detail: sent };
}
