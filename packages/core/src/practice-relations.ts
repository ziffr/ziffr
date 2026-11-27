// How the made-up numbers of one Pack belong together (spec 0063, "Made-up numbers"; GLOSSARY: Pack, Practice Workspace,
// Sample Data), so that none of them is impossible: a part is never more than its whole, and a sales forecast follows
// the sales forecast Pack: Closed this quarter grows through its quarter and starts again with the next, Closed is never
// above Commit nor Commit above Best case, the open deals of the Best case are all in the Pipeline value, a quota holds
// for a whole quarter, and some salespeople are above it and some below. Used to fill a Practice Workspace and to draw a
// Pack's Preview. Pure: the same input gives the same numbers, whatever the order Metrics are asked in, and what is
// there already is never answered again but bounds the rest. A number nobody is asked for reaches the period that ended
// last, one that is asked for stops before it, and the first is made so that what is then sent for that period fits.
// Only Ziffr's own Packs are described here, by Pack id and entry key: it decides made-up numbers and nothing else.
import { periodStart, shiftPeriod } from "./periods";
import { chance, madeUpPeriods, madeUpShares, madeUpTargets, madeUpValues, type MadeUpMetric } from "./practice-numbers";
import type { YearStart } from "./types";
import { workingPeriod } from "./workflow-rules";

/** A number that is a share, or a multiple, of another of its Pack: the other's entry key and the factor's bounds. */
type Share = readonly [of: string, low: number, high: number];

/** The numbers of each Pack that are a share of another, by Pack id and entry key. */
export const MADE_UP_SHARES: ReadonlyMap<string, Readonly<Record<string, Share>>> = new Map(Object.entries<Readonly<Record<string, Share>>>({
  "ziffr/agency": { "open-invoices": ["revenue", 0.2, 0.5], pipeline: ["revenue", 1, 3] },
  "ziffr/customer-support": { "tickets-closed": ["tickets-opened", 0.85, 1.05], "open-tickets": ["tickets-opened", 0.3, 0.7], "old-tickets": ["open-tickets", 0.05, 0.3] },
  "ziffr/finance": { cogs: ["revenue", 0.3, 0.5], "operating-costs": ["revenue", 0.3, 0.45], "open-invoices": ["revenue", 0.3, 0.6], "overdue-invoices": ["open-invoices", 0.05, 0.3] },
  "ziffr/fulfilment": { backlog: ["orders-shipped", 0.05, 0.3] },
  // An order of 55 to 110 in money, and 30 to 45 sessions for each order.
  "ziffr/online-shop": { orders: ["revenue", 1 / 110, 1 / 55], sessions: ["orders", 30, 45] },
  "ziffr/people": { hires: ["headcount", 0.01, 0.04], leavers: ["headcount", 0.005, 0.025], "open-roles": ["headcount", 0.02, 0.08] },
  "ziffr/saas-metrics": { "new-mrr": ["mrr", 0.03, 0.08], "expansion-mrr": ["mrr", 0.01, 0.04], "churned-mrr": ["mrr", 0.008, 0.025], customers: ["mrr", 1 / 250, 1 / 90] },
  "ziffr/sales": { "qualified-leads": ["new-leads", 0.3, 0.55], "deals-won": ["qualified-leads", 0.2, 0.35], "deals-lost": ["qualified-leads", 0.3, 0.5], "won-value": ["deals-won", 4000, 12000], "pipeline-value": ["won-value", 2, 4] },
  "ziffr/sports-club": { joiners: ["members", 0.01, 0.05], leavers: ["members", 0.005, 0.03], attendance: ["members", 0.15, 0.45] },
  "ziffr/workspace-usage": {
    "workspace-metrics-without-values": ["workspace-metrics", 0, 0.15], "workspace-metrics-not-opened": ["workspace-metrics", 0.1, 0.35], "workspace-archive-suggestions": ["workspace-metrics", 0, 0.15],
    // The Sources of the values: together never more than all of them.
    "workspace-values-web": ["workspace-values", 0.3, 0.4], "workspace-values-email": ["workspace-values", 0.1, 0.15], "workspace-values-slack": ["workspace-values", 0.08, 0.12], "workspace-values-telegram": ["workspace-values", 0.02, 0.05], "workspace-values-api": ["workspace-values", 0.08, 0.12], "workspace-values-feed": ["workspace-values", 0.05, 0.1], "workspace-values-mcp": ["workspace-values", 0.01, 0.04],
  },
  "ziffr/ziffr-operations": {
    "workspaces-trial": ["workspaces", 0.05, 0.12], "workspaces-free": ["workspaces", 0.55, 0.65], "workspaces-paid": ["workspaces", 0.1, 0.2], "workspaces-active-7d": ["workspaces", 0.3, 0.7],
    people: ["workspaces", 1.5, 4], "people-active-7d": ["people", 0.3, 0.6], metrics: ["workspaces", 3, 12], "metrics-archived": ["metrics", 0.02, 0.1],
    "trials-kept": ["trials-started", 0.1, 0.4], "trials-closed": ["trials-started", 0.3, 0.55],
  },
}));

