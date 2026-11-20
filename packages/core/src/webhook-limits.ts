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
