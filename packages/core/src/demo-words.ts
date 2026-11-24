// What a refused change in the demo says (GLOSSARY: Demo Mode; spec 0029, #271), and the fixed codes that carry it to
// a browser. Pure, so the web app's error screen can say the sentence for a plain form whose refusal reaches it only
// as an error's digest: the browser maps a code it knows to these words, never text from the server.

/** The sentence, where this Installation offers no trials. */
export const DEMO_READ_ONLY = "The demo can't be changed.";

/** The sentence, where it offers Trial Workspaces. */
export const DEMO_READ_ONLY_TRIAL = "The demo can't be changed. Start a trial to try it with your own numbers.";

/** What a visit's change says when the demo started fresh since its page was drawn (spec 0051). */
export const DEMO_STALE = "The demo was reset; reload.";

/** The digest a demo refusal carries to the error screen, by whether trials are offered, and for a stale page. */
export const DEMO_DIGEST = { plain: "ziffr-demo-read-only", trial: "ziffr-demo-read-only-trial", stale: "ziffr-demo-stale" } as const;

// What the demo's limits say (spec 0051, ticket 5): plain words, never a number or a column, always when it works again.

/** A visit that changed too much in a minute. */
export const DEMO_GOING_FAST = "You are going fast. Try again in a minute.";

/** A visit or a network address that used up its changes until the demo starts fresh. */
export const DEMO_BUDGET_USED = "You have made a lot of changes. Try again when the demo starts fresh.";

/** The whole demo's changes are used up for this window, or a visit cannot be counted. */
export const DEMO_BUSY = "The demo is busy. Try again in a few minutes.";

/** What a row-cap refusal (code ZF4D2) says for a kind of row, by the name people use for it. */
const LIMIT_NOUNS: Record<string, string> = {
  dashboards: "dashboards",
  widgets_per_dashboard: "widgets on a dashboard",
  saved_widgets: "saved widgets",
  decks: "decks",
  snapshots: "Snapshots",
  metrics: "Metrics",
  templates: "templates",
  workflows: "Workflows",
  groups: "Groups",
  tags: "Tags",
  open_actions: "open Questions and Tasks",
  values: "values",
  themes: "Themes",
  versions: "Versions",
  derived_metrics: "calculated Metrics",
  series_rows: "targets and projections",
  thread_messages: "replies",
  shares: "shares",
  group_members: "Group members",
  access_requests: "requests for access",
};

/** The sentence for a row cap that was reached; an unknown kind gets the general one. */
export function demoLimitWords(kind: string): string {
  if (kind === "starting") return "The demo is starting fresh. Try again in a moment.";
  const noun = LIMIT_NOUNS[kind];
  return noun ? `The demo is full of ${noun} for now. Try again when it starts fresh.` : "The demo is full for now. Try again when it starts fresh.";
}

/** The kinds `demoLimitWords` knows, so a test can see that every kind the database limits has words. */
export function demoLimitKinds(): string[] {
  return Object.keys(LIMIT_NOUNS);
}

/** What a text refused by the text rules says, by why. */
export const DEMO_TEXT_WORDS = {
  empty: "Write something first.",
  long: "That is too long for the demo.",
  characters: "Use plain text only: no control characters.",
  markup: "Use plain words: no tags.",
  link: "Leave out web addresses in the demo.",
} as const;

/** What a refused value, paste, Away or run says in the demo (spec 0051, ticket 8): plain words, never a column or a number of the database. */
export const DEMO_VALUE_WORDS = {
  period: "The demo takes values for the last two years, up to the current period.",
  paste: "Paste at most 100 values at a time in the demo.",
  pasteLong: "That paste is too long for the demo.",
  away: "In the demo, Away starts today or later, lasts at most 30 days and ends within 90 days.",
  asOf: "In the demo, pick a day within 90 days of today.",
  run: "Another visitor just ran the Workflows. Try again in a minute.",
} as const;

/** What a refused Metric, formula, target, Question or Share says in the demo (spec 0051, ticket 11): plain words, never a column or a number of the database. */
export const DEMO_METRIC_WORDS = {
  formula: "In the demo a formula has at most 200 characters, 5 Metrics and 20 operations.",
  rows: "In the demo, save at most 60 targets at a time, for the last two years and the next two.",
  number: "That number is too large for the demo.",
  due: "In the demo, a Task is due within a year.",
  people: "In the demo, only its made-up people can be asked, or take part.",
  workflow: "In the demo a Metric is not added to a Workflow.",
  team: "In the demo, only a Group made by a visitor changes who is in it.",
  everyone: "In the demo, one person sets only their own way of being asked.",
  hidden: "In the demo, that would show someone a Metric they do not see yet. Share the Metric with them first.",
} as const;

/** The sentence for a digest, or null for any other error. */
export function demoWordsForDigest(digest: string | undefined): string | null {
  return digest === DEMO_DIGEST.trial ? DEMO_READ_ONLY_TRIAL : digest === DEMO_DIGEST.plain ? DEMO_READ_ONLY : digest === DEMO_DIGEST.stale ? DEMO_STALE : protectedWordsForDigest(digest);
}

// What the demo says for a change to its own words or its showcase (spec 0051, ticket 6): where visitors may change the
// demo they may change what the seed made, but not its words and not the few objects the landing page and the tour
// point at. The sentence names no kind of object, so it is true of every one.

/** What a visitor reads for a showcase object. */
export const DEMO_SHOWCASE = "Everyone sees this one as it is. Make your own to change it.";

/** What a visitor reads for the words of something the seed made. */
export const DEMO_SEEDED_WORDS = "Everyone sees this one's words as they are. Make your own to name it.";

/** The digests these two refusals carry to the error screen. */
export const DEMO_PROTECTED_DIGEST = { showcase: "ziffr-demo-showcase", words: "ziffr-demo-words" } as const;

/** The sentence for a digest of the showcase or seeded-words refusals, or null for any other. */
export function protectedWordsForDigest(digest: string | undefined): string | null {
  return digest === DEMO_PROTECTED_DIGEST.showcase ? DEMO_SHOWCASE : digest === DEMO_PROTECTED_DIGEST.words ? DEMO_SEEDED_WORDS : null;
}
