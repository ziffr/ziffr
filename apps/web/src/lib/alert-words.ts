// The words for an Alert in the app (GLOSSARY: Alert, Attainment, Due Date): its condition, why it is paused and
// whether it has fired. Pure, so client components may use it.
import type { AlertCondition } from "@ziffr/core/alert-rules";
import type { AlertDelivery, MyAlert } from "@ziffr/core/alerts";
import { formatDate } from "@ziffr/core/format";

/** A condition in a few words, as the person set it. */
export function conditionWords(c: AlertCondition): string {
  switch (c.kind) {
    case "share_of_target": return `Reaches ${c.share} % of its target`;
    case "at_or_above": return `Reaches ${c.value} or more`;
    case "below": return `Falls below ${c.value}`;
    case "changed_more": return `Changes more than ${c.share} % against the period before`;
    case "missing_after_due": return "Still has no value the day after its Due Date";
  }
}

/** The ways of delivery as the person reads them. */
export const DELIVERY_WORDS: Record<AlertDelivery, string> = { usual: "my usual way", email: "email", slack: "Slack", telegram: "Telegram" };

/** Why Ziffr itself holds an Alert back, in words for its owner. */
const PAUSE_WORDS = {
  no_access: "paused: you cannot see this Metric now",
  archived: "paused: the Metric is archived",
  no_target: "paused: the Metric has no target now",
  no_workflow: "paused: the Metric has no Workflow now",
} as const;

/** One line on where the Alert stands: paused by the person or by Ziffr (and why), or fired or waiting. */
export function standing(a: Pick<MyAlert, "pausedByPerson" | "paused" | "state" | "firedAt">): string {
  const parts: string[] = [];
  if (a.pausedByPerson) parts.push("paused by you");
  if (a.paused) parts.push(PAUSE_WORDS[a.paused]);
  if (!parts.length) parts.push(a.state === "fired" ? "fired, quiet until it has been false again" : "waiting");
  if (a.firedAt) parts.push(`last fired ${formatDate(a.firedAt)}`);
  return parts.join(", ");
}
