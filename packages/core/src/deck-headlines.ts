// Headline proposals for a Slide of a Deck (GLOSSARY: Slide, Slide Type, Takeaway, Number Style; spec 0069): up to three
// sentences saying what the slide's numbers say, best first, in the wording and Number Style of Takeaways, and a plain title
// where no rule applies. A rule never says what made a number so or what to do about it. Pure: no clock, no database.
//
// Rules held here: nothing missing is taken as 0; a change is only against the period just before; a period that is not
// over is said as "so far" and never compared with a full one; where "largest" cannot be told (a tie among too many, a row
// without a value, a remainder as large as a named part) nothing is claimed; a number that is not 0 never reads 0.
//
// Visibility: a headline is written from nothing but what it is handed. The caller hands in only the viewer's own cut of the
// data, and only the parts and rows that viewer sees.
import { writeNumber } from "@ziffr/figures";
import { targetFor, targetGap } from "./compare";
import { latestOfEach } from "./display-periods";
import { changePct, difference, exactTotal, percentOf } from "./exact";
import { formatChange } from "./format";
import { bridge, type Part } from "./methods/bridge";
import { periodEnd, periodLabel, shiftPeriod, type Span } from "./periods";
import { decimalsApart, decimalsFor, SHARE_UNIT, sizeText, signedText, valueText } from "./takeaways/sizes";
import { listOf, sayIn, type TakeawayContext } from "./takeaways/takeaway";
import type { CaseKey, Slots } from "./takeaways/wording";
import type { BreakdownRow, CanvasData, Metric, Point } from "./types";

/** The most characters a proposed headline has: two lines of a headline in either Deck Design, below the 140 a person's own may have. */
export const HEADLINE_BUDGET = 100;
/** The most proposals made for one slide. */
export const HEADLINE_PROPOSALS = 3;

// The shortest a long name is cut to inside a proposal, before the proposal is left out; and inside the plain title, which always has to fit.
const SHORTEST_NAME = 24;
const SHORTEST_PLAIN_NAME = 8;
// A streak is this many changes in the same direction, one period after the other.
const STREAK = 3;
// The most parts or rows one headline names when they are level with each other.
const MOST_TIED = 3;

/** The rule a proposal comes from; `plain` is the title where none applies. */
export type HeadlineRule = "target" | "change" | "streak" | "on-target" | "parts" | "share" | "gap" | "plain";
/** One proposed headline. */
export type Headline = { rule: HeadlineRule; text: string };

/** What headlines are written from. `today` (yyyy-mm-dd) decides whether a period is over. */
export type HeadlineData = Pick<CanvasData, "series" | "targets" | "numberStyle" | "yearStart"> & { today: string };

/** One line of a gap table: its label, its value and what it is held against; null where it has none. */
export type HeadlineGapRow = { label: string; actual: number | null; goal: number | null };

/** What a slide shows, which decides the rules tried first. `period` is the first day of the period the slide is about. */
export type HeadlineSubject =
  /** One Metric's own values. */
  | { show: "metric"; metric: Metric }
  /** Several Metrics, the first leading. */
  | { show: "metrics"; metrics: Metric[] }
  /** The change into `period` from the one before, with what each part had in both. */
  | { show: "change"; metric: Metric; period: string; parts: Part[] }
  /** The rows a Metric's value in `period` is made of. */
  | { show: "shares"; metric: Metric; period: string; rows: BreakdownRow[] }
  /** A Metric against another (`against`), or against targets (null), in `period`, with the rows of the gap table. */
  | { show: "gap"; metric: Metric; against: Metric | null; period: string; rows: HeadlineGapRow[] };

// A proposal before it is fitted: its sentence is written from names that may have to be cut.
type Draft = { rule: HeadlineRule; names: string[]; build: (names: string[]) => string };

type Writer = {
  data: HeadlineData;
  ctx: TakeawayContext;
  say: (key: CaseKey, slots?: Slots) => string;
};

function writerFor(data: HeadlineData): Writer {
  const ctx: TakeawayContext = { style: data.numberStyle, yearStart: data.yearStart };
  return { data, ctx, say: (key, slots = {}) => sayIn(key, slots, ctx) };
}

