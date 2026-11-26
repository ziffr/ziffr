// When a connection notice is sent (GLOSSARY: Connector, Delivery; spec 0016, spec 0007). Pure: no database.
// An account a person has not been emailed about in the last day is announced. Emails about one they were told about
// already are held to a few an hour and a day. Above a higher number of notices of any kind, one summary email says that
// single ones are held back, at most once an hour, so the number of emails stays bounded and the person still hears.
// A notice that could not be sent counts for none of this: nobody was told by it.
import { createHash } from "node:crypto";
import type { ChatService } from "./connection-notice-words";

/** Starts the external reference of every connection notice's Delivery, by which earlier ones are found. */
export const CONNECTION_NOTICE = "account-connection";
/** The external reference of a summary email. */
export const SUMMARY_NOTICE = `${CONNECTION_NOTICE}:summary`;
/** Notices about an account already announced go while the person had fewer than this in the last hour. */
export const REPEATS_PER_HOUR = 5;
/** Notices about an account already announced go while the person had fewer than this in the last day. */
export const REPEATS_PER_DAY = 20;
/** Notices of any kind one person gets one by one in an hour at most, per Workspace. */
export const CEILING_PER_HOUR = 20;
/** Notices of any kind one person gets one by one in a day at most, per Workspace. */
export const CEILING_PER_DAY = 60;
/** How far back earlier notices are looked at, in hours. */
export const NOTICE_HISTORY_HOURS = 24;

const HOUR = 3_600_000;

/** The external reference of a notice that an account was connected to a person (`got`) or moved away from them
 * (`lost`): the same for the same account, which it names only by a hash. */
export const noticeRef = (what: "got" | "lost", service: ChatService, accountId: string) =>
  `${CONNECTION_NOTICE}:${what}:${createHash("sha256").update(`${service}\n${accountId}`).digest("hex").slice(0, 32)}`;

/** A notice made for the person before: its reference, when, and whether sending it failed for good. */
export type EarlierNotice = { ref: string; at: number; failed: boolean };

/** What to send for a notice with this reference, given the person's earlier ones in the Workspace: the notice itself,
 * a summary in its place, or nothing. */
export function whatToSend(earlier: EarlierNotice[], ref: string, now: number): "notice" | "summary" | "nothing" {
  const within = (list: EarlierNotice[], hours: number) => list.filter((n) => n.at > now - hours * HOUR);
  const sent = within(earlier.filter((n) => !n.failed), NOTICE_HISTORY_HOURS);
  const single = sent.filter((n) => n.ref !== SUMMARY_NOTICE);
  const hour = within(single, 1).length;
  const day = single.length;
  if (single.some((n) => n.ref === ref) && (hour >= REPEATS_PER_HOUR || day >= REPEATS_PER_DAY)) return "nothing";
  if (hour < CEILING_PER_HOUR && day < CEILING_PER_DAY) return "notice";
  return within(sent, 1).some((n) => n.ref === SUMMARY_NOTICE) ? "nothing" : "summary";
}
