// GLOSSARY: Widget, Present. Which clicks on a Widget's card open it large (ticket #826), kept apart as plain
// functions so the rule can be tested without a browser.

/** What a click must not open the large view for: menus, links, controls, the popup of a data point and the points themselves. */
const LEAVE_ALONE = [
  "a", "button", "input", "textarea", "select", "summary", "label", "[contenteditable]", "[data-no-open]",
  "[role=button]", "[role=link]", "[role=menu]", "[role=menuitem]", "[role=dialog]", "[role=tooltip]", "[role=slider]", "[role=tab]", "[role=checkbox]", "[role=switch]",
  ".recharts-dot", ".recharts-active-dot", ".recharts-bar-rectangle", ".recharts-tooltip-wrapper",
].join(",");

/** True when a click on `target` (inside `card`) is on the card's body rather than on something with a job of its own. */
export function opensLarge(target: Element | null, card: Element): boolean {
  if (!target || !card.contains(target)) return false; // a popup in a portal belongs to the page, not the card
  const hit = target.closest(LEAVE_ALONE);
  return !hit || !card.contains(hit) || hit === card;
}

/** The address of Present, one at a time, at one Widget; Back returns to the dashboard. */
export function largeHref(dashboardId: number, widgetId: number): string {
  return `/dashboards/${dashboardId}/present?view=one&at=${widgetId}`;
}
