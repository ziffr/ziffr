// The rules of Feedback (spec 0049, ticket #915; GLOSSARY: Feedback): which kinds there are, how long the words may be,
// what a stored route and version look like, and how many a person and a Workspace may send in a day. Pure, so every
// rule is tested without a database; the operations are in feedback.ts. Everything here is about untrusted input: the
// form's values come from a browser and are checked again on the server.

/** What the person says it is. */
export const FEEDBACK_KINDS = ["problem", "idea", "question"] as const;
/** One of FEEDBACK_KINDS. */
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** Where a feedback stands: waiting for a maintainer, filed, answered, or closed. */
export const FEEDBACK_STATUSES = ["waiting_for_review", "open", "answered", "closed"] as const;
/** One of FEEDBACK_STATUSES. */
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** The longest words a person may send, in characters. */
export const FEEDBACK_WORDS_MAX = 2000;
/** The most feedback one person may send in 24 hours. */
export const FEEDBACK_PER_PERSON_PER_DAY = 5;
/** The most feedback all the people of one Workspace may send in 24 hours. */
export const FEEDBACK_PER_WORKSPACE_PER_DAY = 20;

const ROUTE_MAX = 200;
// A control character is never part of a person's words (a newline and a tab are kept).
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
// Sections whose next segment names something in a Workspace (a Metric's slug, a dashboard, a token): never kept.
const NAMED_NEXT = new Set(["metrics", "dashboards", "decks", "stories", "actions", "guide", "v", "invite", "submit"]);
const SEGMENT = /^[a-z0-9][a-z0-9_-]{0,60}$/;
const LOOKS_LIKE_ID = /^(\d+|[0-9a-f]{8}-[0-9a-f-]{27}|[0-9a-f]{16,})$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}(-[0-9A-Za-z.]{1,20})?$/;

/** The kind, or null when it is not one of the three. */
export function feedbackKind(input: unknown): FeedbackKind | null {
  return typeof input === "string" && (FEEDBACK_KINDS as readonly string[]).includes(input) ? (input as FeedbackKind) : null;
}

/** The words cleaned (line breaks made plain, control characters dropped, edges trimmed), or why they cannot be sent. */
export function cleanFeedbackWords(input: unknown): { ok: true; words: string } | { ok: false; reason: string } {
  if (typeof input !== "string") return { ok: false, reason: "Write what you want to tell us." };
  const words = input.replace(/\r\n?/g, "\n").replace(CONTROL, "").trim();
  if (words === "") return { ok: false, reason: "Write what you want to tell us." };
  if (words.length > FEEDBACK_WORDS_MAX) return { ok: false, reason: `Keep it under ${FEEDBACK_WORDS_MAX} characters.` };
  return { ok: true, words };
}

/** The page the person was on, as a plain path: no address, no query, no fragment, and nothing that names something in a
 * Workspace (a Metric's slug, an id, a token become `:name`). Null when it does not look like a path of this app, so a
 * made-up value is dropped rather than stored. */
export function normalizeRoute(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 2000 || !input.startsWith("/") || input.startsWith("//")) return null;
  const path = input.split(/[?#]/)[0].toLowerCase();
  const parts = path.split("/").filter((p) => p !== "");
  const out: string[] = [];
  for (const [i, part] of parts.entries()) {
    if (!SEGMENT.test(part)) return null;
    if (i > 0 && NAMED_NEXT.has(parts[i - 1])) { out.push(":name"); break; } // what follows a name (a period, a date) is detail of the Workspace: dropped
    out.push(LOOKS_LIKE_ID.test(part) ? ":id" : part);
  }
  const route = `/${out.join("/")}`;
  return route.length <= ROUTE_MAX ? route : null;
}

/** A route as it is stored (already made plain by normalizeRoute, so `:name` and `:id` are allowed), or null when it is
 * anything else: the check before a stored route is shown anywhere public. */
export function storedRoute(input: unknown): string | null {
  if (typeof input !== "string" || input.length > ROUTE_MAX || !input.startsWith("/") || input.startsWith("//")) return null;
  const parts = input.split("/").slice(1);
  return parts.every((p) => p === ":name" || p === ":id" || SEGMENT.test(p)) ? input : null;
}

/** Whether new feedback is filed at once (`direct`, the default) or waits for a maintainer (`review`). */
export const FEEDBACK_MODES = ["direct", "review"] as const;
/** One of FEEDBACK_MODES. */
export type FeedbackMode = (typeof FEEDBACK_MODES)[number];

/** The setting that holds the mode (an Installation Setting of the central version only). */
export const FEEDBACK_MODE_SETTING = "ZIFFR_FEEDBACK_MODE";

/** The mode in these settings: `review` only when it says so exactly, anything else (empty, unknown) is `direct`. */
export function feedbackMode(settings: Record<string, string | undefined>): FeedbackMode {
  return settings[FEEDBACK_MODE_SETTING]?.trim().toLowerCase() === "review" ? "review" : "direct";
}

/** The status a new feedback gets: open (the bridge files it) when posting directly, else waiting for a maintainer. */
export function newFeedbackStatus(mode: FeedbackMode): FeedbackStatus {
  return mode === "direct" ? "open" : "waiting_for_review";
}

/** The longest reason a maintainer gives when rejecting feedback, in characters. */
export const FEEDBACK_REASON_MAX = 500;

/** The reason for a rejection cleaned like words, or why it cannot be used: the person reads it, so it is required. */
export function cleanRejectionReason(input: unknown): { ok: true; reason: string } | { ok: false; message: string } {
  if (typeof input !== "string") return { ok: false, message: "Say why: the person reads it." };
  const reason = input.replace(/\r\n?/g, "\n").replace(CONTROL, "").trim();
  if (reason === "") return { ok: false, message: "Say why: the person reads it." };
  if (reason.length > FEEDBACK_REASON_MAX) return { ok: false, message: `Keep the reason under ${FEEDBACK_REASON_MAX} characters.` };
  return { ok: true, reason };
}

/** The app version when it is a plain number like 0.11.0, else null. */
export function cleanAppVersion(input: unknown): string | null {
  return typeof input === "string" && VERSION.test(input) ? input : null;
}