/** Where a unit and a format say too little for a believable level, by Pack id and entry key. */
export const MADE_UP_LEVELS: ReadonlyMap<string, Readonly<Record<string, readonly [number, number]>>> = new Map(Object.entries<Readonly<Record<string, readonly [number, number]>>>({
  "ziffr/agency": { "hourly-rate": [70, 140] },
  "ziffr/people": { engagement: [60, 80] },
  "ziffr/saas-metrics": { cac: [300, 1500] },
}));

const FORECAST_PACK = "ziffr/sales-forecast";
/** The numbers of one salesperson in a sales forecast, by the Pack's entry keys. */
const FORECAST_KEYS = ["commit", "best-case", "closed-quarter", "pipeline"] as const;
type ForecastKey = (typeof FORECAST_KEYS)[number];
const isForecastKey = (key: string | null): key is ForecastKey => (FORECAST_KEYS as readonly (string | null)[]).includes(key);
/** Whether a member is one of a salesperson's four weekly numbers. */
const inForecast = (set: MadeUpSet, m: MadeUpMember): m is MadeUpMember & { key: ForecastKey } => set.pack === FORECAST_PACK && isForecastKey(m.key) && m.metric.period === "week";

/** One Metric among those of a Pack: its entry's key (null for none), the Repeat's line it was made for, whether it is
 * calculated, and what it holds already. The target of a forecast's Commit is the salesperson's quota. */
export type MadeUpMember = { key: string | null; line: string | number | null; metric: MadeUpMetric; computed: boolean; values: ReadonlyMap<string, number>; targets: ReadonlyMap<string, number> };
/** The Metrics of one Pack that belong together, in the order of their lines, with the Workspace's year start. `open` is
 * the first day of a period whose values are still to be sent by those who are asked: what is made up for it leaves
 * room for them. */
export type MadeUpSet = { pack: string | null; members: readonly MadeUpMember[]; yearStart: YearStart; open?: string };

/** Which entries' numbers a Metric's made-up numbers are worked out from, itself not among them: the others of its
 * salesperson, or what it is a share of, and what that is a share of. */
export function madeUpRelatives(pack: string | null, key: string | null): string[] {
  if (pack === FORECAST_PACK && isForecastKey(key)) return FORECAST_KEYS.filter((k) => k !== key);
  const shares = MADE_UP_SHARES.get(pack ?? "");
  const out: string[] = [];
  for (let at = key === null ? undefined : shares?.[key]; at && !out.includes(at[0]); at = shares?.[at[0]]) out.push(at[0]);
  return out;
}

/** The level range a Pack's entry is made up from, where one is said. */
export const madeUpLevel = (pack: string | null, key: string | null) => (key === null ? undefined : MADE_UP_LEVELS.get(pack ?? "")?.[key]);

/** The Metric of an entry in the same line, else the one made once for all lines. */
const memberOf = (set: MadeUpSet, key: string, line: MadeUpMember["line"]) => set.members.find((x) => x.key === key && x.line === line) ?? set.members.find((x) => x.key === key && x.line === null);

/** The share a member is of another of its set, if the Pack says so and that other one is there. */
function shareOf(set: MadeUpSet, m: MadeUpMember) {
  const share = m.key === null ? undefined : MADE_UP_SHARES.get(set.pack ?? "")?.[m.key];
  const whole = share && memberOf(set, share[0], m.line);
  return share && whole ? { whole, bounds: [share[1], share[2]] as const } : null;
}

/** Values for those of the periods that a member has none: as its Pack's numbers belong together, else on its own.
 * `periods` are first days, oldest first. A calculated Metric takes none. */
