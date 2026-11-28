// GLOSSARY: Sample Data, Preview, Pack. The Sample Data a Pack's Preview draws its Dashboard Templates with: made-up
// numbers under the Pack's own Metric names, units and targets, a Repeat's Metrics for a few made-up lines, Totals and
// formulas worked out from them, and the numbers belonging together as in a filled Practice Workspace
// (practice-relations.ts). A Pack for private use gets no made-up targets: it asks for none, and "104 % of target" would
// say it does. Pure, from the Pack's entries alone and a fixed date: nothing of a Workspace is in it.
import { PRIVATE_SETS } from "./first-steps-screens";
import { evaluate, formulaInputs, targetReader } from "./formula";
import { JANUARY } from "./periods";
import { madeUpLevel, madeUpOf, madeUpTargetsOf, type MadeUpMember, type MadeUpSet } from "./practice-relations";
import { SAMPLE_OWNER, sampleFills, samplePeriods, type SampleData } from "./sample-data";
import type { Metric, Period, Point, Slot } from "./types";

/** What a Preview's Sample Data reads of one Metric Catalog entry of a Pack. `repeat` is the name of the Repeat it is
 * made for each line of, or null. */
export type PackSampleEntry = Pick<Metric, "name" | "period" | "aggregation" | "unit" | "unit_position" | "format" | "decimals" | "polarity" | "target_min" | "target_max"> & {
  key: string; formula: string | null; total: { of: string; targets: "own" | "parts" } | null; repeat: string | null;
};

/** The lines a Repeat is drawn with. */
const LINES = ["A", "B", "C"];

type Made = { entry: PackSampleEntry; line: string | null; metric: Metric; member: MadeUpMember };

const points = (values: ReadonlyMap<string, number>): Point[] => [...values].map(([period, value]) => ({ period, value })).sort((a, b) => a.period.localeCompare(b.period));

/** The Metrics a Set up of these entries would make, still without numbers. */
function emptyMetrics(pack: string, entries: PackSampleEntry[]): Made[] {
  const made = (entry: PackSampleEntry, line: string | null, id: number): Made => {
    const name = line === null ? entry.name : `${entry.name}, ${entry.repeat} ${line}`;
    const metric: Metric = {
      id, slug: `sample-pack-${id * -1}`, name, owner_id: SAMPLE_OWNER, description: "Sample data", formula: null, from_catalog_id: null, created_at: "2025-01-01T00:00:00Z",
      period: entry.period, aggregation: entry.aggregation, unit: entry.unit, unit_position: entry.unit_position, format: entry.format, decimals: entry.decimals, polarity: entry.polarity,
      target_min: entry.target_min, target_max: entry.target_max, attainment_method: null, submission_rule: "overwrite", sources: [],
    };
    const numbers = { seed: name, period: entry.period, polarity: entry.polarity, unit: entry.unit, format: entry.format, decimals: entry.decimals, targetMin: entry.target_min, targetMax: entry.target_max, level: madeUpLevel(pack, entry.key) };
    return { entry, line, metric, member: { key: entry.key, line, metric: numbers, computed: Boolean(entry.formula || entry.total), values: new Map(), targets: new Map() } };
  };
  const wanted = [
    ...LINES.flatMap((line) => entries.filter((e) => e.repeat !== null).map((e) => [e, line] as const)),
    ...entries.filter((e) => e.repeat === null).map((e) => [e, null] as const),
  ];
  // Ids far from those of the other Sample Metrics, which are small negative numbers too.
  return wanted.map(([entry, line], i) => made(entry, line, -(1000 + i)));
}

/** Values of the Metrics that take values and, except in a Pack for private use, their targets. */
function takeValues(set: MadeUpSet, all: Made[]) {
  const aimed = !PRIVATE_SETS.some((s) => s.pack === set.pack);
  for (const m of all.filter((x) => !x.member.computed)) {
    const periods = samplePeriods(m.entry.period);
    const values = madeUpOf(set, m.member, periods);
    m.member = { ...m.member, values, targets: aimed ? madeUpTargetsOf(set, m.member, periods, values) : m.member.targets };
  }
}

