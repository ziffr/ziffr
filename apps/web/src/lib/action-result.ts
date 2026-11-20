// What a server action answers when it refuses (ticket 192). A production build replaces the message of an error
// thrown from a server action with a generic text ("An error occurred in the Server Components render"), so a person
// would never learn why. Actions therefore return `{ error }` for what a person can act on: a permission, a check, a
// limit. Anything unexpected stays thrown and is logged, so no internal detail reaches a browser.
import { unstable_rethrow } from "next/navigation";
import { Forbidden } from "@ziffr/core/actor";
import { MetricChangeRefused } from "@ziffr/core/api-metrics";
import { RestoreRefused } from "@ziffr/core/archived-metrics";
import { LimitReached } from "@ziffr/core/workspace-limits";
import { MailHostError } from "@ziffr/core/mail-hosts";
import { MarketplaceUnavailable } from "@ziffr/core/marketplace";
import { MetricKept } from "@ziffr/core/metrics";
import { TrialRefused } from "@ziffr/core/trials";
import type { ActionError } from "./action-error";

export type { ActionError } from "./action-error";

/** The core's errors whose message is written for people: plain `Error`s with Ziffr's own words, and the refusals
 * that say why. Provider errors (Slack, Telegram, mail hosts) and programming errors are not among them. */
export function forPeople(e: unknown): string | null {
  if (!(e instanceof Error)) return null;
  if (e instanceof Forbidden) return e.message === "Forbidden" ? "You may not do that here." : e.message;
  if (e instanceof MetricKept || e instanceof MetricChangeRefused || e instanceof TrialRefused || e instanceof MailHostError || e instanceof RestoreRefused || e instanceof LimitReached || e instanceof MarketplaceUnavailable) return e.message;
  // Exactly Error, not a subclass such as TypeError or a provider's error.
  return Object.getPrototypeOf(e) === Error.prototype && e.message ? e.message : null;
}

/** Runs an action's work and answers a refusal as `{ error }`. Redirects and not-found pass through as Next.js needs,
 * and anything else is logged and thrown on. */
export async function attempt<T>(work: () => Promise<T>): Promise<T | ActionError> {
  try {
    return await work();
  } catch (e) {
    unstable_rethrow(e);
    const words = forPeople(e);
    if (words !== null) return { error: words };
    console.error("A server action failed:", e);
    throw e;
  }
}
