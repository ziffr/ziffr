// The headline rules (spec 0069), one table of cases per kind of slide: each case is the numbers and the proposals expected,
// word for word and best first.
import { describe, expect, it, vi } from "vitest";
import { deckHeadlines, HEADLINE_BUDGET, HEADLINE_PROPOSALS, type Headline, type HeadlineData, type HeadlineGapRow, type HeadlineSubject } from "./deck-headlines";
import { HEADLINE_EN } from "./takeaways/headline-wording";
import type { Metric, Point } from "./types";

// The cases of wording the rules ask for, so that no headline wording goes unsaid by the tables below.
const asked = vi.hoisted(() => new Set<string>());
vi.mock("./takeaways/wording", async (original) => {
  const real = await original<typeof import("./takeaways/wording")>();
  return { ...real, say: (...args: Parameters<typeof real.say>) => (asked.add(args[0]), real.say(...args)) };
});

let ids = 0;
function metric(name: string, over: Partial<Metric> = {}): Metric {
  ids++;
  return { id: ids, slug: `m${ids}`, name, unit: "€", unit_position: "after", format: "currency", decimals: 0, period: "month", polarity: "higher", target_min: null, target_max: null, aggregation: "sum", ...over } as Metric;
}
const percent = (name: string, over: Partial<Metric> = {}) => metric(name, { unit: "%", format: "percent", aggregation: "average", ...over });

// Monthly points from `first` (1 to 12 of 2026); null leaves a month out.
const months = (first: number, ...values: (number | null)[]): Point[] => values.flatMap((value, i) => (value === null ? [] : [{ period: `2026-${String(first + i).padStart(2, "0")}-01`, value }]));
const OCT = "2026-10-01";
const NOV = "2026-11-01";

function data(held: [Metric, Point[], Point[]?][], over: Partial<HeadlineData> = {}): HeadlineData {
  return { series: Object.fromEntries(held.map(([m, points]) => [m.slug, points])), targets: Object.fromEntries(held.map(([m, , targets]) => [m.id, targets ?? []])), numberStyle: "1,234.5", yearStart: 1, today: "2026-11-15", ...over };
}

type Case = [string, HeadlineSubject, HeadlineData, string[]];
const said: Headline[] = [];
function check(cases: Case[]) {
  it.each(cases)("%s", (_, subject, held, want) => {
    const got = deckHeadlines(subject, held);
    said.push(...got);
    expect(got.map((h) => h.text)).toEqual(want);
  });
}

// One Metric with its numbers, as a "metric" case.
function one(title: string, m: Metric, points: Point[], want: string[], targets?: Point[], over?: Partial<HeadlineData>): Case {
  return [title, { show: "metric", metric: m }, data([[m, points, targets]], over), want];
}

const revenue = (over: Partial<Metric> = {}) => metric("Revenue", over);
const costs = () => metric("Costs", { polarity: "lower" });
const range = () => metric("Stock", { polarity: "target", target_min: 100, target_max: 200, aggregation: "last" });

describe("against a target", () => {
  check([
    one("below a Target Series, with the change", revenue(), months(9, 1000, 920), ["Revenue was 80 € below target in October 2026, at 920 €", "Revenue fell 8.0 % to 920 € in October 2026"], months(10, 1000)),
    one("above a Target Range's lower end", revenue({ target_min: 900 }), months(10, 920), ["Revenue was 20 € above target in October 2026, at 920 €"]),
    one("the Target Series counts before the range", revenue({ target_min: 1 }), months(10, 920), ["Revenue was 80 € below target in October 2026, at 920 €"], months(10, 1000)),
    one("exactly on target", revenue({ target_min: 920 }), months(10, 920), ["Revenue was on target in October 2026: 920 € against 920 €"]),
    one("lower is better, over it", costs(), months(10, 120), ["Costs was 20 € above target in October 2026, at 120 €"], months(10, 100)),
    one("lower is better, under it", costs(), months(10, 80), ["Costs was 20 € below target in October 2026, at 80 €"], months(10, 100)),
    one("below a range", range(), months(10, 70), ["Stock was 30 € below the target range in October 2026, at 70 €"]),
    one("above a range", range(), months(10, 260), ["Stock was 60 € above the target range in October 2026, at 260 €"]),
    one("within a range", range(), months(10, 150), ["Stock was within the target range in October 2026, at 150 €"]),
    one("a value below zero against a target below zero", revenue(), months(10, -50), ["Revenue was 30 € below target in October 2026, at −50 €"], months(10, -20)),
    one("a percentage is apart in points", percent("Margin", { target_min: 30 }), months(10, 29), ["Margin was 1 pt below target in October 2026, at 29 %"]),
    one("no target on the side that counts says nothing of a target", revenue({ target_max: 100 }), months(10, 50), ["Revenue, October 2026"]),
  ]);
});