/** A Total's values and, where it adds its parts' targets up, its targets: only for periods every part has one. */
function addUp(m: Made, all: Made[]) {
  const parts = all.filter((x) => x.entry.key === m.entry.total!.of);
  const sum = (of: (x: Made) => ReadonlyMap<string, number>) => new Map(samplePeriods(m.entry.period).flatMap((p): [string, number][] => (parts.length && parts.every((x) => of(x).has(p)) ? [[p, parts.reduce((n, x) => n + of(x).get(p)!, 0)]] : [])));
  m.member = { ...m.member, values: sum((x) => x.member.values), targets: m.entry.total!.targets === "parts" ? sum((x) => x.member.targets) : new Map() };
}

/** A formula's values, each period from its inputs of the same line, else those made once. */
function workOut(m: Made, all: Made[]) {
  const formula = m.entry.formula!;
  const inputs = formulaInputs(formula).map((key) => [key, all.find((x) => x.entry.key === key && x.line === m.line) ?? all.find((x) => x.entry.key === key && x.line === null)] as const);
  const readers = inputs.map(([key, x]) => [key, x && targetReader(x.metric, points(x.member.targets))] as const);
  const periods = samplePeriods(m.entry.period);
  const at = (period: string | undefined) => Object.fromEntries(inputs.flatMap(([key, x]) => { const v = period === undefined ? undefined : x?.member.values.get(period); return v === undefined ? [] : [[key, v]]; }));
  const values = periods.flatMap((p, i): [string, number][] => {
    const targets = Object.fromEntries(readers.flatMap(([key, read]) => { const t = read?.(p); return t === undefined ? [] : [[key, t]]; }));
    const value = evaluate(formula, at(p), at(periods[i - 1]), targets);
    return value === null ? [] : [[p, value]];
  });
  m.member = { ...m.member, values: new Map(values) };
}

/** Works out the Totals and formulas, each once what it reads is there. */
function calculate(all: Made[]) {
  const done = new Set(all.filter((x) => !x.member.computed).map((x) => x.entry.key));
  const entries = new Set(all.map((x) => x.entry.key));
  for (let again = true; again; ) {
    again = false;
    for (const m of all) {
      if (done.has(m.entry.key)) continue;
      const reads = m.entry.total ? [m.entry.total.of] : formulaInputs(m.entry.formula!);
      if (reads.some((k) => entries.has(k) && !done.has(k))) continue;
      for (const x of all.filter((y) => y.entry.key === m.entry.key)) (x.entry.total ? addUp : workOut)(x, all);
      done.add(m.entry.key);
      again = true;
    }
  }
}

/** A Pack's Sample Data: its Metrics with their series and targets, and how a template's Slots are filled with them. A
 * Slot that suggests no entry of the Pack gets one of the other Sample Metrics. */
export function packSample(pack: string, entries: PackSampleEntry[]): { data: Pick<SampleData, "metrics" | "series" | "targets">; fills: (slots: Pick<Slot, "multiple" | "suggests">[], period?: Period) => number[][] } {
  const all = emptyMetrics(pack, entries);
  // The members are read through the list, so what one Metric was given is seen by those that follow from it.
  const set: MadeUpSet = { pack, yearStart: JANUARY, get members() { return all.map((x) => x.member); } };
  takeValues(set, all);
  calculate(all);
  const data = {
    metrics: all.map((x) => x.metric),
    series: Object.fromEntries(all.map((x) => [x.metric.slug, points(x.member.values)])),
    targets: Object.fromEntries(all.filter((x) => x.member.targets.size).map((x) => [x.metric.id, points(x.member.targets)])),
  };
  const fills = (slots: Pick<Slot, "multiple" | "suggests">[], period?: Period) => {
    const others = sampleFills(slots, period);
    return slots.map((s, i) => {
      const ids = all.filter((x) => x.entry.key === s.suggests).map((x) => x.metric.id);
      if (!ids.length) return others[i]!;
      return s.multiple ? ids : ids.slice(0, 1);
    });
  };
  return { data, fills };
}