export function madeUpOf(set: MadeUpSet, m: MadeUpMember, periods: string[]): Map<string, number> {
  if (m.computed || !periods.length) return new Map();
  if (inForecast(set, m)) {
    const made = forecastOf(set, m.line, periods)[m.key];
    return new Map(periods.filter((p) => !m.values.has(p)).map((p) => [p, made.get(p)!]));
  }
  const share = shareOf(set, m);
  if (!share) return madeUpValues(m.metric, periods, m.values);
  const at = (p: string) => periodStart(p, share.whole.metric.period, set.yearStart);
  const wholePeriods = [...new Set(periods.map(at))];
  const whole = madeUpOf(set, share.whole, wholePeriods);
  return madeUpShares(m.metric, periods, m.values, (p) => share.whole.values.get(at(p)) ?? whole.get(at(p)), share.bounds);
}

/** The values a fill writes for one member as of a day, those for periods it has none for. Where nobody is asked for it
 * (figures a system would send), up to the period that ended last, so they are not a period behind what is asked. Where
 * someone is asked, only up to the one before, so the request for the last ended period finds it empty. Never the
 * running period. */
export function madeUpUntil(set: MadeUpSet, m: MadeUpMember, today: string, asked: boolean): Map<string, number> {
  const ended = workingPeriod(today, m.metric.period, set.yearStart);
  // Worked out over the same periods whoever is asked, so a part and its whole are made from the same numbers.
  const made = madeUpOf({ ...set, open: ended }, m, [...madeUpPeriods(m.metric.period, today, set.yearStart), ended]);
  if (asked) made.delete(ended);
  return made;
}

/** Targets for periods without one. A forecast's Commit gets its quota in every such period; nothing else of a
 * salesperson has a target. Any other Metric gets a Target Series only where it has none at all, is not calculated and
 * asks for a direction. `values` are the member's own, made up ones included. */
export function madeUpTargetsOf(set: MadeUpSet, m: MadeUpMember, periods: string[], values: ReadonlyMap<string, number>): Map<string, number> {
  if (inForecast(set, m)) {
    if (m.key !== "commit") return new Map();
    const quota = quotaOf(set, m.line, m.targets);
    return new Map(periods.filter((p) => !m.targets.has(p)).map((p) => [p, quota(p)]));
  }
  // A calculated Metric keeps its Target Range, and a Metric with targets of its own keeps just those.
  if (m.computed || m.targets.size || m.metric.polarity === "target") return new Map();
  return madeUpTargets(m.metric, periods, values, shareOf(set, m)?.whole.metric);
}

const hundreds = (v: number) => Math.round(v / 100) * 100;
/** In the week still to be sent: what share of the quota Closed comes to at most (never less than the week before), and
 * how large a Best case, in quotas, the Pipeline has room for. */
const OPEN_WEEK = { closed: 0.7, bestCase: 1.25 };
/** A quarter's place in time, one step for each quarter. */
const quarterNumber = (quarter: string) => Number(quarter.slice(0, 4)) * 4 + Math.floor((Number(quarter.slice(5, 7)) - 1) / 3);

/** The lines of a set that are salespeople, in the order of its members, and one line's place among them. */
function placeOf(set: MadeUpSet, line: MadeUpMember["line"]) {
  return [...new Set(set.members.filter((x) => isForecastKey(x.key)).map((x) => x.line))].indexOf(line);
}

/** What stays the same for one salesperson of one set: the words its numbers are drawn from. */
const seedOf = (set: MadeUpSet, line: MadeUpMember["line"]) => set.members.find((x) => x.line === line && x.key === "commit")?.metric.seed ?? `line ${line}`;

/** A salesperson's quota for the quarter that holds a week: a target there already wins for its week and gives the
 * quarter's other weeks theirs; a quarter without one follows the nearest quarter that has one; with none anywhere it
 * is made up. */
function quotaOf(set: MadeUpSet, line: MadeUpMember["line"], targets: MadeUpMember["targets"]): (week: string) => number {
  const quarter = (week: string) => periodStart(week, "quarter", set.yearStart);
  const said = new Map<number, number>();
  for (const [week, value] of [...targets].sort((a, b) => a[0].localeCompare(b[0]))) said.set(quarterNumber(quarter(week)), value);
  const seed = seedOf(set, line);
  return (week) => {
    const own = targets.get(week);
    if (own !== undefined) return own;
    const at = quarterNumber(quarter(week));
    const nearest = [...said.keys()].sort((a, b) => Math.abs(a - at) - Math.abs(b - at) || a - b)[0];
    // A quota grows a little from quarter to quarter.
    if (nearest !== undefined) return nearest === at ? said.get(nearest)! : hundreds(said.get(nearest)! * 1.025 ** (at - nearest));
    return Math.round(((120_000 + chance(`${seed}:quota`) * 120_000) * 1.025 ** (at - 2026 * 4)) / 5000) * 5000;
  };
}

