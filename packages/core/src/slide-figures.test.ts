import { describe, expect, it } from "vitest";
import { columnsModel, elementScale, figureModel, fillSlideWords, gapModel, metricTableModel, quarterWeeks, scaleOf, writeSlideValue, type SlideContext } from "./slide-figures";
import type { CanvasData, Metric } from "./types";

const metric = (id: number, name: string, extra: Partial<Metric> = {}): Metric => ({
  id, slug: name.toLowerCase().replace(/ /g, "-"), name, owner_id: "o", formula: null, from_catalog_id: null, created_at: "2026-01-01", aggregation: "last", description: "",
  unit: "€", unit_position: "after", format: "currency", decimals: 0, period: "week", submission_rule: "overwrite", polarity: "higher", target_min: null, target_max: null, sources: [], attainment_method: null, ...extra,
});

const commit = metric(1, "Commit");
const quota = metric(2, "Quota");
const coverage = metric(3, "Pipeline coverage", { unit: "×", format: "number", decimals: 1 });
const closed = metric(4, "Closed this quarter");

// Weeks 1 to 8 of the fourth quarter of 2026: Mondays from 5 October.
const weeks = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"];
const series = (values: number[]) => values.map((value, i) => ({ period: weeks[weeks.length - values.length + i], value }));

const data = {
  viewer: "o", metrics: [commit, quota, coverage, closed], numberStyle: "1,234.5", yearStart: 1, targets: {}, condensed: {}, projections: {}, pending: {}, locked: {},
  series: {
    commit: series([2_620_000, 2_700_000, 2_780_000, 2_740_000, 2_860_000, 2_930_000, 2_890_000, 3_010_000]),
    quota: series(Array(8).fill(3_200_000)),
    "pipeline-coverage": series([2.3]),
    "closed-this-quarter": series([1_850_000]),
  },
  breakdowns: {
    1: { "2026-11-23": [{ label: "A", value: 700_000 }, { label: "E", value: 490_000 }, { label: "C", value: 630_000 }] },
    2: { "2026-11-23": [{ label: "A", value: 640_000 }, { label: "E", value: 640_000 }, { label: "C", value: 640_000 }] },
  },
} as unknown as CanvasData;

const ctx = (...metrics: (Metric | null)[]): SlideContext => ({ data, metrics });

describe("how a slide writes numbers", () => {
  it("takes millions from a million, thousands from ten thousand", () => {
    expect([scaleOf(3_200_000).suffix, scaleOf(640_000).suffix, scaleOf(9_999).suffix]).toEqual(["M", "k", ""]);
  });

  it("writes every value of a unit in the element's largest scale", () => {
    const c = ctx(commit, quota);
    expect(writeSlideValue(commit, 120_000, elementScale(commit, c), data, { change: true })).toBe("+0.12 M€");
    expect(writeSlideValue(commit, 3_010_000, elementScale(commit, c), data)).toBe("3.01 M€");
    expect(writeSlideValue(commit, -150_000, elementScale(commit, c), data, { bare: true, change: true })).toBe("−0.15");
  });

  it("never writes a value that is not 0 as 0", () => {
    expect(writeSlideValue(commit, 2_000, scaleOf(3_000_000), data)).toBe("2,000 €");
  });

  it("puts a unit that stands before the number before it", () => {
    const dollars = metric(9, "Sales", { unit: "$", unit_position: "before" });
    expect(writeSlideValue(dollars, 3_010_000, scaleOf(3_010_000), data)).toBe("$3.01M");
  });

  it("writes a multiple together with its ×, whether it counts × or times", () => {
    expect(writeSlideValue(coverage, 2.3, scaleOf(2.3), data)).toBe("2.3×");
    expect(writeSlideValue({ ...coverage, unit: "times" }, 2.3, scaleOf(2.3), data)).toBe("2.3×");
  });
});

describe("a quarter's weeks", () => {
  it("counts the weeks that begin in the quarter", () => {
    expect(quarterWeeks("2026-11-23", "week", 1)).toEqual({ quarter: "Q4", week: 8, weeks: 13 });
    expect(quarterWeeks("2026-10-05", "week", 1)).toEqual({ quarter: "Q4", week: 1, weeks: 13 });
    // The week of 28 September belongs to the third quarter, where its Monday is.
    expect(quarterWeeks("2026-09-28", "week", 1).quarter).toBe("Q3");
  });

  it("has no week number for a month", () => {
    expect(quarterWeeks("2026-11-01", "month", 1)).toEqual({ quarter: "Q4", week: null, weeks: null });
  });
});

