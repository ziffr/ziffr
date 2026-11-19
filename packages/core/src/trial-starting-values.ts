// The made-up values a Trial Workspace starts with (spec 0021, GLOSSARY: Trial Workspace). Not Sample Data, which
// is never a workspace's: these become the trial's own values. Pure and seeded, so a test can work out every
// to-date total by hand. A summed Metric has values for the periods that are over, as real ones arrive (a month's
// revenue once the month is over): the unfinished month then holds the finished days and the unfinished quarter the
// finished months, so "to date" figures and their comparisons come out right, and nothing reads as a sudden drop. An
// average or a last value has one for the current period too (this month's headcount so far).
import { periodStart, shiftPeriod, type YearStart } from "./periods";
import type { Period } from "./types";

/** One starting Metric: what it is, how many periods back it goes, and how its values move. */
export type StartingMetric = {
  slug: string;
  name: string;
  description: string;
  period: Period;
  aggregation: "sum" | "average" | "last" | "none";
  submissionRule: "overwrite" | "add";
  format: "number" | "currency" | "percent";
  unit: string;
  decimals: number;
  polarity: "higher" | "lower";
  targetMin?: number;
  targetMax?: number;
  /** How many periods before the current one have values. */
  history: number;
  /** The value of the oldest period, its growth per period, its noise (a share), and a yearly swing (a share). */
  start: number;
  growth: number;
  noise: number;
  season?: number;
  /** The current period is left without a value, so there is something to answer with Ask me now. */
  openNow?: boolean;
  /** Periods back from the current one that have no value, to show how a missing one looks. */
  gaps?: number[];
  /** A Breakdown's labels with their usual shares. */
  breakdown?: { label: string; share: number }[];
  /** A Target Series: this factor times the trend, per period. */
  targetFactor?: number;
  /** A Derived Metric's formula over other starting Metrics' slugs; it has no values of its own. */
  formula?: string;
};

/** Every period (day to year) and every aggregation (sum, average, last, none), plus a Breakdown, a Target Series,
 * target ranges, a gap, open current periods and a Derived Metric: what a trial's dashboard needs to show. */
export const STARTING_METRICS: StartingMetric[] = [
  { slug: "sign-ups", name: "Sign-ups", description: "New accounts per day. Each sign-up adds one.", period: "day", aggregation: "sum", submissionRule: "add", format: "number", unit: "", decimals: 0, polarity: "higher", history: 430, start: 38, growth: 0.004, noise: 0.25, season: 0.1 },
  { slug: "support-tickets", name: "Support tickets", description: "Tickets opened per day.", period: "day", aggregation: "sum", submissionRule: "overwrite", format: "number", unit: "", decimals: 0, polarity: "lower", history: 430, start: 24, growth: -0.001, noise: 0.3 },
  { slug: "nps", name: "Net Promoter Score", description: "This week's survey answers, from -100 to 100.", period: "week", aggregation: "average", submissionRule: "overwrite", format: "number", unit: "", decimals: 0, polarity: "higher", targetMin: 30, history: 52, start: 28, growth: 0.006, noise: 0.15, openNow: true },
  { slug: "delivery-time", name: "Delivery time", description: "Average days from order to delivery this week.", period: "week", aggregation: "average", submissionRule: "overwrite", format: "number", unit: "days", decimals: 1, polarity: "lower", targetMax: 3, history: 52, start: 3.6, growth: -0.004, noise: 0.08, gaps: [5] },
  { slug: "revenue", name: "Revenue", description: "Invoiced revenue per month, by country.", period: "month", aggregation: "sum", submissionRule: "overwrite", format: "currency", unit: "€", decimals: 0, polarity: "higher", history: 18, start: 84000, growth: 0.02, noise: 0.05, season: 0.12, targetFactor: 1.03,
    breakdown: [{ label: "Germany", share: 0.38 }, { label: "France", share: 0.22 }, { label: "Netherlands", share: 0.16 }, { label: "Austria", share: 0.14 }, { label: "Switzerland", share: 0.1 }] },
  { slug: "orders", name: "Orders", description: "Orders placed per month.", period: "month", aggregation: "sum", submissionRule: "overwrite", format: "number", unit: "", decimals: 0, polarity: "higher", history: 18, start: 1200, growth: 0.018, noise: 0.04, season: 0.12, openNow: true },
  { slug: "average-order-value", name: "Average order value", description: "Revenue divided by orders.", period: "month", aggregation: "none", submissionRule: "overwrite", format: "currency", unit: "€", decimals: 2, polarity: "higher", history: 0, start: 0, growth: 0, noise: 0, formula: "{revenue} / {orders}" },
  { slug: "margin", name: "Gross margin", description: "Gross margin as a share of revenue.", period: "month", aggregation: "none", submissionRule: "overwrite", format: "percent", unit: "%", decimals: 1, polarity: "higher", targetMin: 32, targetMax: 40, history: 18, start: 33, growth: 0.003, noise: 0.03 },
  { slug: "headcount", name: "Headcount", description: "People employed at the end of the month.", period: "month", aggregation: "last", submissionRule: "overwrite", format: "number", unit: "", decimals: 0, polarity: "higher", history: 18, start: 21, growth: 0.012, noise: 0.01 },
  { slug: "cash-balance", name: "Cash balance", description: "Money in the bank at the end of the month.", period: "month", aggregation: "last", submissionRule: "overwrite", format: "currency", unit: "€", decimals: 0, polarity: "higher", targetMin: 150000, history: 18, start: 240000, growth: -0.01, noise: 0.06 },
  { slug: "return-rate", name: "Return rate", description: "Orders sent back, as a share of orders, per quarter.", period: "quarter", aggregation: "none", submissionRule: "overwrite", format: "percent", unit: "%", decimals: 1, polarity: "lower", targetMax: 5, history: 8, start: 6.2, growth: -0.03, noise: 0.05 },
  { slug: "new-customers", name: "New customers", description: "Customers whose first order fell in the quarter.", period: "quarter", aggregation: "sum", submissionRule: "overwrite", format: "number", unit: "", decimals: 0, polarity: "higher", history: 8, start: 520, growth: 0.04, noise: 0.06 },
  { slug: "emissions", name: "CO₂ emissions", description: "Tonnes of CO₂ from transport and offices per year.", period: "year", aggregation: "sum", submissionRule: "overwrite", format: "number", unit: "t", decimals: 0, polarity: "lower", history: 4, start: 410, growth: -0.06, noise: 0.03 },
];