// A Metric's numbers up to `upTo`, each period once, oldest first.
function pointsOf(w: Writer, metric: Metric, upTo?: string): Point[] {
  return latestOfEach(w.data.series[metric.slug] ?? []).filter((p) => Number.isFinite(p.value) && (upTo === undefined || p.period <= upTo));
}
const valueAt = (w: Writer, metric: Metric, period: string) => pointsOf(w, metric).find((p) => p.period === period)?.value;
const running = (w: Writer, period: string, span: Span) => periodEnd(period, span) >= w.data.today;

// "in October 2026", "on Thu 6 Nov 2026", "so far in Q4 2026".
function when(w: Writer, period: string, span: Span): string {
  const date = periodLabel(period, span === "week" ? "day" : span, w.data.yearStart);
  const phrase = w.say(span === "day" ? "hl-when-day" : span === "week" ? "hl-when-week" : "hl-when", { date });
  return running(w, period, span) ? w.say("hl-so-far", { when: phrase }) : phrase;
}

const inPoints = (m: Metric) => m.format === "percent" || m.unit === "%";

// A value in the Metric's unit; null where it is too small to be written as anything but 0.
function valueOf(w: Writer, m: Metric, v: number): string | null {
  const decimals = decimalsFor([v], m.decimals, w.data.numberStyle);
  return decimals === null ? null : valueText(v, m, decimals, w.data.numberStyle);
}

// A difference between two values: in points for a percentage, with its sign where `signed`.
function differenceOf(w: Writer, m: Metric, v: number, signed = false): string | null {
  const style = w.data.numberStyle;
  const decimals = decimalsFor([v], m.decimals, style);
  if (decimals === null || !Number.isFinite(v)) return null;
  if (!inPoints(m)) return signed ? signedText(v, m, decimals, style) : sizeText(v, m, decimals, style);
  const n = writeNumber(signed ? v : Math.abs(v), decimals, style, signed ? { change: true } : {});
  return w.say(n.replace(/^[+−±]/, "") === "1" ? "hl-pt" : "hl-pts", { n });
}

// Where a Metric's value stands against its target for a period; null without one.
function standing(w: Writer, m: Metric, p: Point) {
  const target = targetFor(m, p.period, w.data.targets[m.id]);
  const gap = targetGap(m, p.value, target);
  if (gap === null) return null;
  const min = target.min === null ? null : Number(target.min);
  const max = target.max === null ? null : Number(target.max);
  const range = m.polarity === "target" && min !== null && max !== null && min !== max ? { min, max } : null;
  const bound = m.polarity === "higher" ? min : m.polarity === "lower" ? max : (min ?? max);
  const on = m.polarity === "higher" ? gap >= 0 : m.polarity === "lower" ? gap <= 0 : gap === 0;
  return { gap, bound: bound!, range, on };
}

function targetDraft(w: Writer, m: Metric, p: Point): Draft | null {
  const at = standing(w, m, p);
  if (!at) return null;
  const value = valueOf(w, m, p.value);
  if (value === null) return null;
  const phrase = when(w, p.period, m.period);
  const draft = (key: CaseKey, slots: Slots): Draft => ({ rule: "target", names: [m.name], build: ([name]) => w.say(key, { ...slots, name, value, when: phrase }) });
  if (running(w, p.period, m.period)) {
    // A period that is not over is not judged: what it holds so far stands beside the target.
    if (at.range) {
      const [min, max] = [valueOf(w, m, at.range.min), valueOf(w, m, at.range.max)];
      return min === null || max === null ? null : draft("hl-running-range", { min, max });
    }
    const target = valueOf(w, m, at.bound);
    return target === null ? null : draft("hl-running-target", { target });
  }
  if (at.gap === 0) {
    if (at.range) return draft("hl-range-on", {});
    const target = valueOf(w, m, at.bound);
    return target === null ? null : draft("hl-target-on", { target });
  }
  const gap = differenceOf(w, m, at.gap);
  if (gap === null) return null;
  const side = at.gap < 0 ? "below" : "above";
  return draft(`${at.range ? "hl-range" : "hl-target"}-${side}`, { gap });
}

