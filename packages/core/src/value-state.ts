// When a value is final (GLOSSARY: Approval): the app's one rule, for Alerts and Heads-ups alike. A value whose period waits for
// Approval, or was sent back to its submitter (state "submitted"), is not approved yet; a period with no state at all (a Metric
// without a Workflow) counts as final. Anything built to say what a number did (an Alert, a Heads-up) reads only final values.

/** The states of a period (period_states) in which its value is not final yet. */
export const NOT_FINAL_STATES = ["approval", "submitted"] as const;

/** Whether a period state leaves the value final: no state, or any state but those that wait for Approval or a correction. */
export function isFinalState(state: string | null | undefined): boolean {
  return !(NOT_FINAL_STATES as readonly string[]).includes(state ?? "");
}
