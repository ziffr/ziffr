// Webhook limits (GLOSSARY: Webhook; spec 0034, "Limits"): abuse safeguards, the same at every Size and never a price.
// One file so the numbers can be tuned in one place.

/** Webhooks a Workspace may hold. */
export const WEBHOOKS_PER_WORKSPACE = 5;
/** The longest message a Webhook is sent, in bytes (used by sending, ticket 3). */
export const WEBHOOK_MESSAGE_MAX_BYTES = 16 * 1024;
/** Sends a Workspace gets per day; past it sends wait for tomorrow (used by sending, ticket 3). */
export const WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY = 10_000;
/** Days the log of sends is kept (used by sending, ticket 3). */
export const WEBHOOK_LOG_DAYS = 14;
/** The longest address, in characters. */
export const WEBHOOK_URL_MAX = 2_000;
/** The longest name, in characters. */
export const WEBHOOK_NAME_MAX = 80;
/** How long the old secret still signs after a replacement, in hours. */
export const WEBHOOK_SECRET_OVERLAP_HOURS = 24;
/** Failed sends in a row after which a Webhook is switched off. */
export const WEBHOOK_FAILURES_BEFORE_OFF = 20;
/** Days since the first failure, with no success since, after which a Webhook is switched off. */
export const WEBHOOK_DAYS_FAILING_BEFORE_OFF = 3;
/** The waits before each retry, in milliseconds (1 minute, 5 minutes, 30 minutes, 2 hours, 12 hours); then the send has failed. */
export const WEBHOOK_RETRY_WAITS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000] as const;
/** The longest a `Retry-After` is honoured, in milliseconds. */
export const WEBHOOK_RETRY_AFTER_MAX_MS = 3_600_000;
/** Sends in flight at once in one run of the job. Node looks a name up on a thread pool of four, shared with the
 * rest of the server: a slow answer from some Webhook's DNS holds a thread until it gives up, so the lookups are bounded
 * below the pool and a few slow names cannot starve the job's other work. */
export const WEBHOOK_SEND_CONCURRENCY = 3;
