// Sending limits (ticket #516, review 2026-11-fixed-values; GLOSSARY: Installation Settings): the abuse safeguards
// an Installation's operator may move within a range, each its own Installation Setting named ZIFFR_LIMIT_*. Pure, so
// the page can list them and a test can check every range and default; the value in effect is read in
// sending-limit.ts. Every lower bound is above zero on purpose: no setting switches a safeguard off, and a value
// outside its range is refused where it is saved and ignored where it is read from the environment.
// The same for every Size and never set by Ziffr Cloud (ADR 0013). Lowering one never deletes or switches off what
// exists; only what is new waits.

/** The keys of the sending limits, as the code that uses one names it. */
export type SendingLimitKey =
  | "mailPerWorkspace" | "chatPerWorkspace" | "mailPerPerson" | "sendAttempts" | "alertsPerWorkspace" | "alertMessagesPerWorkspace"
  | "invitationsPerWorkspace" | "valuesPerKey" | "valuesPerFeed" | "callsPerKey" | "webhooksPerWorkspace" | "webhookSendsPerWorkspace"
  | "signInLinksPerNetwork" | "contactsPerWorkspace" | "snapshotsPerDashboard" | "alertsPerPerson" | "alertMessagesPerPerson";

/** One sending limit: its environment variable, its words on the page, its range and its default (today's value). */
export type SendingLimit = { key: SendingLimitKey; name: string; label: string; help: string; min: number; max: number; default: number };

