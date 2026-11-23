// The demo's limits (GLOSSARY: Demo Mode; spec 0051, Limits, ticket 5): the numbers in one place. They are starting
// points the owner may change (spec decision 7). The row caps are also rows of `demo_limits` in the database, which the
// triggers read; a database test compares the two lists, so one cannot drift from the other. Nothing here refuses
// anything yet: a later ticket opens a table and calls `checkDemoBudget` (demo-budget.ts) before each allowed write.

/** Rows of each kind visitors may make in the whole demo between two Demo Resets, by the kind's name in `demo_limits`. */
export const DEMO_ROW_CAPS = {
  dashboards: 25,
  widgets_per_dashboard: 40,
  saved_widgets: 50,
  decks: 15,
  snapshots: 20,
  metrics: 15,
  templates: 15,
  workflows: 10,
  groups: 10,
  tags: 20,
  open_actions: 300,
  values: 2000,
} as const;

/** How many changes may be counted, by what is counting them. The visit's id is free to mint, so only the address's and
 * the demo's limits hold against a script; the visit's are for a person who clicks too fast. */
export const DEMO_WRITE_BUDGET = {
  perVisitPerMinute: 30,
  perVisitPerWindow: 300,
  perAddressPerWindow: 600,
  demoPerWindow: 3000,
} as const;

/** The longest text of each kind, in characters (code points): names and titles, descriptions, a Question, Task or reply, a Tag. */
export const DEMO_TEXT_MAX = { name: 80, description: 500, message: 1000, tag: 40 } as const;

/** The largest a deck's store may be, in bytes (a deck made by a visitor). */
export const DEMO_DECK_STORE_MAX_BYTES = 512 * 1024;

/** Whether a deck's store (its JSON as text) is small enough for the demo. */
export function demoDeckStoreOk(store: string): boolean {
  return new TextEncoder().encode(store).length <= DEMO_DECK_STORE_MAX_BYTES;
}
