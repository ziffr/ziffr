// GLOSSARY: Announcement. The pure part of the Announcement line: what is shown and what a dismissal remembers. No
// browser and no server code, so the line's component and its tests share it. A dismissal belongs to a visit (its
// `scope`), so a new sign-in or a new demo visit, which has another scope, brings every Announcement back.

/** One Announcement: a stable id, plain text and optionally one link. Nothing private: it reaches every visitor's browser. */
export type Announcement = { id: string; text: string; link?: { href: string; label: string } };

/** The sessionStorage key that holds the dismissals of this browser tab. */
export const DISMISSED_KEY = "ziffr.announcements.dismissed";

/** The ids dismissed in this visit; anything stored for another visit, or not in the expected shape, counts as none. */
export function dismissedIn(raw: string | null, scope: string): string[] {
  if (!raw) return [];
  try {
    const stored = JSON.parse(raw) as { scope?: unknown; ids?: unknown } | null;
    if (!stored || stored.scope !== scope || !Array.isArray(stored.ids)) return [];
    return stored.ids.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/** What to store after dismissing `id` in this visit: the ids already dismissed here, plus this one. */
export function withDismissed(raw: string | null, scope: string, id: string): string {
  const ids = dismissedIn(raw, scope);
  return JSON.stringify({ scope, ids: ids.includes(id) ? ids : [...ids, id] });
}

/** The Announcements still to show: those not dismissed in this visit. */
export function stillShown(items: Announcement[], dismissed: string[]): Announcement[] {
  return items.filter((a) => !dismissed.includes(a.id));
}