/** Every sending limit, in the order the page shows them. */
export const SENDING_LIMITS: SendingLimit[] = [
  { key: "mailPerWorkspace", name: "ZIFFR_LIMIT_EMAILS_PER_WORKSPACE_PER_DAY", label: "Emails per Workspace per day", min: 50, max: 100_000, default: 500,
    help: "The emails one Workspace may send in 24 hours; the rest wait in the queue. A small mail provider may allow a few hundred in all." },
  { key: "chatPerWorkspace", name: "ZIFFR_LIMIT_CHAT_MESSAGES_PER_WORKSPACE_PER_DAY", label: "Telegram and Slack messages per Workspace per day", min: 50, max: 50_000, default: 500,
    help: "The same cap for each of the two: a Workspace may send this many Telegram messages and this many Slack messages in 24 hours. The providers' own limits stay below it." },
  { key: "mailPerPerson", name: "ZIFFR_LIMIT_EMAILS_PER_PERSON_PER_DAY", label: "Emails per person per day", min: 20, max: 5_000, default: 300,
    help: "The emails one person may cause in 24 hours as the sender of requests, questions and notices, over all their Workspaces." },
  { key: "sendAttempts", name: "ZIFFR_LIMIT_SEND_ATTEMPTS", label: "Tries per message", min: 1, max: 10, default: 5,
    help: "How often a queued email, Telegram or Slack message is tried before it counts as failed. A flaky mail server may need more." },
  { key: "alertsPerWorkspace", name: "ZIFFR_LIMIT_ALERTS_PER_WORKSPACE", label: "Alerts per Workspace", min: 50, max: 10_000, default: 500,
    help: "The most Alerts one Workspace may hold in all. Those it holds above a lowered number stay." },
  { key: "alertMessagesPerWorkspace", name: "ZIFFR_LIMIT_ALERT_MESSAGES_PER_WORKSPACE_PER_DAY", label: "Alert messages per Workspace per day", min: 100, max: 100_000, default: 2_000,
    help: "The messages Alerts may send for one Workspace in a day, over all channels. After it Alerts still fire into the list; only the messages wait for tomorrow." },
  { key: "invitationsPerWorkspace", name: "ZIFFR_LIMIT_INVITATION_EMAILS_PER_WORKSPACE_PER_DAY", label: "Invitation emails per Workspace per day", min: 10, max: 2_000, default: 50,
    help: "The invitation emails one Workspace may send in 24 hours. Each person may still send at most 50 a day." },
  { key: "valuesPerKey", name: "ZIFFR_LIMIT_VALUES_PER_KEY_PER_DAY", label: "Values per API key per day", min: 100, max: 1_000_000, default: 1_000,
    help: "The values one API key may submit in 24 hours. A program that sends every minute for 20 Metrics sends 28,800 a day." },
  { key: "valuesPerFeed", name: "ZIFFR_LIMIT_VALUES_PER_FEED_PER_DAY", label: "Values per Feed per day", min: 1_000, max: 10_000_000, default: 10_000,
    help: "The values one Feed may record in 24 hours over all its keys. A person pasting values is held to the same number." },
  { key: "callsPerKey", name: "ZIFFR_LIMIT_CALLS_PER_KEY_PER_MINUTE", label: "Calls per API key per minute", min: 30, max: 6_000, default: 60,
    help: "The calls one API key may make in any 60 seconds." },
  { key: "webhooksPerWorkspace", name: "ZIFFR_LIMIT_WEBHOOKS_PER_WORKSPACE", label: "Webhooks per Workspace", min: 1, max: 50, default: 5,
    help: "The Webhooks one Workspace may hold. A Workspace that holds more than a lowered number keeps them; only new ones wait." },
  { key: "webhookSendsPerWorkspace", name: "ZIFFR_LIMIT_WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY", label: "Webhook sends per Workspace per day", min: 100, max: 1_000_000, default: 10_000,
    help: "The sends a Workspace's Webhooks make in a day; past it they wait for tomorrow." },
  { key: "signInLinksPerNetwork", name: "ZIFFR_LIMIT_SIGN_IN_LINKS_PER_NETWORK_PER_HOUR", label: "Sign-in links per network address per hour", min: 5, max: 500, default: 20,
    help: "The sign-in links one network address may ask for in an hour, for any addresses. A company or school behind one address, all signing in at nine on Monday, needs more." },
  { key: "contactsPerWorkspace", name: "ZIFFR_LIMIT_CONTACTS_PER_WORKSPACE", label: "Contacts per Workspace", min: 100, max: 100_000, default: 1_000,
    help: "The Contacts one Workspace keeps at most." },
  { key: "snapshotsPerDashboard", name: "ZIFFR_LIMIT_SNAPSHOTS_PER_DASHBOARD", label: "Snapshots per dashboard", min: 100, max: 50_000, default: 500,
    help: "The Snapshots one dashboard keeps at most." },
  { key: "alertsPerPerson", name: "ZIFFR_LIMIT_ALERTS_PER_PERSON", label: "Alerts per person", min: 1, max: 200, default: 20,
    help: "The most Alerts one person may hold in one Workspace. This is the ceiling: a Workspace's Owners may lower it for their Workspace, never raise it. Alerts held above a lowered number stay." },
  { key: "alertMessagesPerPerson", name: "ZIFFR_LIMIT_ALERT_MESSAGES_PER_PERSON_PER_DAY", label: "Alert messages per person per day", min: 1, max: 200, default: 20,
    help: "The Alert messages one person is sent in a day; after it Alerts still fire into the list. This is the ceiling: a Workspace's Owners may lower it, and each person may lower it for themselves, never raise it." },
];

/** The limit with this key. */
export const sendingLimitOf = (key: SendingLimitKey): SendingLimit => SENDING_LIMITS.find((l) => l.key === key)!;

/** The default of a limit: today's value, and what the code uses when nothing else is set. */
export const sendingLimitDefault = (key: SendingLimitKey): number => sendingLimitOf(key).default;

/** The sentence that says why a text is not a value of this limit, or null when it is one: a whole number within the range. */
export function sendingLimitProblem(limit: SendingLimit, text: string): string | null {
  const range = `${limit.min.toLocaleString("en-US")} to ${limit.max.toLocaleString("en-US")}`;
  if (!/^\d{1,9}$/.test(text.trim())) return `${limit.label} is a whole number from ${range}.`;
  const n = Number(text.trim());
  return n >= limit.min && n <= limit.max ? null : `${limit.label} must be from ${range}; it cannot be switched off or left without a limit.`;
}

/** The value of a limit in these settings: the number set, or the default when it is not set or is not within the
 * range (a mistyped environment variable never turns a safeguard off or makes it absurd). */
export function sendingLimitFrom(settings: Record<string, string | undefined>, key: SendingLimitKey): number {
  const limit = sendingLimitOf(key);
  const text = settings[limit.name];
  return text !== undefined && sendingLimitProblem(limit, text) === null ? Number(text.trim()) : limit.default;
}
