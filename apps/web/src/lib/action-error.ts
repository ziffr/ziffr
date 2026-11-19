// A server action's refusal as the browser sees it (ticket 192): `{ error }` with words for the person. Pure, so client
// components may use it; the server side is lib/action-result.ts.

/** A refusal, in words for the person. */
export type ActionError = { error: string };

/** Whether an action's answer is a refusal. */
export function isActionError(r: unknown): r is ActionError {
  return typeof r === "object" && r !== null && typeof (r as { error?: unknown }).error === "string";
}

/** What the browser says when an action failed for a reason Ziffr did not foresee: its details stay on the server. */
export const UNEXPECTED = "Something went wrong on Ziffr's side. Try again in a moment.";

/** A refusal turned back into an error in the browser, so a handler that runs several steps can stop at the first. Its
 * message is the action's own words, made in the browser: never a message thrown on the server. */
export class Refused extends Error {}

/** The action's answer, or a thrown Refused with its words. */
export function unwrap<T>(r: T | ActionError): T {
  if (isActionError(r)) throw new Refused(r.error);
  return r;
}

/** What to show for an error a client caught: a refusal's words, else the general line. */
export function shown(e: unknown): string {
  return e instanceof Refused ? e.message : UNEXPECTED;
}
