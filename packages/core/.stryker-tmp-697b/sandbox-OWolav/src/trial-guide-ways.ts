// @ts-nocheck
// The one way a Trial Guide's Owner is asked each day (ticket 193; GLOSSARY: Trial Guide, Prompt): the first picked of
// Telegram, Slack and email, else email; the form link rides in every Prompt. Pure, so the guide's page can say
// which way it will be while the Owner is still picking.

/** The ways Prompts can go by every day, in the order the first picked one wins. */
export const DAILY_WAYS = ["telegram", "slack", "email"] as const;
/** One of those ways. */
export type DailyWay = (typeof DAILY_WAYS)[number];

/** The one way the Owner's daily Prompts go by: the first picked of Telegram, Slack and email, else email. */
export function dailyWay(ways: readonly string[]): DailyWay {
  return DAILY_WAYS.find((w) => ways.includes(w)) ?? "email";
}
