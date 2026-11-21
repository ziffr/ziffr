// Webhook limits (GLOSSARY: Webhook; spec 0034, "Limits"): abuse safeguards, the same at every Size and never a price.
// One file so the numbers can be tuned in one place. The two limits an operator may move (ZIFFR_LIMIT_WEBHOOKS_PER_WORKSPACE,
// ZIFFR_LIMIT_WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY, sending-limits.ts) are the defaults here; the code reads the value in effect.
import { sendingLimitDefault } from "./sending-limits";

/** Webhooks a Workspace may hold. */
export const WEBHOOKS_PER_WORKSPACE = sendingLimitDefault("webhooksPerWorkspace");
/** The longest message a Webhook is sent, in bytes (used by sending, ticket 3). */
export const WEBHOOK_MESSAGE_MAX_BYTES = 16 * 1024;
/** Sends a Workspace gets per day; past it sends wait for tomorrow (used by sending, ticket 3). */
export const WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY = sendingLimitDefault("webhookSendsPerWorkspace");
/** Days the log of sends is kept (used by sending, ticket 3). */
export const WEBHOOK_LOG_DAYS = 14;
/** The longest address, in characters. */
export const WEBHOOK_URL_MAX = 2_000;
/** The longest name, in characters. */
export const WEBHOOK_NAME_MAX = 80;
/** The longest request body a Webhook may send back, in bytes. */
export const WEBHOOK_INBOUND_MAX_BYTES = 16 * 1024;
/** Requests a Webhook may make back per minute; past it they answer 429. */
export const WEBHOOK_INBOUND_PER_MINUTE = 60;
/** External tasks one Action may be linked to. */
export const WEBHOOK_EXTERNAL_IDS_PER_ACTION = 10;
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

/** How long the sends made just before a Metric or a Workspace is deleted may take in all, so a stalling address cannot hold the delete back. */
export const WEBHOOK_SEND_NOW_BUDGET_MS = 15_000;
/** Failed requests per minute to one Webhook's inbound address from one network address (an IPv6 /56) before more are refused (429) without opening the secret. */
export const WEBHOOK_INBOUND_FAILURES_PER_ADDRESS = 20;
/** Failed requests per minute to one Webhook's inbound address from anywhere before only known senders are let through. */
export const WEBHOOK_INBOUND_FAILURES_PER_ID = 600;
/** Network addresses remembered per Webhook as having sent a valid signed request in the last day; they are never refused by the gate. */
export const WEBHOOK_INBOUND_KNOWN_SENDERS = 16;
/** Failed requests per minute from one network address (an IPv6 /56) to all Webhook ids together before more are refused (429), so made-up ids cannot be tried freely. */
export const WEBHOOK_INBOUND_FAILURES_PER_ADDRESS_ANY_ID = 100;
/** Addresses with no failures of their own that are still let through per minute to a Webhook that is past its failure ceiling, so a real new sender (a moved recipe, a rotated secret) can get in during a flood. */
export const WEBHOOK_INBOUND_NEW_SENDERS_PER_MINUTE = 60;
/** Failed requests per minute to one Webhook from one network address (an IPv6 /56) that a success never resets: a hard cap, known senders included. */
export const WEBHOOK_INBOUND_RAW_FAILURES_PER_ADDRESS = 200;
