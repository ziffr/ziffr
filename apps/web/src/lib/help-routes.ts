// GLOSSARY: Slide-over. Which user guide chapter describes the screen a person is on, for the Help panel.
// One table, the longest matching prefix wins; a test checks that every route exists as a page and every
// chapter named here exists in the guide.

/** Route prefix → chapter slug (the file name without its number: `metrics` is `10-metrics.md`). */
export const HELP_ROUTES: readonly (readonly [string, string])[] = [
  ["/", "dashboards"],
  ["/dashboards", "dashboards"],
  ["/gallery", "templates"],
  ["/stories", "dashboards"],
  ["/metrics", "metrics"],
  ["/paste-values", "metrics"],
  ["/submit", "metrics"],
  ["/workflows", "workflows"],
  ["/analyze", "analyze"],
  ["/decks", "decks-and-themes"],
  ["/themes", "decks-and-themes"],
  ["/actions", "actions"],
  ["/changes", "actions"],
  ["/schedule", "your-settings"],
  ["/settings", "workspace-settings"],
  ["/settings/profile", "your-settings"],
  ["/settings/appearance", "your-settings"],
  ["/settings/deliveries", "your-settings"],
  ["/settings/alerts", "your-settings"],
  ["/settings/assistants", "your-settings"],
  ["/settings/your-webhooks", "your-settings"],
  ["/settings/schedule", "your-settings"],
  ["/settings/packs", "packs"],
  ["/settings/library", "analyze"],
  ["/team", "workspace-settings"],
  ["/connectors", "workspace-settings"],
  ["/sources", "workspace-settings"],
  ["/audit", "workspace-settings"],
  ["/welcome", "workspace-settings"],
  ["/try", "workspace-settings"],
  ["/invite", "workspace-settings"],
  ["/installation", "installation-settings"],
  ["/login", "your-settings"],
  ["/demo", "your-settings"],
];

/** The chapter slug for `path` (the longest listed prefix on a path boundary), or null when none describes it. */
export function chapterForPath(path: string): string | null {
  let best: readonly [string, string] | null = null;
  for (const entry of HELP_ROUTES) {
    const [prefix] = entry;
    // "/" is Home and matches only itself, or every page would fall back to it.
    const hit = prefix === "/" ? path === "/" : path === prefix || path.startsWith(prefix + "/");
    if (hit && (!best || prefix.length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}
