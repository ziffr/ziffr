// GLOSSARY: Announcement. The pure part of the Announcement line: what is shown and what a dismissal remembers. No
// browser and no server code, so the line's component and its tests share it. A dismissal belongs to a visit (its
// `scope`), so a new sign-in or a new demo visit, which has another scope, brings every Announcement back.

/** One Announcement: a stable id (it changes when the Announcement is edited, so a dismissed one comes back), plain text,
 * optionally one link, a level (info when absent) and whether it can be dismissed (it can when absent). Nothing private:
 * it reaches every visitor's browser. */
export type Announcement = { id: string; text: string; link?: { href: string; label: string }; level?: "info" | "warning"; dismissible?: boolean };

/** The most lines shown at once; the rest wait behind "more". */
const SHOWN_AT_ONCE = 3;

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

/** The Announcements still to show: those not dismissed in this visit; one that cannot be dismissed always shows. */
export function stillShown(items: Announcement[], dismissed: string[]): Announcement[] {
  return items.filter((a) => a.dismissible === false || !dismissed.includes(a.id));
}

/** The built-in notice, the Installation's and the Workspace's, in the order they show: the Installation's always rank above
 * the Workspace's (they are for everyone, however small the Workspace), and within each group a warning comes before info.
 * The demo's notice leads where visitors may change the demo (it says what will be lost); otherwise it ranks by its level
 * among the Installation's. */
export function shellOrder(builtIn: Announcement[], installation: Announcement[], changesOpen: boolean, workspace: Announcement[] = []): Announcement[] {
  const warningsFirst = (items: Announcement[]) => [...items.filter((a) => a.level === "warning"), ...items.filter((a) => a.level !== "warning")];
  if (changesOpen) return [...builtIn, ...installation, ...warningsFirst(workspace)];
  const warnings = installation.filter((a) => a.level === "warning");
  return [...warnings, ...builtIn, ...installation.filter((a) => a.level !== "warning"), ...warningsFirst(workspace)];
}

/** What fits on screen: the first `max` lines, and how many wait behind "more" (none when `expanded`). */
export function capShown(items: Announcement[], expanded: boolean, max: number = SHOWN_AT_ONCE): { visible: Announcement[]; hidden: number } {
  if (expanded || items.length <= max) return { visible: items, hidden: 0 };
  return { visible: items.slice(0, max), hidden: items.length - max };
}