// The change into the last of these points from the period just before; null where that period has no value.
function changeDraft(w: Writer, m: Metric, points: Point[]): Draft | null {
  const now = points.at(-1);
  const before = points.at(-2);
  if (!now || !before || before.period !== shiftPeriod(now.period, m.period, -1)) return null;
  const phrase = when(w, now.period, m.period);
  const draft = (key: CaseKey, slots: Slots): Draft => ({ rule: "change", names: [m.name], build: ([name]) => w.say(key, { ...slots, name, when: phrase }) });
  const value = valueOf(w, m, now.value);
  if (value === null) return null;
  if (now.value === before.value) return draft("hl-unchanged", { value });
  const way = now.value > before.value ? "hl-rose" : "hl-fell";
  const style = w.data.numberStyle;
  if (inPoints(m)) {
    const change = differenceOf(w, m, difference(now.value, before.value));
    return change === null ? null : draft(`${way}-by`, { change, value });
  }
  // A share of a number at or below zero reads as nothing a person can use, so both numbers are said instead.
  const pct = before.value > 0 && now.value >= 0 ? changePct(now.value, before.value) : null;
  if (pct !== null && decimalsFor([pct], 1, style) === 1) return draft(`${way}-by`, { change: formatChange(pct, style, { signed: false }), value });
  const decimals = decimalsApart([before.value, now.value], m.decimals, style);
  if (decimals === null) return null;
  return draft(`${way}-from`, { before: valueText(before.value, m, decimals, style), value: valueText(now.value, m, decimals, style) });
}

// Three or more changes the same way up to the last of these points, one period after the other.
function streakDraft(w: Writer, m: Metric, points: Point[]): Draft | null {
  let n = 0;
  let way = 0;
  for (let i = points.length - 1; i > 0; i--) {
    const [now, before] = [points[i], points[i - 1]];
    const step = Math.sign(now.value - before.value);
    if (before.period !== shiftPeriod(now.period, m.period, -1) || step === 0 || (way !== 0 && step !== way)) break;
    way = step;
    n++;
  }
  if (n < STREAK) return null;
  const now = points[points.length - 1];
  const value = valueOf(w, m, now.value);
  if (value === null) return null;
  const phrase = when(w, now.period, m.period);
  return { rule: "streak", names: [m.name], build: ([name]) => w.say(way > 0 ? "hl-rose-streak" : "hl-fell-streak", { name, n, span: m.period, value, when: phrase }) };
}

// What one Metric's own values say: against its target at the latest period, and the movement into the latest period that is over.
function ownDrafts(w: Writer, m: Metric, upTo?: string) {
  const points = pointsOf(w, m, upTo);
  const over = points.filter((p) => !running(w, p.period, m.period));
  const latest = points.at(-1);
  return { target: latest ? targetDraft(w, m, latest) : null, streak: streakDraft(w, m, over), change: changeDraft(w, m, over) };
}

// Of the drafts naming 1 to `count` things, the one naming the most with none of them cut; else the one naming the first alone.
function fullest(count: number, naming: (shown: number) => Draft): Draft {
  for (let shown = count; shown > 1; shown--) {
    const draft = naming(shown);
    if (fit(draft, Number.MAX_SAFE_INTEGER) !== null) return draft;
  }
  return naming(1);
}

// A line of names: the first `shown` of them, and how many more there are.
function nameList(w: Writer, names: string[], total: number): string {
  return listOf(total > names.length ? [...names, w.say("list-more", { n: total - names.length })] : names, w.ctx);
}