describe("an element's words", () => {
  it("fills the quarter, the change and the gap, with the news they bring", () => {
    expect(fillSlideWords("{quarter}, week {quarter week} of {quarter weeks}; {weeks left} left", ctx(commit)).text).toBe("Q4, week 8 of 13; five weeks left");
    expect(fillSlideWords("{change} on last week", ctx(commit)).text).toBe("+0.12 M€ on last week");
    expect(fillSlideWords("{gap 2 1}", ctx(quota, commit))).toEqual({ text: "0.19 M€ short", signal: "bad" });
    expect(fillSlideWords("{gap 1 2}", ctx(metric(5, "Nothing yet"), commit)).text).toBe("–");
    expect(fillSlideWords("of the {difference 2 3} still to close", ctx(coverage, quota, closed)).text).toBe("of the 1.35 M€ still to close");
  });

  it("says nothing of a Metric the viewer may not see", () => {
    expect(fillSlideWords("{metric} {latest} {gap 1 2}|", ctx(null, quota)).text).toBe("  |");
    expect(fillSlideWords("{gap 1 2}|", ctx(commit, null)).text).toBe("|");
  });

  it("keeps a Placeholder that names no Slot, so the author sees it", () => {
    expect(fillSlideWords("{latest 3}", ctx(commit)).text).toBe("{latest 3}");
  });

  it("writes the page number it is given", () => {
    expect(fillSlideWords("{slide}", { ...ctx(), slide: 2 }).text).toBe("2");
  });
});

describe("figures", () => {
  it("shows a value with its label and line", () => {
    expect(figureModel({ kind: "figure", note: "{gap 2 1}", signal: true }, ctx(quota, commit))).toMatchObject({ label: "Quota", value: "3.20 M€", note: "0.19 M€ short", noteTone: "bad" });
  });

  it("is refused whole when one of its Metrics is hidden", () => {
    expect(figureModel({ kind: "figure", note: "{gap 2 1}" }, ctx(quota, null))).toEqual({ denied: true });
    expect(columnsModel({ kind: "columns", reference: true }, ctx(commit, null))).toEqual({ denied: true });
    expect(gapModel({ kind: "gap-table" }, ctx(commit, null))).toEqual({ denied: true });
  });

  it("draws the quarter's weeks with the quota as a line", () => {
    const c = columnsModel({ kind: "columns", reference: true, title: "Commit, {scale}" }, ctx(commit, quota));
    if (c.denied) throw new Error("denied");
    expect(c.title).toBe("Commit, M€");
    expect(c.columns.map((x) => x.label)).toEqual(["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6", "Week 7", "Week 8"]);
    expect(c.columns[7].text).toBe("3.01");
    expect(c.reference).toEqual({ value: 3_200_000, label: "Quota" });
  });

  it("sets two Breakdowns side by side, the largest surplus first", () => {
    const g = gapModel({ kind: "gap-table", rowLabel: "Salesperson" }, ctx(commit, quota));
    if (g.denied) throw new Error("denied");
    expect(g.head.gap).toBe("Commit minus quota, M€");
    expect(g.rows.map((r) => [r.label, r.goal, r.actual, r.gapText])).toEqual([["A", "0.64 M€", "0.70 M€", "+0.06"], ["C", "0.64 M€", "0.63 M€", "−0.01"], ["E", "0.64 M€", "0.49 M€", "−0.15"]]);
  });

  it("says what is missing when there is no Breakdown", () => {
    const g = gapModel({ kind: "gap-table" }, ctx(closed, quota));
    expect(g.denied ? "" : g.empty).toContain("No Breakdown of Closed this quarter");
  });

  it("leaves a hidden Metric out of a metric table, name and all", () => {
    const t = metricTableModel({ kind: "metric-table" }, ctx(commit, null));
    expect(t.rows.map((r) => r.name)).toEqual(["Commit"]);
    expect(t.rows[0]).toMatchObject({ latest: "3.01 M€", previous: "2.89 M€", change: "+0.12 M€", changeSignal: "good", status: null });
    expect(t.head.latest).toBe("This week");
  });
});