describe("change and streak", () => {
  check([
    one("up, in percent", revenue(), months(9, 200, 230), ["Revenue rose 15.0 % to 230 € in October 2026"]),
    one("unchanged", revenue(), months(9, 200, 200), ["Revenue was unchanged at 200 € in October 2026"]),
    one("from zero, both numbers", revenue(), months(9, 0, 40), ["Revenue rose from 0 € to 40 € in October 2026"]),
    one("from below zero, both numbers", revenue(), months(9, -10, -5), ["Revenue rose from −10 € to −5 € in October 2026"]),
    one("to below zero, both numbers", revenue(), months(9, 10, -5), ["Revenue fell from 10 € to −5 € in October 2026"]),
    one("too small for a percentage, with the decimals that tell them apart", revenue(), months(9, 100000, 100000.4), ["Revenue rose from 100,000.0 € to 100,000.4 € in October 2026"]),
    one("a percentage moves in points", percent("Margin"), months(9, 30, 26), ["Margin fell 4 pts to 26 % in October 2026"]),
    one("a streak up comes before the last change", revenue(), months(7, 1, 2, 3, 4), ["Revenue rose 3 months in a row, to 4 € in October 2026", "Revenue rose 33.3 % to 4 € in October 2026"]),
    one("a streak down ends at a level step", revenue(), months(5, 9, 9, 8, 7, 6, 5), ["Revenue fell 4 months in a row, to 5 € in October 2026", "Revenue fell 16.7 % to 5 € in October 2026"]),
    one("a streak does not cross a missing period", revenue(), months(6, 1, null, 2, 3, 4), ["Revenue rose 33.3 % to 4 € in October 2026"]),
    one("no change across a missing period", revenue(), months(8, 100, null, 50), ["Revenue, October 2026"]),
    one("target, streak and change: three at most", revenue({ target_min: 10 }), months(7, 1, 2, 3, 4), ["Revenue was 6 € below target in October 2026, at 4 €", "Revenue rose 3 months in a row, to 4 € in October 2026", "Revenue rose 33.3 % to 4 € in October 2026"]),
    one("the Number Style", revenue({ decimals: 2 }), months(9, 1000, 1234.5), ["Revenue rose 23,5 % to 1.234,50 € in October 2026"], undefined, { numberStyle: "1.234,5" }),
    one("a week", revenue({ period: "week" }), [{ period: "2026-10-26", value: 1 }, { period: "2026-11-02", value: 2 }], ["Revenue rose 100.0 % to 2 € in the week of Mon 2 Nov 2026"]),
    one("a day", revenue({ period: "day" }), [{ period: "2026-11-05", value: 2 }, { period: "2026-11-06", value: 1 }], ["Revenue fell 50.0 % to 1 € on Fri 6 Nov 2026"]),
    one("the value given last counts", revenue(), [...months(10, 5), ...months(9, 4), ...months(10, 6)], ["Revenue rose 50.0 % to 6 € in October 2026"]),
  ]);
});

