// The words of the First Metric step (spec 0052; GLOSSARY: Setup Guide, Prompt, Quiet Hours, Outbox, Source). Pure: no
// database, so the page, the polling and the tests read the same sentences. Nothing here is built from what a person
// typed: the variable parts are the Metric's name, the person's own address and times, and the way.
import type { ConnectorId } from "./connectors/types";
import { ASK_NOW_EVERY_MINUTES } from "./ask-now";

/** How a value that arrived is named in "by email reply", from the Source it came through. */
export const SOURCE_WORDS: Record<string, string> = { mail: "email reply", slack: "Slack answer", telegram: "Telegram answer", web_form: "the form", api: "a program" };

/** A Source in words, or "a Source" for one the step does not name. */
export function sourceWords(source: string): string {
  return SOURCE_WORDS[source] ?? "a Source";
}

/** The sentence when both halves happened: "MRR for November 2026: 48,200 EUR, by email reply. The loop works." */
export function loopWorks(input: { metric: string; period: string; value: string; source: string }): string {
  const by = input.source === "web_form" ? "through the form" : `by ${sourceWords(input.source)}`;
  return `${input.metric} for ${input.period}: ${input.value}, ${by}. The loop works.`;
}

/** What to look for where a Prompt went: the subject, the direct message or the bot's message. */
export function whatToLookFor(way: ConnectorId, i: { metric: string; email: string | null; repliesByEmail: boolean }): string {
  switch (way) {
    case "email": return `An email from Ziffr${i.email ? ` to ${i.email}` : ""} whose subject starts with “What’s the number for ${i.metric}”. ${i.repliesByEmail ? "Reply to it with the number, or use the link in it." : "Use the link in it to send the number."}`;
    case "slack": return "A direct message from the Ziffr app in Slack. Reply in its thread with the number.";
    case "telegram": return "A message from Ziffr’s bot in Telegram. Reply to it with the number.";
    default: return "A message from Ziffr. Answer it there, or use the form link.";
  }
}

/** The clock time of an instant in a time zone, "07:00", with the day when it is not today there ("07:00 on Monday"). */
export function quietUntilWords(until: Date, now: Date, timeZone: string): string {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(until);
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  if (day(until) === day(now)) return time;
  return `${time} on ${new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long" }).format(until)}`;
}

/** Said before asking while the viewer is in their Quiet Hours: the request waits, and still counts as asked. */
export function quietBefore(untilWords: string): string {
  return `You are in your Quiet Hours until ${untilWords}: the request will wait until then. It counts as asked, so you can go on.`;
}

/** Said after asking when the Prompt is held by the viewer's Quiet Hours. */
export function quietAfter(untilWords: string): string {
  return `Held by your Quiet Hours until ${untilWords}. It counts as asked. You can send a value now with the form link or by pasting it.`;
}

/** When Ask me now may be pressed again, in words, from the instant it may (an ISO time) and the time zone to read it in. */
export function cooldownWords(againAt: string, now: Date, timeZone: string): string {
  const at = new Date(againAt);
  const minutes = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 60_000));
  return `You asked a moment ago. Ziffr asks at most once every ${ASK_NOW_EVERY_MINUTES} minutes: you can ask again in ${minutes} minute${minutes === 1 ? "" : "s"}, at ${quietUntilWords(at, now, timeZone)}.`;
}

/** One check for "Didn't arrive?": what to look at, and where to go to see or change it (a fixed address of the app). */
export type Check = { text: string; href: string | null; label: string | null };

/** What the checks are made from: the ways the Prompt went by, whether this Ziffr really sends mail, the person's Quiet
 * Hours, and whether replies by email are recorded. */
export type CheckInput = { ways: readonly ConnectorId[]; mailReal: boolean; quietUntil: string | null; repliesByEmail: boolean; email: string | null };

/** What to check when nothing arrived, way by way, then always the Outbox, which says why a message stayed. */
export function didntArrive(i: CheckInput): Check[] {
  const out: Check[] = [];
  for (const way of i.ways) {
    if (way === "email") {
      out.push({ text: i.mailReal ? `Look in the spam folder${i.email ? ` of ${i.email}` : ""}, and check it is the address you want Ziffr to use.` : "This Ziffr keeps email in the Outbox instead of sending it. Open the message there, or use the form link or paste the number.", href: null, label: null });
      if (i.mailReal && !i.repliesByEmail) out.push({ text: "Replies by email are not recorded on this Ziffr: use the link in the email.", href: null, label: null });
    }
    if (way === "slack") out.push({ text: "Open the Ziffr app’s Messages tab in Slack. If it is not there, Slack may not know you by this address: link your Slack account.", href: "/connectors", label: "Check Slack on Connectors" });
    if (way === "telegram") out.push({ text: "Check that Telegram is connected for you, and that you did not block the bot.", href: "/connectors", label: "Check Telegram on Connectors" });
  }
  out.push({ text: "Check which ways Ziffr asks you by, and that the first one works for you.", href: "/settings/deliveries", label: "Your Deliveries" });
  out.push({ text: "Send yourself a test message to see that the way reaches you at all.", href: "/setup?step=ways", label: "Send a test message" });
  if (i.quietUntil) out.push({ text: `Your Quiet Hours until ${i.quietUntil} hold it: it goes out when they end.`, href: "/settings/deliveries", label: "Quiet Hours" });
  out.push({ text: "See it in the Outbox: it says why a message stayed.", href: "/connectors/outbox", label: "Open the Outbox" });
  return out;
}

/** What a person is told when the daily cap stops "Ask me for it": the number and how long until it resets (`resetsAt` is an ISO time). */
export function askForItLimitWords(resetsAt: string, perDay: number, now: number = Date.now()): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(resetsAt) - now) / 60_000));
  const wait = minutes <= 90 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `${Math.ceil(minutes / 60)} hours`;
  return `You have asked Ziffr to message you ${perDay} times today, counting test messages. Try again in ${wait}.`;
}
