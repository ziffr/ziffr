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
  // Ticket 11 (Metrics, Threads and sharing): the spec gives no numbers for these either; starting points for the owner.
  derived_metrics: 5,
  series_rows: 500,
  thread_messages: 1500,
  shares: 300,
  group_members: 200,
  access_requests: 100,
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

/** What the saves of decks may write in a reset window (spec 0051, ticket 10; lowered after the final review): a deck saves itself after
 * each change, so the bytes of every save above `thresholdBytes` are counted (in KB) per network address (5 MB), per network (10 MB)
 * and for the whole demo (40 MB). A deck is rewritten whole (TOAST), so 300 MB a window would have been about 29 GB a day of
 * write-ahead log on the shared box. */
export const DEMO_DECK_BYTES = { thresholdBytes: 8 * 1024, maxCountedBytes: 600 * 1024, perAddressKb: 5_000, perNetworkKb: 10_000, demoKb: 40_000 } as const;

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

/** What a visitor may make of a Metric, a Target Series, a Question or a Share (spec 0051, ticket 11): a Derived Metric's formula is
 * code-like and is recomputed on every value change of every input, so it is held to a short one over few inputs (its grammar already
 * allows no Derived input, so it never nests); a Target Series or Projection call of at most this many rows within this many months of
 * today; the largest number a visitor types as a target or a value of a series; the furthest a Task's due date may be. */
export const DEMO_METRIC_LIMITS = { formulaChars: 200, formulaInputs: 5, formulaOperations: 20, seriesRowsPerCall: 60, seriesMonths: 24, numberMax: 1e12, dueDays: 366 } as const;

/** What one network address and one network (an IPv4 /24 or IPv6 /48) may CREATE of a capped kind in a reset window, by the kind's
 * cap (spec 0051, final review D2): a quarter of it for an address and half for a network (at least 1), so no script from one place
 * can fill a kind for every visitor. Counted by `chargeCreation` (demo-creation.ts) under the same keyed hashes as the values' share. */
export function demoCreationShare(cap: number): { address: number; network: number } {
  return { address: Math.max(1, Math.floor(cap / 4)), network: Math.max(1, Math.floor(cap / 2)) };
}

/** The kinds of `DEMO_ROW_CAPS` that have no creation share of this kind, and why: values, Snapshots and runs have shares of their
 * own (demo-budget.ts, demo-shares.ts), Workflows are never made by a visitor, and a dashboard's widgets are capped per dashboard
 * (one dashboard full locks nobody else out). */
export const DEMO_CREATION_EXEMPT: readonly string[] = ["values", "snapshots", "workflows", "workflow_run", "widgets_per_dashboard", "tags", "series_rows"];
// tags and series_rows: the core counts the NEW Tags and the NEW rows of a Target Series itself (`chargeNewRows`, demo-creation.ts), so a
// word that exists or a period already set never uses up the share, and every way of making a Tag (a Metric from a catalog entry too) is counted.

/** Creations that are counted under a purpose of their own instead of the kind's: a Version the visitor names has its own share, so
 * the automatic ones (which share the kind's cap) cannot use up the visitor's right to name one. */
export const DEMO_CREATE_PURPOSE: Readonly<Record<string, string>> = { "version-actions:saveNamedVersion": "named-versions" };

/** Which capped kind each server action that makes rows of it counts against (spec 0051, final review D2): the single table the
 * visitor's wrapper reads. Keys are the actions' keys in demo-changes.ts; a test fails for a `limited` action that is in neither
 * this table nor `DEMO_CREATION_EXEMPT`'s kinds, so a new opening cannot forget its share. */
export const DEMO_CREATES: Readonly<Record<string, keyof typeof DEMO_ROW_CAPS>> = {
  "canvas-actions:createDashboardNamed": "dashboards",
  "dashboard-template-actions:createFromDashboardTemplate": "dashboards",
  "home-actions:newDashboard": "dashboards",
  "canvas-actions:saveToPool": "saved_widgets",
  "convert-actions:addSnapshotToDeck": "decks",
  "convert-actions:addToDeck": "decks",
  "convert-actions:makeDeck": "decks",
  "convert-actions:makeDeckFromSnapshot": "decks",
  "deck-actions:createDeck": "decks",
  "deck-workflow-template-actions:createDeckFromTemplate": "decks",
  "dashboard-template-actions:saveAsDashboardTemplate": "templates",
  "deck-workflow-template-actions:saveAsDeckTemplate": "templates",
  "template-actions:saveSlideLayout": "templates",
  "template-actions:saveTemplate": "templates",
  "theme-actions:addStandardTheme": "themes",
  "theme-actions:duplicateTheme": "themes",
  "version-actions:saveNamedVersion": "versions",
  "workflow-actions:proposeValueCorrection": "thread_messages",
  "connector-actions:recordSimulatedReply": "thread_messages",
  "access-actions:decideAccess": "shares",
  "access-actions:requestAccess": "access_requests",
  "actions:createAction": "open_actions",
  "canvas-actions:assignInPlace": "open_actions",
  "actions:createMetric": "metrics",
  "actions:createDerivedMetric": "derived_metrics",
  "actions:replyToAction": "thread_messages",
  "canvas-actions:markTaskDone": "thread_messages",
  "canvas-actions:setShare": "shares",
  "canvas-actions:setGroupShare": "shares",
  "team-actions:createGroup": "groups",
  "team-actions:setMember": "group_members",
};
