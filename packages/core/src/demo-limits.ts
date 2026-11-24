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
  // The spec gives no numbers for these two; starting points for the owner (ticket 9).
  themes: 15,
  versions: 150,
} as const;

/** How many changes may be counted, by what is counting them. The visit's id is free to mint, so only the address's,
 * the network's and the demo's limits hold against a script; the visit's are for a person who clicks too fast. One
 * address (200) and one network (an IPv4 /24 or an IPv6 /48, 400) can each use up only a part of the demo's 3,000 a
 * window, so one script cannot lock every visitor out alone: it takes eight networks. Who can rent that many can still
 * use the demo up for a window; that is accepted (the demo starts fresh at the next window, and nothing else is hurt). */
export const DEMO_WRITE_BUDGET = {
  perVisitPerMinute: 30,
  perVisitPerWindow: 200,
  perAddressPerWindow: 200,
  /** Values (a paste counts each) one address may write in a window: a quarter of the 2,000-value cap, so no address fills it for everyone. */
  perAddressValuesPerWindow: 500,
  /** Ask me now claims one address may make in a window. */
  perAddressAskNowPerWindow: 10,
  /** Minutes one address waits between two Workflow runs, so one script cannot hold the demo's one run a minute. */
  workflowSlotMinutes: 5,
  perNetworkPerWindow: 400,
  demoPerWindow: 3000,
} as const;

/** The longest text of each kind, in characters (code points): names and titles, descriptions, a Question, Task or reply, a Tag. */
export const DEMO_TEXT_MAX = { name: 80, description: 500, message: 1000, tag: 40 } as const;

/** How much a visitor may store (spec 0051, ticket 9; Limits: growth): a widget's settings, all the widgets of one dashboard, a
 * Version's snapshot (past it the Version is not recorded), a template's body, what one visit may write in a reset window (in
 * KB, counted with its other counts), and the Versions one visit may name. */
export const DEMO_STORE_MAX = {
  widgetSettingsBytes: 8 * 1024,
  dashboardWidgetsBytes: 200 * 1024,
  versionSnapshotBytes: 256 * 1024,
  templateBodyBytes: 200 * 1024,
  visitKbPerWindow: 2000,
  namedVersionsPerVisit: 5,
} as const;

/** The largest a deck's store may be, in bytes (a deck made by a visitor). */
export const DEMO_DECK_STORE_MAX_BYTES = 512 * 1024;

/** Whether a deck's store (its JSON as text) is small enough for the demo. */
export function demoDeckStoreOk(store: string): boolean {
  return new TextEncoder().encode(store).length <= DEMO_DECK_STORE_MAX_BYTES;
}

/** What the saves of decks may write in a reset window (spec 0051, ticket 10): a deck saves itself after each change, so the bytes
 * of every save above `thresholdBytes` are counted (in KB) per network address, per network and for the whole demo. */
export const DEMO_DECK_BYTES = { thresholdBytes: 8 * 1024, maxCountedBytes: 600 * 1024, perAddressKb: 20_000, perNetworkKb: 50_000, demoKb: 300_000 } as const;

/** Taking a Snapshot freezes a whole dashboard's numbers, so it is the demo's most expensive change (spec 0051, Limits:
 * Expensive work, ticket 10): one at a time in the whole demo (a lease of `lockSeconds`, so a crash cannot hold it), a few
 * for one visit and for one network address in a reset window (a visit's id is free to mint, so the address's share holds
 * against a script), and what one keeps is bounded in bytes of its sealed frozen part. */
export const DEMO_SNAPSHOT_LIMITS = {
  perVisitPerWindow: 3,
  perAddressPerWindow: 6,
  perNetworkPerWindow: 12,
  lockSeconds: 90,
  frozenBytes: 1024 * 1024,
} as const;

/** What a visitor may enter as values and dates (spec 0051, Limits: Values; ticket 8): values for periods from this many months
 * back up to the current one, never ahead; at most this many values (and lines of text) in one paste; Away of at most this many
 * days, starting no earlier than today and ending within the days ahead; and "pretend it is another day" no further from today
 * than this many days. */
export const DEMO_VALUE_LIMITS = { monthsBack: 24, pasteRows: 100, pasteLines: 400, awayMaxDays: 30, awayAheadDays: 90, asOfDays: 90 } as const;