/** The weeks of a quarter, oldest first: those that start in it. */
function weeksOf(quarter: string, yearStart: YearStart): string[] {
  let week = periodStart(quarter, "week", yearStart);
  if (week < quarter) week = shiftPeriod(week, "week", 1);
  const out: string[] = [];
  for (; periodStart(week, "quarter", yearStart) === quarter; week = shiftPeriod(week, "week", 1)) out.push(week);
  return out;
}

/** The four numbers of one salesperson for some weeks, those that are there already included as they are. */
function forecastOf(set: MadeUpSet, line: MadeUpMember["line"], periods: string[]): Record<ForecastKey, Map<string, number>> {
  const member = (key: ForecastKey) => set.members.find((x) => x.key === key && x.line === line);
  const known = (key: ForecastKey) => member(key)?.values ?? new Map<string, number>();
  const seed = seedOf(set, line);
  // Every second salesperson ends their quarters above quota, the others below it.
  const above = placeOf(set, line) % 2 === 0;
  const quota = quotaOf(set, line, member("commit")?.targets ?? new Map());
  const out = Object.fromEntries(FORECAST_KEYS.map((k) => [k, new Map<string, number>()])) as Record<ForecastKey, Map<string, number>>;
  const quarters = new Map<string, string[]>();
  for (const p of periods) {
    const q = periodStart(p, "quarter", set.yearStart);
    if (!quarters.has(q)) quarters.set(q, weeksOf(q, set.yearStart));
    const weeks = quarters.get(q)!;
    const week = weeks.indexOf(p);
    const due = quota(p);
    // Where the quarter ends against its quota: 103 to 115 % for those above, 82 to 94 % for those below.
    const attained = (above ? 1.09 : 0.88) + (chance(`${seed}:attain`) - 0.5) * 0.06 + (quarterNumber(q) % 2 === 0 ? 0.03 : -0.03);
    const end = due * attained;
    // Deals are won in lumps, more of them toward the end of the quarter.
    const weights = weeks.map((w, i) => 0.5 + chance(`${seed}:${w}:won`) + i / weeks.length);
    const total = weights.reduce((a, b) => a + b, 0);
    const wonBy = (i: number) => end * 0.85 * (weights.slice(0, i + 1).reduce((a, b) => a + b, 0) / total);
    const open = 1 - (week + 1) / weeks.length;
    // The calls for the week still to be sent are not known: Closed holds back, so that they are likely to be above it.
    const toBeSent = p === set.open;
    const won = toBeSent ? Math.min(wonBy(week), Math.max(OPEN_WEEK.closed * due, wonBy(week - 1))) : wonBy(week);
    // Closed never falls within a quarter, also between values that are there already: not below an earlier one, not
    // above a later one, nor above a call of this week or a later one.
    const inQuarter = (key: ForecastKey) => [...known(key)].filter(([w]) => periodStart(w, "quarter", set.yearStart) === q);
    const least = Math.max(0, ...inQuarter("closed-quarter").filter(([w]) => w < p).map(([, v]) => v));
    const most = Math.min(Infinity, ...inQuarter("closed-quarter").filter(([w]) => w > p).map(([, v]) => v), ...[...inQuarter("commit"), ...inQuarter("best-case")].filter(([w]) => w >= p).map(([, v]) => v));
    const closed = known("closed-quarter").get(p) ?? Math.max(least, Math.min(most, hundreds(won)));
    const call = hundreds(end * (1 + (chance(`${seed}:${p}:call`) - 0.5) * 0.05 * open));
    const commit = known("commit").get(p) ?? Math.max(closed, Math.min(known("best-case").get(p) ?? Infinity, call));
    const upside = due * (0.04 + 0.14 * open) * (0.7 + chance(`${seed}:${p}:upside`) * 0.6);
    const best = known("best-case").get(p) ?? Math.max(commit, closed, hundreds(commit + upside));
    const cover = 1.9 + chance(`${seed}:${q}:cover`) * 0.8 + (chance(`${seed}:${p}:cover`) - 0.5) * 0.3;
    // Every open deal of the best case is in the pipeline, and so is what else may close.
    const deals = (best - closed) * (1.15 + chance(`${seed}:${p}:deals`) * 0.3);
    const room = toBeSent ? OPEN_WEEK.bestCase * due - closed : 0;
    const pipeline = known("pipeline").get(p) ?? Math.max(hundreds(Math.max(deals, (due - closed) * cover, room)), best - closed);
    out["closed-quarter"].set(p, closed);
    out.commit.set(p, commit);
    out["best-case"].set(p, best);
    out.pipeline.set(p, pipeline);
  }
  return out;
}