describe("a period that is not over", () => {
  check([
    one("is said so far beside its target, and the change is of the last full periods", revenue({ target_min: 100 }), months(9, 80, 90, 10), ["Revenue is at 10 € so far in November 2026; the target is 100 €", "Revenue rose 12.5 % to 90 € in October 2026"]),
    one("beside a range", range(), months(11, 10), ["Stock is at 10 € so far in November 2026; the target range is 100 € to 200 €"]),
    one("is never compared with a full period", revenue(), months(10, 90, 10), ["Revenue, November 2026"]),
    one("counts as running on its last day", revenue(), months(10, 90, 10), ["Revenue, November 2026"], undefined, { today: "2026-11-30" }),
    one("is over the day after", revenue(), months(10, 90, 45), ["Revenue fell 50.0 % to 45 € in November 2026"], undefined, { today: "2026-12-01" }),
  ]);
});

describe("no rule, long names and no values", () => {
  const long = metric("Weighted pipeline from partner-sourced opportunities in the enterprise segment across all regions and every product line", { target_min: 100 });
  check([
    one("no values", revenue({ target_min: 1 }), [], ["Revenue"]),
    one("a value that is not a number", revenue(), months(10, Number.NaN), ["Revenue"]),
    one("one value and no target", revenue(), months(10, 5), ["Revenue, October 2026"]),
    one("too small to write", revenue({ target_min: 1 }), months(10, 1e-30), ["Revenue, October 2026"]),
    one("a long name is cut at a word", long, months(10, 90), ["Weighted pipeline from partner-sourced opportunities… was 10 € below target in October 2026, at 90 €"]),
    one("a long name in a plain title", long, [], ["Weighted pipeline from partner-sourced opportunities in the enterprise segment across all regions…"]),
    one("a name of one line", metric("Net\n  revenue"), [], ["Net revenue"]),
    ["several Metrics with no values", { show: "metrics", metrics: [revenue(), costs()] }, data([]), ["Revenue and Costs"]],
    ["more names than fit are counted", { show: "metrics", metrics: Array.from({ length: 12 }, (_, i) => metric(`Number of open support requests, region ${i + 1}`)) }, data([]), ["Number of open support requests, region 1, Number of open support requests, region 2 and 10 more"]],
    ["no Metric", { show: "metrics", metrics: [] }, data([]), []],
  ]);
});

describe("how many are on target", () => {
  // Metrics named in turn, each with a target of 100 and its October value; null for none.
  function several(title: string, values: [string, number | null, Partial<Metric>?][], want: string[]): Case {
    const held = values.map(([name, value, over]): [Metric, Point[]] => [metric(name, { target_min: 100, ...over }), value === null ? [] : months(10, value)]);
    return [title, { show: "metrics", metrics: held.map(([m]) => m) }, data(held), want];
  }
  const low = { polarity: "lower", target_min: null, target_max: 100 } as const;
  check([
    several("which are not, lower is better among them", [["Revenue", 120], ["Costs", 120, low], ["Churn", 80, low], ["Leads", 80]], ["2 of 4 targets met in October 2026; not met: Costs and Leads", "Revenue was 20 € above target in October 2026, at 120 €"]),
    several("all", [["Revenue", 100], ["Leads", 101]], ["All 2 targets met in October 2026", "Revenue was on target in October 2026: 100 € against 100 €"]),
    several("none", [["Revenue", 1], ["Leads", 2]], ["None of 2 targets met in October 2026", "Revenue was 99 € below target in October 2026, at 1 €"]),
    several("only those with a target and a value are counted", [["Revenue", 120], ["Leads", 80], ["Visits", 5, { target_min: null }], ["Calls", null]], ["1 of 2 targets met in October 2026; not met: Leads", "Revenue was 20 € above target in October 2026, at 120 €"]),
    several("one with a target is no count", [["Revenue", 120], ["Visits", 5, { target_min: null }]], ["Revenue was 20 € above target in October 2026, at 120 €"]),
    several(
      "as many names as fit",
      ["Revenue", "New business pipeline", "Renewals in the enterprise segment", "Average contract value", "Qualified leads from partners"].map((name, i) => [name, i === 0 ? 120 : 80]),
      ["1 of 5 targets met in October 2026; not met: New business pipeline and 3 more", "Revenue was 20 € above target in October 2026, at 120 €"],
    ),
  ]);

  const [a, b] = [metric("Revenue", { target_min: 100 }), metric("Leads", { target_min: 100 })];
  const q = metric("Hires", { target_min: 2, period: "quarter" });
  check([
    ["periods that differ", { show: "metrics", metrics: [a, q] }, data([[a, months(10, 120)], [q, [{ period: "2026-07-01", value: 1 }]]]), ["1 of 2 targets met in their latest periods; not met: Hires", "Revenue was 20 € above target in October 2026, at 120 €"]],
    ["a period that is not over is left aside", { show: "metrics", metrics: [a, q] }, data([[a, months(10, 120, 1)], [q, [{ period: "2026-07-01", value: 3 }]]]), ["All 2 targets met in their latest full periods", "Revenue is at 1 € so far in November 2026; the target is 100 €"]],
    ["one shared full period is named", { show: "metrics", metrics: [a, b] }, data([[a, months(10, 120, 1)], [b, months(10, 130)]]), ["All 2 targets met in October 2026", "Revenue is at 1 € so far in November 2026; the target is 100 €"]],
  ]);
});