// "3 of 5 targets met in October 2026; not met: Churn and Costs", over each Metric's latest period that is over. Only a
// Metric with a target and a value in such a period has a target to meet.
function onTargetDraft(w: Writer, metrics: Metric[]): Draft | null {
  let skipped = false;
  const counted = metrics.flatMap((metric) => {
    const points = pointsOf(w, metric);
    const latest = points.filter((p) => !running(w, p.period, metric.period)).at(-1);
    const at = latest && standing(w, metric, latest);
    if (!latest || !at) return [];
    skipped ||= latest !== points.at(-1);
    return [{ metric, period: latest.period, on: at.on }];
  });
  if (counted.length < 2) return null;
  const [first] = counted;
  const same = counted.every((c) => c.period === first.period && c.metric.period === first.metric.period);
  const phrase = same ? when(w, first.period, first.metric.period) : w.say(skipped ? "hl-when-latest-full" : "hl-when-latest");
  const off = counted.filter((c) => !c.on).map((c) => c.metric.name);
  const [m, n] = [counted.length, counted.length - off.length];
  const slots = { m, n, when: phrase };
  if (off.length === 0 || n === 0) return { rule: "on-target", names: [], build: () => w.say(n === 0 ? "hl-none-on" : "hl-all-on", slots) };
  // As many of the Metrics that are not on target as the budget holds, the rest counted.
  return fullest(off.length, (shown) => ({ rule: "on-target", names: off.slice(0, shown), build: (names) => w.say("hl-some-off", { ...slots, names: nameList(w, names, off.length) }) }));
}

// The largest of some sizes, as many as `preferred` allows without parting two that are level; none where too many are.
function largest<T>(sorted: T[], size: (item: T) => number, preferred: number[]): T[] {
  const count = preferred.find((k) => k <= sorted.length && (k === sorted.length || size(sorted[k - 1]) > size(sorted[k])));
  return count === undefined ? [] : sorted.slice(0, count);
}

// "Revenue fell 42 € in October 2026; largest parts: Germany −35 € and Austria −9 €".
function partsDraft(w: Writer, m: Metric, period: string, parts: Part[]): Draft | null {
  if (running(w, period, m.period)) return null;
  const after = valueAt(w, m, period);
  const before = valueAt(w, m, shiftPeriod(period, m.period, -1));
  if (after === undefined || before === undefined) return null;
  const result = bridge(parts, { before, after });
  if (!result.ok) return null;
  const moved = result.parts.filter((p) => p.change !== 0);
  const named = largest(moved, (p) => Math.abs(p.change), [2, 1, MOST_TIED]);
  if (named.length === 0 || named.some((p) => p.appeared || p.gone)) return null;
  // What the parts leave out may hide a part larger than a named one.
  if (Math.abs(result.unexplained ?? 0) >= Math.abs(named[named.length - 1].change)) return null;
  const changes = named.map((p) => differenceOf(w, m, p.change, true));
  const change = result.change === 0 ? "" : differenceOf(w, m, result.change);
  if (change === null || changes.includes(null)) return null;
  const key = result.change > 0 ? "hl-parts-up" : result.change < 0 ? "hl-parts-down" : "hl-parts-flat";
  const phrase = when(w, period, m.period);
  return {
    rule: "parts",
    names: [m.name, ...named.map((p) => p.label)],
    build: ([name, ...labels]) => w.say(key, { name, change, when: phrase, largest: w.say(labels.length === 1 ? "hl-largest-part" : "hl-largest-parts"), parts: listOf(labels.map((l, i) => `${l} ${changes[i]}`), w.ctx) }),
  };
}

// One row's share of the Metric's value, the rows level at the top, or the two largest together.
function shareDrafts(w: Writer, m: Metric, period: string, rows: BreakdownRow[]): Draft[] {
  // Percentages and averages do not add up to a whole, and neither does anything with a part below zero.
  if (inPoints(m) || m.aggregation === "average" || rows.length < 2 || rows.some((r) => !Number.isFinite(r.value) || r.value < 0)) return [];
  const whole = valueAt(w, m, period);
  const sum = (values: number[]) => exactTotal(values, 1);
  if (whole === undefined || whole <= 0 || sum(rows.map((r) => r.value)) > whole) return [];
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const top = sorted.filter((r) => r.value === sorted[0].value);
  if (sorted[0].value === 0 || top.length > MOST_TIED) return [];
  const phrase = when(w, period, m.period);
  const now = running(w, period, m.period);
  const draft = (named: BreakdownRow[], value: number, key: "hl-share" | "hl-share-each" | "hl-share-together"): Draft[] => {
    const pct = percentOf(value, whole);
    // A share short of the whole never reads as 100 %.
    const decimals = decimalsApart([pct, 100], SHARE_UNIT.decimals, w.data.numberStyle);
    if (decimals === null) return [];
    const share = valueText(pct, SHARE_UNIT, decimals, w.data.numberStyle);
    return [{ rule: "share", names: [m.name, ...named.map((r) => r.label)], build: ([name, ...labels]) => w.say(now ? `${key}-running` : key, { name, share, when: phrase, labels: listOf(labels, w.ctx) }) }];
  };
  if (top.length > 1) return draft(top, top[0].value, "hl-share-each");
  const pair = sorted.length > 2 && sorted[1].value > sorted[2].value ? sorted.slice(0, 2) : null;
  return [...draft(top, top[0].value, "hl-share"), ...(pair ? draft(pair, sum(pair.map((r) => r.value)), "hl-share-together") : [])];
}

