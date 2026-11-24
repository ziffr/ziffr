// Announcement rules (spec 0054; GLOSSARY: Announcement). Pure: what an Announcement's text, link, level, window and
// audience may be, and the order several are shown in. Everything from a browser is checked here again on the server;
// the text is plain words, never markup, and reaches every visitor's browser, so nothing private belongs in it.

import { Refused } from "./actor";

/** The longest text of an Announcement, in characters. */
export const ANNOUNCEMENT_TEXT_MAX = 280;
/** The longest label of an Announcement's link. */
export const ANNOUNCEMENT_LABEL_MAX = 40;
/** The longest address of an Announcement's link. */
export const ANNOUNCEMENT_URL_MAX = 500;
/** The most Announcements an Installation may have switched on and not yet ended. */
export const INSTALLATION_ANNOUNCEMENTS_ACTIVE_MAX = 20;

/** How urgent an Announcement is: a warning is shown before an info. */
export const ANNOUNCEMENT_LEVELS = ["info", "warning"] as const;
/** One level of an Announcement. */
export type AnnouncementLevel = (typeof ANNOUNCEMENT_LEVELS)[number];
/** Who sees an Installation Announcement: everyone, or only the people in the demo. */
export const ANNOUNCEMENT_AUDIENCES = ["everyone", "demo"] as const;
/** One audience of an Installation Announcement. */
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

/** What an Installation Admin enters for an Announcement, as it is stored. */
export type AnnouncementFields = {
  text: string;
  link: { href: string; label: string } | null;
  level: AnnouncementLevel;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  dismissible: boolean;
  audience: AnnouncementAudience;
  public: boolean;
};

// Control characters (C0, DEL, C1), line and paragraph separators, and the characters that reorder text on screen
// (bidirectional marks, embeddings, overrides and isolates), which can make a line read differently from what it says.
const HIDDEN_CHARS = "\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029\\u061C\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069";
const BREAKS = new RegExp("[\\t\\n\\r\\u2028\\u2029]+", "g");
const HIDDEN = new RegExp(`[${HIDDEN_CHARS}]`, "g");
const HIDDEN_OR_SPACE = new RegExp(`[\\s${HIDDEN_CHARS}]`);
const BAD_LINK = "The link must be a web address starting with https://.";

/** Plain one-line words: line breaks and tabs made spaces, other hidden characters removed, whitespace runs made one space. */
export function plainLine(raw: unknown): string {
  return String(raw ?? "").replace(BREAKS, " ").replace(HIDDEN, "").replace(/\s+/g, " ").trim();
}

// A short text, checked: bounds the work before cleaning (far past the limit is refused, not scanned), then counts characters.
function shortText(raw: unknown, max: number, missing: string, tooLong: string): string {
  if (typeof raw !== "string" || raw.length > max * 4) throw new Refused(typeof raw === "string" ? tooLong : missing);
  const text = plainLine(raw);
  if (!text) throw new Refused(missing);
  if ([...text].length > max) throw new Refused(tooLong);
  return text;
}

/** The text of an Announcement, checked: one to 280 characters of plain words. Throws a sentence for the person. */
export function announcementText(raw: unknown): string {
  return shortText(raw, ANNOUNCEMENT_TEXT_MAX, "Write the words of the Announcement.", `The Announcement may have at most ${ANNOUNCEMENT_TEXT_MAX} characters.`);
}

/** The label of a link, checked: one to 40 characters of plain words. */
export function announcementLabel(raw: unknown): string {
  return shortText(raw, ANNOUNCEMENT_LABEL_MAX, "Say in a few words what the link is.", `The link's words may have at most ${ANNOUNCEMENT_LABEL_MAX} characters.`);
}

/** The address of a link, checked: https only, no sign-in details in it, a host, at most 500 characters. Returns it
 * as the browser would write it. Never javascript:, data: or http:. */
