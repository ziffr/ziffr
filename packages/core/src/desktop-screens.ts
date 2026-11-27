// The screens made for building, which a phone says are easier on a larger screen (spec 0055, ticket 4; GLOSSARY:
// Screen Link): why, and what a Screen Link calls each. Pure: no database. This is also the only list of addresses a
// Screen Link may point to, so a browser can never choose where an emailed link leads: each pattern matches a whole
// path of this Ziffr and nothing else (no host, no other query, no fragment).

/** One screen made for a larger screen: the paths it has, what a message calls it, and why it is easier there. */
export type DesktopScreen = { path: RegExp; name: string; why: string };

const ID = "[1-9][0-9]{0,8}";
const screen = (path: string, name: string, why: string): DesktopScreen => ({ path: new RegExp(`^${path}$`), name, why });

/** Every screen made for a larger screen. The web app's route-tiers.test.ts holds it to the Desktop-first pages of the
 * Route Tiers, so neither list changes alone. */
export const DESKTOP_SCREENS: readonly DesktopScreen[] = [
  screen(`/dashboards/${ID}`, "a dashboard", "Dashboards are laid out with a mouse or a trackpad."),
  screen(`/decks/${ID}`, "a deck", "Slides are laid out with a mouse or a trackpad. On a phone you can read and present this deck."),
  screen(`/workflows(\\?id=${ID})?`, "Workflows", "A Workflow has many settings that need room. On a phone you can read its steps."),
  screen("/connectors/(send|sources|who-gets-what)", "Connectors", "Connecting other tools means copying addresses, keys and settings between them."),
  screen("/settings/packs", "Packs", "Installing a Pack starts with a file and a look at everything it adds."),
  screen("/settings/library/playground", "the Playground", "A View Design is written beside its drawing, which needs room."),
  screen("/installation(/feedback)?", "the Installation settings", "These settings are long, with addresses and keys to copy in."),
  screen("/analyze", "Analyze", "Metrics are dragged onto a canvas, which works best with a mouse or a trackpad."),
  screen("/metrics/new", "New metric", "A new Metric has many fields to fill in."),
  screen("/welcome/import(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?", "the import of a Workspace Export", "The file you downloaded from another Ziffr is usually on a computer."),
];

/** The screen made for a larger screen at this path, or null. The path may come from a browser: anything else is null. */
export function desktopScreen(path: unknown): DesktopScreen | null {
  if (typeof path !== "string" || path.length > 80) return null;
  return DESKTOP_SCREENS.find((s) => s.path.test(path)) ?? null;
}
