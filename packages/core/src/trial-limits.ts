// Trial Limits (spec 0040; GLOSSARY: Trial Limit, Trial Workspace): the numbers that bound every Trial Workspace, set for
// all trials at once by Ziffr Cloud (its signed API) or by an Installation Admin, and moved without a release. One list
// with each number's range and default, so the Installation settings page, the Cloud API, the database triggers and the
// words people read agree. Pure: nothing here reads a database; trial-limits-in-effect.ts reads the numbers.
// A value outside its range is never used, whatever put it there (a typo in the environment, an old row): the default
// applies instead, so a mistaken setting can neither switch a safeguard off nor make it absurd. Lowering a limit never
// deletes or stops what a trial has: a trial over the new number keeps what it has and cannot add more.

/** The keys of the Trial Limits, as the code that uses one names it (also the names in the Cloud API's JSON). */
export type TrialLimitKey =
  | "days" | "graceDays" | "max" | "metrics" | "messagesPerDay" | "keys" | "feeds" | "assistants" | "webhooks" | "webhookSendsPerDay" | "viewLinks";

/** One Trial Limit: the Installation Setting that holds it, its words, its range and its default. The days have no
 * default that makes trials: without them trials are off (`default` is what hosted Ziffr starts with). */
export type TrialLimit = { key: TrialLimitKey; name: string; label: string; help: string; min: number; max: number; default: number };

/** Every Trial Limit, in the order the page shows them. */
export const TRIAL_LIMITS: TrialLimit[] = [
  { key: "days", name: "ZIFFR_TRIAL_DAYS", label: "Days a trial lasts", min: 1, max: 30, default: 14,
    help: "Set, it turns trials on: whoever signs in may start a Trial Workspace, and every Workspace made here is one. Hosted Ziffr offers trials with 14 days unless set; Ziffr Cloud sets 0 (null in its API) to switch trials off, and trials that run go on until they end. Applies to trials made afterwards." },
  { key: "graceDays", name: "ZIFFR_TRIAL_GRACE_DAYS", label: "Days a trial's data stays after it ends", min: 1, max: 60, default: 7,
    help: "After the trial ends nothing can be added, and its Owner can still download everything; then it is deleted. Applies to every trial that has ended and is waiting, too: a smaller number deletes them sooner." },
  { key: "max", name: "ZIFFR_TRIAL_MAX", label: "Trials at once", min: 1, max: 100_000, default: 500,
    help: "The most trials that may run at the same time." },
  { key: "metrics", name: "ZIFFR_TRIAL_LIMIT_METRICS", label: "Metrics", min: 5, max: 100, default: 25,
    help: "The Metrics one trial may hold, Archived Metrics included." },
  { key: "messagesPerDay", name: "ZIFFR_TRIAL_LIMIT_MESSAGES_PER_DAY", label: "Messages a trial sends a day", min: 10, max: 500, default: 100,
    help: "The real messages one trial sends in 24 hours, over email, Slack and Telegram together. The rest wait in the Outbox." },
  { key: "keys", name: "ZIFFR_TRIAL_LIMIT_KEYS", label: "Access Keys that work", min: 1, max: 10, default: 2,
    help: "The Access Keys of people that work at the same time in one trial, never past the trial's last day." },
  { key: "feeds", name: "ZIFFR_TRIAL_LIMIT_FEEDS", label: "Feeds, and Feed Keys per Feed", min: 1, max: 10, default: 2,
    help: "The Feeds one trial may have, and the Feed Keys that work on each of them." },
  { key: "assistants", name: "ZIFFR_TRIAL_LIMIT_ASSISTANTS", label: "Connected assistants", min: 1, max: 5, default: 1,
    help: "The assistants (Claude and others, through the MCP Server) that may work at the same time in one trial." },
  { key: "webhooks", name: "ZIFFR_TRIAL_LIMIT_WEBHOOKS", label: "Webhooks", min: 0, max: 10, default: 2,
    help: "The Webhooks one trial may hold, Workspace and personal together. 0: trials cannot add any." },
  { key: "webhookSendsPerDay", name: "ZIFFR_TRIAL_LIMIT_WEBHOOK_SENDS_PER_DAY", label: "Webhook sends a trial makes a day", min: 10, max: 1_000, default: 200,
    help: "The sends a trial's Webhooks make in 24 hours; past it they wait for tomorrow." },
  { key: "viewLinks", name: "ZIFFR_TRIAL_LIMIT_VIEW_LINKS", label: "View Links that work", min: 0, max: 20, default: 5,
    help: "The View Links that work at the same time in one trial. 0: trials cannot make any." },
];

/** The limit with this key. */
export const trialLimitOf = (key: TrialLimitKey): TrialLimit => TRIAL_LIMITS.find((l) => l.key === key)!;

/** The Installation Setting names that hold a Trial Limit. */
export const TRIAL_LIMIT_NAMES: ReadonlySet<string> = new Set(TRIAL_LIMITS.map((l) => l.name));

/** The Trial Limits as numbers. */
export type TrialLimitNumbers = Record<TrialLimitKey, number>;

/** The sentence that says why a text is not a value of this limit, or null when it is one: a whole number within the range. */
export function trialLimitProblem(limit: TrialLimit, text: string): string | null {
  const range = `${limit.min.toLocaleString("en-US")} to ${limit.max.toLocaleString("en-US")}`;
  if (!/^\d{1,9}$/.test(text.trim())) return `${limit.label} is a whole number from ${range}.`;
  const n = Number(text.trim());
  return n >= limit.min && n <= limit.max ? null : `${limit.label} must be from ${range}.`;
}

/** The same check for a number that arrives as JSON: only an integer within the range is one. */
export function trialLimitNumberProblem(limit: TrialLimit, n: unknown): string | null {
  return typeof n === "number" && Number.isInteger(n) ? trialLimitProblem(limit, String(n)) : `${limit.label} is a whole number from ${limit.min.toLocaleString("en-US")} to ${limit.max.toLocaleString("en-US")}.`;
}

/** The value of a limit in these settings: the number set, or the default when it is not set or is not within the range. */
export function trialLimitFrom(settings: Record<string, string | undefined>, key: TrialLimitKey): number {
  const limit = trialLimitOf(key);
  const text = settings[limit.name];
  return text !== undefined && trialLimitProblem(limit, text) === null ? Number(text.trim()) : limit.default;
}

/** Every Trial Limit in these settings. The days of 0 (trials off) are read by trialSettings. */
export function trialLimitsFrom(settings: Record<string, string | undefined>): TrialLimitNumbers {
  return Object.fromEntries(TRIAL_LIMITS.map((l) => [l.key, trialLimitFrom(settings, l.key)])) as TrialLimitNumbers;
}

/** The limits the database triggers enforce: the row `trial_limits` holds them, under these column names. */
export const TRIAL_LIMIT_COLUMNS = { metrics: "metrics", keys: "keys", feeds: "feeds", assistants: "assistants", viewLinks: "view_links" } as const satisfies Partial<Record<TrialLimitKey, string>>;