export function announcementHref(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > ANNOUNCEMENT_URL_MAX * 2) throw new Refused(BAD_LINK);
  const typed = raw.trim();
  // A space or hidden character in the address is refused, not cleaned: a link is not rewritten behind the person's back.
  if (HIDDEN_OR_SPACE.test(typed)) throw new Refused(BAD_LINK);
  let url: URL;
  try { url = new URL(typed); } catch { throw new Refused(BAD_LINK); }
  if (url.protocol !== "https:" || !url.hostname) throw new Refused(BAD_LINK);
  if (url.username || url.password) throw new Refused("The link may not hold a name or password.");
  if (url.href.length > ANNOUNCEMENT_URL_MAX) throw new Refused(`The link may have at most ${ANNOUNCEMENT_URL_MAX} characters.`);
  return url.href;
}

// A moment as an instant, or none: an ISO date and time with a zone, nothing a server's time zone could change.
function instant(raw: unknown, what: string): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(raw)) throw new Refused(`The ${what} is not a date and time with a time zone.`);
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) throw new Refused(`The ${what} is not a date and time.`);
  return t.toISOString();
}

/** Every field of an Installation Announcement checked, from what a browser sent. Throws a sentence for the person. */
export function installationAnnouncementFields(input: unknown): AnnouncementFields {
  if (!input || typeof input !== "object") throw new Refused("Write the words of the Announcement.");
  const i = input as Record<string, unknown>;
  const level = i.level === undefined ? "info" : i.level;
  if (!ANNOUNCEMENT_LEVELS.includes(level as AnnouncementLevel)) throw new Refused("The level is info or warning.");
  const audience = i.audience === undefined ? "everyone" : i.audience;
  if (!ANNOUNCEMENT_AUDIENCES.includes(audience as AnnouncementAudience)) throw new Refused("The audience is everyone or the demo.");
  for (const flag of ["active", "dismissible", "public"] as const) if (i[flag] !== undefined && typeof i[flag] !== "boolean") throw new Refused("A switch is on or off.");
  if (i.link !== undefined && i.link !== null && typeof i.link !== "object") throw new Refused(BAD_LINK);
  const link = (i.link ?? {}) as Record<string, unknown>;
  const hasHref = link.href !== undefined && link.href !== null && link.href !== "";
  const hasLabel = link.label !== undefined && link.label !== null && link.label !== "";
  if (hasHref !== hasLabel) throw new Refused("A link needs both its address and a few words that say what it is.");
  const startsAt = instant(i.startsAt, "start");
  const endsAt = instant(i.endsAt, "end");
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new Refused("The end must be after the start.");
  if (i.public === true && audience !== "everyone") throw new Refused("Only an Announcement for everyone can be shown on the sign-in page.");
  return {
    text: announcementText(i.text),
    link: hasHref ? { href: announcementHref(link.href), label: announcementLabel(link.label) } : null,
    level: level as AnnouncementLevel,
    startsAt, endsAt,
    active: i.active !== false,
    dismissible: i.dismissible !== false,
    audience: audience as AnnouncementAudience,
    public: i.public === true,
  };
}

/** Where an Announcement stands at `now`: switched off, not started, running or over. */
export function announcementState(a: { active: boolean; startsAt: string | null; endsAt: string | null }, now: Date): "off" | "scheduled" | "running" | "ended" {
  if (a.endsAt && new Date(a.endsAt) <= now) return "ended";
  if (!a.active) return "off";
  if (a.startsAt && new Date(a.startsAt) > now) return "scheduled";
  return "running";
}

/** Most urgent first: a warning before an info, then the earlier start (none first), then the earlier made. */
export function orderAnnouncements<T extends { level: string; startsAt: string | null; createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    Number(b.level === "warning") - Number(a.level === "warning")
    || (a.startsAt ?? "").localeCompare(b.startsAt ?? "")
    || a.createdAt.localeCompare(b.createdAt));
}