describe("the largest parts of a change", () => {
  // Revenue in September and October, with parts given as [label, before, after].
  function change(title: string, whole: [number | null, number], parts: [string, number | null, number | null][], want: string[], period = OCT): Case {
    const m = revenue();
    return [title, { show: "change", metric: m, period, parts: parts.map(([label, before, after]) => ({ label, before, after })) }, data([[m, months(period === OCT ? 9 : 10, ...whole)]]), want];
  }
  check([
    change("down, the two largest", [100, 58], [["Austria", 20, 11], ["Germany", 60, 25], ["France", 20, 22]], ["Revenue fell 42 € in October 2026; largest parts: Germany −35 € and Austria −9 €", "Revenue fell 42.0 % to 58 € in October 2026"]),
    change("up, with a part against it", [100, 120], [["Germany", 60, 90], ["Austria", 40, 30]], ["Revenue rose 20 € in October 2026; largest parts: Germany +30 € and Austria −10 €", "Revenue rose 20.0 % to 120 € in October 2026"]),
    change("unchanged as a whole", [100, 100], [["Germany", 60, 70], ["Austria", 40, 30]], ["Revenue was unchanged in October 2026; largest parts: Germany +10 € and Austria −10 €", "Revenue was unchanged at 100 € in October 2026"]),
    change("a tie for second place names the first alone", [100, 70], [["Germany", 60, 40], ["Austria", 20, 15], ["France", 20, 15]], ["Revenue fell 30 € in October 2026; largest part: Germany −20 €", "Revenue fell 30.0 % to 70 € in October 2026"]),
    change("three level at the top are all named", [90, 60], [["A", 30, 20], ["B", 30, 20], ["C", 30, 20]], ["Revenue fell 30 € in October 2026; largest parts: A −10 €, B −10 € and C −10 €", "Revenue fell 33.3 % to 60 € in October 2026"]),
    change("four level at the top are too many", [80, 40], [["A", 20, 10], ["B", 20, 10], ["C", 20, 10], ["D", 20, 10]], ["Revenue fell 50.0 % to 40 € in October 2026"]),
    change("a remainder as large as a named part", [100, 60], [["Germany", 60, 40], ["Austria", 20, 10]], ["Revenue fell 40.0 % to 60 € in October 2026"]),
    change("a named part with no value before", [100, 150], [["Germany", 100, 110], ["Spain", null, 40]], ["Revenue rose 50.0 % to 150 € in October 2026"]),
    change("no value for the period before", [null, 60], [["Germany", 60, 40]], ["Revenue, October 2026"]),
    change("no part moved", [100, 100], [["Germany", 100, 100]], ["Revenue was unchanged at 100 € in October 2026"]),
    change("a period that is not over has no bridge", [100, 60], [["Germany", 100, 60]], ["Revenue, November 2026"], NOV),
  ]);
});

