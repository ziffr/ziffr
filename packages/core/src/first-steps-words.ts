// The words and fixed rules of First Steps' last three screens (spec 0067; GLOSSARY: First Steps, Prompt, Delivery,
// Submitter, Invitation, Contact). Pure: no database. Every sentence about a reply is fixed text; the only
// variable parts are the reader's own address, a Metric's name, a person's name and times. Nothing from a mail's text
// ever comes through here.
import type { SourceId } from "./types";

/** The Sources a person answers by. A Metric with none of them takes values from programs only. */
export const PEOPLE_SOURCES: readonly SourceId[] = ["web_form", "mail", "slack", "telegram"];

/** What became of a reply, as the database records it, in the fixed words shown to the person whose request it answered;
 * null when there is nothing to say (it was taken). `address` is that person's own, never anyone else's. */
export function replyWords(outcome: string, address: string | null): string | null {
  switch (outcome) {
    case "refused":
    case "form_link": return "Your reply was not recorded. Ziffr emailed you why.";
    // Refused with no email promised: nothing says one went.
    case "unverified":
    case "empty":
    case "too_many":
    case "limited": return "Your reply was not recorded.";
    case "held": return "Check your inbox for a link that confirms your reply.";
    case "wrong_sender": return `A reply came from another address, so it was not counted.${address ? ` Reply from ${address}.` : ""}`;
    case "expired": return "That request is too old. Ask again.";
    default: return null;
  }
}

/** What the screen says after a request went by email: where to, what its subject starts with, and how to answer. */
export function sentWords(i: { state: "sent" | "queued"; address: string | null; metric: string; reply: boolean }): string {
  const where = i.address ? ` to ${i.address}` : "";
  return `${i.state === "sent" ? "Sent" : "On its way"}${where}. Look for an email whose subject starts with “What’s the number for ${i.metric}”. ${i.reply ? "Reply to it with the number." : "Open the link in the email and type the number."}`;
}

/** A day and hour as "Monday 30 November at 09:00". `day` is a calendar day (YYYY-MM-DD) in the Workspace's zone. */
export function whenWords(day: string, hour: number): string {
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${day}T00:00:00Z`));
  return `${date.replace(",", "")} at ${String(hour).padStart(2, "0")}:00`;
}

/** The name a new Contact gets: the part of the address before the @. */
export function contactName(email: string): string {
  return email.split("@")[0].slice(0, 80);
}

/** Names as a list in a sentence: "You", "You and sam", "You, sam and 2 more". */
export function nameList(names: readonly string[], most = 3): string {
  const shown = names.length > most ? [...names.slice(0, most - 1), `${names.length - most + 1} more`] : [...names];
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0] ?? "";
}

/** What became of the choice of a colleague, and when they are asked. */
export type ColleagueState =
  /** A Member, or in an ordinary Workspace a Contact where email goes out: asked from the next run. */
  | "asked"
  /** An ordinary Workspace without email: the request waits. */
  | "outbox"
  /** A trial: an invitation was emailed. */
  | "invited"
  /** A trial: an invitation stands but was not emailed, so its maker sends the link. */
  | "link"
  /** A trial: an invitation to them is open already. */
  | "waiting";

/** The sentences after a colleague was chosen. `when` is the first time Ziffr asks, in words, or null when it cannot say. */
export function colleagueWords(i: { state: ColleagueState; name: string; when: string | null; note?: string | null }): string[] {
  const first = i.when ? ` It first asks on ${i.when}.` : "";
  switch (i.state) {
    case "asked": return [`Ziffr asks ${i.name} from now on.${first}`];
    case "outbox": return [`${i.name} is added. The request waits in the Outbox.`];
    case "invited": return [`${i.name} is invited to join as a Guest.`, "Ziffr asks them once they accept."];
    case "link": return [i.note ?? "The invitation was not emailed; send the link yourself.", "Ziffr asks them once they accept."];
    case "waiting": return [`${i.name} is invited already.`, "Ziffr asks them once they accept."];
  }
}