/** The Test Metric (GLOSSARY: Test Metric): asked daily of the Owner, without history, answered by hand. The Trial
 * Guide asks for it, so the first value a new trial records is the Owner's own, not a made-up one. */
export const TEST_METRIC = {
  name: "Cups of coffee", description: "Cups of coffee you had today. Ziffr asks for it so you can see how asking works.",
  unit: "cups", format: "number", decimals: 0, period: "day", submissionRule: "overwrite", polarity: "higher", aggregation: "sum",
} as const;

/** One value to record: a past period is an Import, the current one an ordinary value. */
export type StartingValue = { slug: string; period: string; value: number; imported: boolean; breakdown?: { label: string; value: number }[] };

// mulberry32: a tiny seeded generator, the same numbers for the same seed.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The values of every starting Metric up to `today` (yyyy-mm-dd), oldest first per Metric. */
export function startingValues(today: string, yearStart: YearStart, seed: number, metrics: StartingMetric[] = STARTING_METRICS): StartingValue[] {
  const out: StartingValue[] = [];
  metrics.forEach((m, i) => {
    if (m.formula) return;
    const rand = seeded(seed * 97 + i + 1);
    const current = periodStart(today, m.period, yearStart);
    const perYear = { day: 365, week: 52, month: 12, quarter: 4, year: 1 }[m.period];
    for (let back = m.history; back >= 0; back--) {
      const period = shiftPeriod(current, m.period, -back);
      const k = m.history - back;
      const swing = m.season ? m.season * Math.sin((2 * Math.PI * k) / perYear) : 0;
      const noise = m.noise * (rand() - 0.5) * 2;
      // The current period: left open on purpose, or not over yet for a sum.
      if (back === 0 && (m.openNow || m.aggregation === "sum")) continue;
      if (m.gaps?.includes(back)) continue;
      const value = m.start * (1 + m.growth) ** k * (1 + swing) * (1 + noise);
      const round = (v: number) => Number(v.toFixed(m.decimals));
      const v: StartingValue = { slug: m.slug, period, value: Math.max(0, round(value)), imported: back > 0 };
      if (m.breakdown) {
        const raw = m.breakdown.map((b) => b.share * (0.9 + 0.2 * rand()));
        const sum = raw.reduce((a, b) => a + b, 0);
        v.breakdown = m.breakdown.map((b, j) => ({ label: b.label, value: round((v.value * raw[j]) / sum) }));
      }
      out.push(v);
    }
  });
  return out;
}

/** A Target Series for the Metrics that have one: the trend without noise, times their factor. */
export function startingTargets(today: string, yearStart: YearStart, metrics: StartingMetric[] = STARTING_METRICS): { slug: string; rows: { period: string; value: number }[] }[] {
  return metrics.filter((m) => m.targetFactor).map((m) => {
    const current = periodStart(today, m.period, yearStart);
    const rows = Array.from({ length: m.history + 4 }, (_, k) => ({
      period: shiftPeriod(current, m.period, k - m.history),
      value: Math.round(m.start * (1 + m.growth) ** k * m.targetFactor!),
    }));
    return { slug: m.slug, rows };
  });
}