describe("one row's share", () => {
  function shares(title: string, whole: number | null, rows: [string, number][], want: string[], over: Partial<Metric> = {}, period = OCT): Case {
    const m = revenue(over);
    return [title, { show: "shares", metric: m, period, rows: rows.map(([label, value]) => ({ label, value })) }, data([[m, whole === null ? [] : months(period === OCT ? 10 : 11, whole)]]), want];
  }
  check([
    shares("the largest, then the two largest", 1000, [["Austria", 180], ["Germany", 420], ["France", 100], ["Spain", 300]], ["Germany made up 42.0 % of Revenue in October 2026", "Germany and Spain together made up 72.0 % of Revenue in October 2026"]),
    shares("of the Metric's value, not of the rows", 1000, [["Germany", 100], ["Austria", 50]], ["Germany made up 10.0 % of Revenue in October 2026"]),
    shares("two level at the top", 100, [["Germany", 40], ["Austria", 40], ["France", 20]], ["Germany and Austria each made up 40.0 % of Revenue in October 2026"]),
    shares("four level", 100, [["A", 25], ["B", 25], ["C", 25], ["D", 25]], ["Revenue, October 2026"]),
    shares("nearly all never reads as all", 100000, [["Germany", 99999], ["Austria", 1]], ["Germany made up 99.999 % of Revenue in October 2026"]),
    shares("a row below zero", 100, [["Germany", 120], ["Returns", -20]], ["Revenue, October 2026"]),
    shares("rows above the value", 100, [["Germany", 90], ["Austria", 20]], ["Revenue, October 2026"]),
    shares("rows that are all zero", 100, [["Germany", 0], ["Austria", 0]], ["Revenue, October 2026"]),
    shares("one row", 100, [["Germany", 100]], ["Revenue, October 2026"]),
    shares("no value", null, [["Germany", 1], ["Austria", 2]], ["Revenue, October 2026"]),
    shares("an average does not add up", 100, [["Germany", 40], ["Austria", 20]], ["Revenue, October 2026"], { aggregation: "average" }),
    shares("so far", 100, [["Germany", 60], ["Austria", 30], ["France", 10]], ["Germany makes up 60.0 % of Revenue so far in November 2026", "Germany and Austria together make up 90.0 % of Revenue so far in November 2026"], {}, NOV),
    shares("two level, so far", 100, [["Germany", 50], ["Austria", 50]], ["Germany and Austria each make up 50.0 % of Revenue so far in November 2026"], {}, NOV),
  ]);
});