// Whether two Metrics' numbers can be taken from one another.
const comparable = (a: Metric, b: Metric) => a.unit === b.unit && a.unit_position === b.unit_position && a.format === b.format && a.period === b.period;

// The gap between the two sides in the period, with the rows where it is largest.
function gapDrafts(w: Writer, m: Metric, against: Metric | null, period: string, rows: HeadlineGapRow[]): Draft[] {
  if (against && !comparable(m, against)) return [];
  const now = running(w, period, m.period);
  const value = valueAt(w, m, period);
  const goal = against ? valueAt(w, against, period) : undefined;
  let lead: Draft | null = null;
  let way = 0;
  if (!against) {
    const point = value === undefined ? null : { period, value };
    lead = point && targetDraft(w, m, point);
    if (lead && point) way = Math.sign(standing(w, m, point)!.gap);
    if (lead) lead = { ...lead, rule: "gap" };
  } else if (value !== undefined && goal !== undefined) {
    const size = difference(value, goal);
    way = Math.sign(size);
    const gap = way === 0 ? "" : differenceOf(w, m, size);
    const side = way < 0 ? "hl-gap-below" : way > 0 ? "hl-gap-above" : "hl-gap-level";
    const phrase = when(w, period, m.period);
    if (gap !== null) lead = { rule: "gap", names: [m.name, against.name], build: ([a, b]) => w.say(now ? `${side}-running` : side, { a, b, gap, when: phrase }) };
  }
  // A row without both numbers may hold the largest gap, so then none is called the largest.
  const known = rows.every((r) => r.actual !== null && r.goal !== null && Number.isFinite(r.actual) && Number.isFinite(r.goal));
  const gaps = known ? rows.map((r) => ({ label: r.label, gap: difference(r.actual!, r.goal!) })) : [];
  // In the direction of the whole's own gap, where it has one.
  const same = gaps.filter((r) => r.gap !== 0 && (way === 0 || Math.sign(r.gap) === way)).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const named = largest(same, (r) => Math.abs(r.gap), [1, 2, MOST_TIED]);
  const sizes = named.map((r) => differenceOf(w, m, r.gap, true));
  if (named.length === 0 || sizes.includes(null)) return lead ? [lead] : [];
  const line = (labels: string[]) => listOf(labels.map((l, i) => `${l} ${sizes[i]}`), w.ctx);
  const labels = named.map((r) => r.label);
  if (lead) {
    const held = lead;
    const n = held.names.length;
    return [{ rule: "gap", names: [...held.names, ...labels], build: (all) => w.say("hl-gap-largest", { lead: held.build(all.slice(0, n)), rows: line(all.slice(n)) }) }, held];
  }
  // Rows alone: a whole is not there, so only what is held against something in the rows is said.
  const phrase = when(w, period, m.period);
  if (against) return [{ rule: "gap", names: [m.name, against.name, ...labels], build: ([a, b, ...l]) => w.say("hl-gap-rows", { a, b, when: phrase, rows: line(l) }) }];
  return [{ rule: "gap", names: [m.name, ...labels], build: ([name, ...l]) => w.say("hl-gap-rows-target", { name, when: phrase, rows: line(l) }) }];
}

