// GLOSSARY: Announcement. The pure parts of the Announcements form on the Installation settings page: a moment typed
// in the browser's own time zone becomes an exact instant for the server, and back; and the words for a window.
// The server checks every field again (announcement-rules.ts); nothing here is trusted over there.

const pad = (n: number) => String(n).padStart(2, "0");

/** An instant as the value of a date-and-time field in the browser's time zone, or "" for none. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** What a date-and-time field holds, as an exact instant (ISO, in UTC); null for empty. Text that is no moment goes on
 * as it is, so the server refuses it in its own words. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

/** One moment in words, in a time zone ("24 Nov 2026, 09:30"). */
function moment(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
}

/** The window of an Announcement in words: "… to …", "From …", "Until …" or "Always". */
export function windowWords(startsAt: string | null, endsAt: string | null, timeZone: string): string {
  if (startsAt && endsAt) return `${moment(startsAt, timeZone)} to ${moment(endsAt, timeZone)}`;
  if (startsAt) return `From ${moment(startsAt, timeZone)}`;
  if (endsAt) return `Until ${moment(endsAt, timeZone)}`;
  return "Always";
}

/** The words for where an Announcement stands. */
export const STATE_WORDS = { running: "On", scheduled: "Scheduled", ended: "Ended", off: "Off" } as const;