describe("a gap", () => {
  const rows = (...held: [string, number | null, number | null][]): HeadlineGapRow[] => held.map(([label, actual, goal]) => ({ label, actual, goal }));
  function between(title: string, values: [number | null, number | null], held: HeadlineGapRow[], want: string[], over: Partial<Metric> = {}, period = OCT): Case {
    const [a, b] = [metric("Commit"), metric("Quota", over)];
    const at = (v: number | null) => (v === null ? [] : months(period === OCT ? 10 : 11, v));
    return [title, { show: "gap", metric: a, against: b, period, rows: held }, data([[a, at(values[0])], [b, at(values[1])]]), want];
  }
  check([
    between("below, with the row where it is largest", [60, 100], rows(["Ana", 20, 50], ["Ben", 10, 30], ["Cleo", 30, 20]), ["Commit was 40 € below Quota in October 2026; largest gap: Ana −30 €", "Commit was 40 € below Quota in October 2026"]),
    between("above", [120, 100], rows(["Ana", 80, 50], ["Ben", 40, 50]), ["Commit was 20 € above Quota in October 2026; largest gap: Ana +30 €", "Commit was 20 € above Quota in October 2026"]),
    between("level, the largest either way", [100, 100], rows(["Ana", 60, 50], ["Ben", 40, 50]), ["Commit was level with Quota in October 2026; largest gap: Ana +10 € and Ben −10 €", "Commit was level with Quota in October 2026"]),
    between("a row without a number: none is called largest", [60, 100], rows(["Ana", 20, 50], ["Ben", null, 30]), ["Commit was 40 € below Quota in October 2026"]),
    between("rows alone where a side has no value", [null, 100], rows(["Ana", 20, 50], ["Ben", 10, 30]), ["Commit against Quota in October 2026; largest gap: Ana −30 €"]),
    between("so far", [60, 100], [], ["Commit is 40 € below Quota so far in November 2026"], {}, NOV),
    between("above, so far", [160, 100], [], ["Commit is 60 € above Quota so far in November 2026"], {}, NOV),
    between("level, so far", [100, 100], [], ["Commit is level with Quota so far in November 2026"], {}, NOV),
    between("units that differ are not taken from one another", [60, 100], rows(["Ana", 20, 50]), ["Commit and Quota, October 2026"], { unit: "$" }),
    between("no values", [null, null], [], ["Commit and Quota, October 2026"]),
  ]);

  const total = metric("Commit", { target_min: 100 });
  const bare = metric("Commit");
  check([
    ["against targets", { show: "gap", metric: total, against: null, period: OCT, rows: rows(["Ana", 20, 50], ["Ben", 70, 50]) }, data([[total, months(10, 90)]]), ["Commit was 10 € below target in October 2026, at 90 €; largest gap: Ana −30 €", "Commit was 10 € below target in October 2026, at 90 €"]],
    ["rows against targets where the whole has none", { show: "gap", metric: bare, against: null, period: OCT, rows: rows(["Ana", 20, 50], ["Ben", 90, 50]) }, data([[bare, months(10, 110)]]), ["Commit against target in October 2026; largest gap: Ben +40 €"]],
    ["rows with no gap at all", { show: "gap", metric: bare, against: null, period: OCT, rows: rows(["Ana", 50, 50]) }, data([[bare, []]]), ["Commit, October 2026"]],
  ]);
});

describe("every proposal", () => {
  it("names two long rows apart or says nothing of them", () => {
    const m = revenue();
    const label = (end: string) => `${"Enterprise accounts in the northern sales region ".repeat(2)}${end}`;
    const got = deckHeadlines({ show: "change", metric: m, period: OCT, parts: [{ label: label("A"), before: 50, after: 30 }, { label: label("B"), before: 50, after: 30 }] }, data([[m, months(9, 100, 60)]]));
    expect(got.map((h) => h.rule)).toEqual(["change"]);
  });

  it("stays in the budget with the longest names and large numbers, and keeps every number whole", () => {
    const name = (n: number) => `${"Annual recurring revenue from existing customers ".repeat(3).slice(0, 118)}${n}`;
    const [a, b] = [metric(`A ${name(1)}`.slice(0, 120)), metric(`B ${name(2)}`.slice(0, 120))];
    const held = data([[a, months(7, 1e9, 2e9, 3e9, 4_123_456_789), months(10, 9e9)], [b, months(10, 5e9)]]);
    for (const subject of [{ show: "metric", metric: a }, { show: "metrics", metrics: [a, b] }, { show: "gap", metric: a, against: b, period: OCT, rows: [] }] satisfies HeadlineSubject[]) {
      const got = deckHeadlines(subject, held);
      expect(got.length).toBeGreaterThan(0);
      expect(got.length).toBeLessThanOrEqual(HEADLINE_PROPOSALS);
      for (const h of got) expect([...h.text].length, h.text).toBeLessThanOrEqual(HEADLINE_BUDGET);
    }
    expect(deckHeadlines({ show: "metric", metric: a }, held)[0].text).toContain("4,123,456,789 €");
  });

  it("is covered by the cases above, wording by wording", () => {
    expect(Object.keys(HEADLINE_EN).filter((key) => !asked.has(key))).toEqual([]);
  });

  it("says what the numbers say: no cause, no advice, nothing left to fill in", () => {
    expect(said.length).toBeGreaterThan(50);
    for (const text of [...said.map((h) => h.text), ...Object.values(HEADLINE_EN)]) expect(text).not.toMatch(/because|cause|due to|thanks to|driven|should|must|need|improv|recommend/i);
    for (const h of said) expect(h.text).not.toMatch(/[{}]|NaN|Infinity|undefined/);
  });
});