// A name on one line, cut at a word where it is longer than `most` characters.
function cut(name: string, most: number): string {
  const characters = [...name];
  if (characters.length <= most) return name;
  const head = characters.slice(0, most - 1).join("");
  const space = head.lastIndexOf(" ");
  return `${(space > most / 2 ? head.slice(0, space) : head).replace(/[\s,;:([–-]+$/u, "")}…`;
}

// A draft's sentence within the budget: with its names as they are, else cut no shorter than `shortest`; null where it
// does not fit, or where cutting would make two different names read alike.
function fit(draft: Draft, shortest = SHORTEST_NAME): string | null {
  const names = draft.names.map((n) => n.replace(/\s+/g, " ").trim());
  const different = new Set(names).size;
  for (let most = Math.max(shortest, ...names.map((n) => [...n].length)); most >= shortest; most--) {
    const shown = names.map((n) => cut(n, most));
    if (new Set(shown).size < different) return null;
    const text = draft.build(shown);
    if ([...text].length <= HEADLINE_BUDGET) return text;
  }
  return null;
}

// The title where no rule applies: the names, and the period where there is one for all of them.
function plainTitle(w: Writer, metrics: Metric[], period: string | undefined): Headline {
  const all = metrics.map((m) => m.name);
  const date = period === undefined ? null : periodLabel(period, metrics[0].period, w.data.yearStart);
  const draft = fullest(all.length, (shown) => ({
    rule: "plain",
    names: all.slice(0, shown),
    build: (names) => (date === null ? nameList(w, names, all.length) : w.say("hl-plain", { names: nameList(w, names, all.length), date })),
  }));
  return { rule: "plain", text: fit(draft, SHORTEST_PLAIN_NAME)! };
}

// The period the plain title names: the slide's own, else the latest one every Metric shares.
function plainPeriod(w: Writer, subject: HeadlineSubject, metrics: Metric[]): string | undefined {
  if ("period" in subject) return subject.period;
  const latest = metrics.map((m) => ({ span: m.period, period: pointsOf(w, m).at(-1)?.period }));
  return latest.every((l) => l.period === latest[0].period && l.span === latest[0].span) ? latest[0].period : undefined;
}

// The drafts of a subject, best first.
function draftsFor(w: Writer, subject: HeadlineSubject): (Draft | null)[] {
  if (subject.show === "metrics") {
    const own = ownDrafts(w, subject.metrics[0]);
    return [subject.metrics.length > 1 ? onTargetDraft(w, subject.metrics) : null, own.target, own.streak, own.change];
  }
  if (subject.show === "metric") {
    const own = ownDrafts(w, subject.metric);
    return [own.target, own.streak, own.change];
  }
  const own = ownDrafts(w, subject.metric, subject.period);
  // A Metric's own movement is only added where it reaches the slide's period: an older one is not what the slide is about.
  const latest = pointsOf(w, subject.metric, subject.period).at(-1)?.period === subject.period;
  const [target, streak, change] = latest ? [own.target, own.streak, own.change] : [null, null, null];
  if (subject.show === "change") return [partsDraft(w, subject.metric, subject.period, subject.parts), change, streak, target];
  if (subject.show === "shares") return [...shareDrafts(w, subject.metric, subject.period, subject.rows), target, change];
  return [...gapDrafts(w, subject.metric, subject.against, subject.period, subject.rows), change];
}

/** Up to three headlines for a slide, best first, each within `HEADLINE_BUDGET` characters; where no rule applies, one plain
 * title of the Metrics' names. None only for a slide of no Metric. */
export function deckHeadlines(subject: HeadlineSubject, data: HeadlineData): Headline[] {
  const metrics = subject.show === "metrics" ? subject.metrics : subject.show === "gap" && subject.against ? [subject.metric, subject.against] : [subject.metric];
  if (metrics.length === 0) return [];
  const w = writerFor(data);
  const proposals: Headline[] = [];
  for (const draft of draftsFor(w, subject)) {
    const text = draft && fit(draft);
    if (draft && text && !proposals.some((p) => p.text === text)) proposals.push({ rule: draft.rule, text });
    if (proposals.length === HEADLINE_PROPOSALS) break;
  }
  return proposals.length > 0 ? proposals : [plainTitle(w, metrics, plainPeriod(w, subject, metrics))];
}
