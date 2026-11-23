// The polar and radar marks (spec 0041, ticket 10): what they draw is worked out here, so the tests check it against
// hand-worked numbers and the properties a scale must keep, and every refusal against what the person is told.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { along, pointNote, polarModel, radarInputs, radarModel, radarRadius, RADAR_INNER, SPOKES, whereWords, windowProblem, type MarkPoint, type RadarInput } from "./polar-marks";
import { periodLabel, shiftPeriod } from "./periods";
import { sampleCanvasData } from "./sample-data";
import { shownSeries } from "./display-periods";
import { formatValue } from "./format";

const month = (i: number) => shiftPeriod("2026-01-01", "month", i);
const series = (...values: (number | null)[]): MarkPoint[] => values.flatMap((v, i) => (v === null ? [] : [{ period: month(i), value: v }]));
const polar = (points: MarkPoint[], extra: Partial<Parameters<typeof polarModel>[0]> = {}) => polarModel({ name: "Orders", points, by: "month", from: month(0), to: points.length ? points.map((q) => q.period).sort().at(-1)! : month(0), label: (p) => p.slice(0, 7), write: (v) => `${v} orders`, ...extra });
const spoke = (name: string, points: MarkPoint[], extra: Partial<RadarInput> = {}): RadarInput => ({ name, points, by: "month", write: (v) => `${v}`, period: (p) => p.slice(0, 7), ...extra });
const radar = (inputs: RadarInput[], opts: Partial<Parameters<typeof radarModel>[1]> = {}) => radarModel(inputs, { window: 12, style: "1,234.5", ...opts });
const ok = <T extends { ok: boolean }>(m: T) => { if (!m.ok) throw new Error(`refused: ${(m as unknown as { reason: string }).reason}`); return m as Extract<T, { ok: true }>; };

describe("polarModel", () => {
  it("places each value by its share of the highest, centre 0, in the order of the periods", () => {
    const m = ok(polar(series(10, 20, 40)));
    expect(m.marks.map((k) => [k.label, k.text, k.at])).toEqual([["2026-01", "10 orders", 0.25], ["2026-02", "20 orders", 0.5], ["2026-03", "40 orders", 1]]);
    expect(m.top).toBe("40 orders");
    expect(m.rule).toContain("0 at the centre, 40 orders at the rim");
    // The text alternative has every number, in the order of the circle.
    expect(m.alt).toBe("Orders, as a polar plot of 3 periods. Distance from the centre is the value: 0 at the centre, 40 orders at the rim. The first period is at the top and the others follow clockwise. The line is open: these periods are not one whole cycle. 2026-01: 10 orders; 2026-02: 20 orders; 2026-03: 40 orders.");
  });

  it("keeps a missing period as a gap, in its place, never as 0", () => {
    const m = ok(polar(series(10, null, 40, 20)));
    expect(m.marks.map((k) => k.at)).toEqual([0.25, null, 1, 0.5]);
    expect(m.marks[1]).toMatchObject({ label: "2026-02", text: null, gap: "no value" });
    expect(m.alt).toContain("2026-02: no value");
  });

  it("leaves a value that is not a number out of the circle, and counts only the periods it draws", () => {
    const m = ok(polar([...series(1, 2, 3), { period: month(3), value: Number.NaN }], { to: month(2) }));
    expect(m.marks.map((k) => k.label)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("leaves a value that is not a number, and one outside the window, out of the maximum and the places", () => {
    const m = ok(polar([{ period: month(0), value: 2 }, { period: month(1), value: Number.NaN }, { period: month(2), value: 4 }, { period: month(3), value: 99 }], { from: month(0), to: month(2) }));
    expect(m.marks.map((k) => k.at)).toEqual([0.5, null, 1]);
    expect(m.top).toBe("4 orders");
  });

  it("gives the periods oldest first, whatever order they came in", () => {
    const m = ok(polar([...series(10, 20, 30)].reverse()));
    expect(m.marks.map((k) => k.label)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("says why a period is not a whole one, on that period only", () => {
    const pts = series(1, 2, 3).map((p, i) => (i === 2 ? { ...p, note: "so far" } : i === 0 ? { ...p, note: "2 of 3 months" } : p));
    expect(ok(polar(pts)).marks.map((k) => k.label)).toEqual(["2026-01 (2 of 3 months)", "2026-02", "2026-03 (so far)"]);
  });

  it("starts the circle at the first period with a value and says so; a gap later in the window, or at its end, stays a gap", () => {
    const lead = ok(polar(series(null, null, 5, 6, 7), { from: month(0), to: month(4) }));
    expect(lead.marks.map((k) => k.label)).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(lead.rule).toContain("The circle starts at the first period with a value, 2026-03.");
    expect(ok(polar(series(5, 6, 7))).rule).not.toContain("starts at the first");
    const tail = ok(polar(series(5, 6, 7, null), { from: month(0), to: month(3) }));
    expect(tail.marks.map((k) => k.at)).toEqual([5 / 7, 6 / 7, 1, null]);
    // Values outside the window are not drawn.
    expect(ok(polar(series(9, 5, 6, 7), { from: month(1), to: month(3) })).marks.map((k) => k.at)).toEqual([5 / 7, 6 / 7, 1]);
  });

  it("writes a running period but neither places it nor lets it set the rim, and says so", () => {
    const pts = series(100, 200, 345, 85).map((p, i) => (i === 3 ? { ...p, note: "so far" } : p));
    const m = ok(polar(pts));
    expect(m.marks.map((k) => k.at)).toEqual([100 / 345, 200 / 345, 1, null]);
    expect(m.marks[3]).toMatchObject({ label: "2026-04 (so far)", text: "85 orders", at: null, gap: "still running, so it is not placed", why: "not placed" });
    expect(m.top).toBe("345 orders");
    expect(m.rule).toContain("A period still running is written but not placed, and does not set the rim.");
    expect(m.alt).toContain("2026-04 (so far): 85 orders");
    expect(polar(series(1, 2, 3).map((p) => ({ ...p, note: "so far" })))).toEqual({ ok: false, reason: "Every period shown is still running, so there is nothing to place on the circle yet." });
  });

  it("makes the rule say what is drawn: joined only for a whole cycle with a place at both ends", () => {
    const year = (first: number | null, last: number | null) => series(first, ...Array(10).fill(5), last);
    expect(ok(polar(year(1, 2))).rule).toContain("The line joins the last period to the first: these are one whole cycle.");
    const open = ok(polar(year(1, null), { to: month(11) }));
    expect(open.closed).toBe(false);
    expect(open.rule).toContain("but the line is not joined across a period that is not placed.");
    expect(open.rule).not.toContain("still running");
    // A running period at the start is written but not placed either: no line joins across it.
    const runningFirst = ok(polar(year(1, 2).map((p, i) => (i === 0 ? { ...p, note: "so far" } : p))));
    expect(runningFirst.closed).toBe(false);
    expect(runningFirst.rule).toContain("but the line is not joined");
    expect(runningFirst.rule).toContain("still running");
    expect(ok(polar(year(null, 2), { from: month(0), to: month(11) })).rule).toContain("The circle starts at the first period with a value");
  });

  it("leaves a value that is not a number, and one outside the window, out of the maximum and the places", () => {
    const m = ok(polar([{ period: month(0), value: 2 }, { period: month(1), value: Number.NaN }, { period: month(2), value: 4 }, { period: month(3), value: 99 }], { from: month(0), to: month(2) }));
    expect(m.marks.map((k) => k.at)).toEqual([0.5, null, 1]);
    expect(m.top).toBe("4 orders");
  });

  it("gives the periods oldest first, whatever order they came in", () => {
    const m = ok(polar([...series(10, 20, 30)].reverse()));
    expect(m.marks.map((k) => k.label)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("says why a period is not a whole one, on that period only", () => {
    const pts = series(1, 2, 3).map((p, i) => (i === 2 ? { ...p, note: "so far" } : i === 0 ? { ...p, note: "2 of 3 months" } : p));
    expect(ok(polar(pts)).marks.map((k) => k.label)).toEqual(["2026-01 (2 of 3 months)", "2026-02", "2026-03 (so far)"]);
  });

  it("closes the line only for one whole cycle: 12 months, 4 quarters", () => {
    expect(ok(polar(series(...Array(12).fill(1)))).closed).toBe(true);
    expect(ok(polar(series(...Array(12).fill(1)))).rule).toContain("these are one whole cycle");
    expect(ok(polar(series(...Array(11).fill(1)))).closed).toBe(false);
    const quarters = [0, 1, 2, 3].map((i) => ({ period: shiftPeriod("2026-01-01", "quarter", i), value: 1 }));
    expect(ok(polar(quarters, { by: "quarter", from: quarters[0].period, to: quarters[3].period })).closed).toBe(true);
    expect(ok(polar(quarters.slice(0, 3), { by: "quarter", from: quarters[0].period, to: quarters[2].period })).closed).toBe(false);
  });

  it("refuses Condensed Values, which stand for several periods", () => {
    expect(polar(series(1, 2, 3).map((p, i) => (i === 1 ? { ...p, condensed: true } : p)))).toEqual({ ok: false, reason: expect.stringContaining("Condensed Values") });
  });

  it("accepts 3 and 12 periods and refuses 2 and 13, in words", () => {
    expect(polar(series(...Array(SPOKES.min).fill(1))).ok).toBe(true);
    expect(polar(series(...Array(SPOKES.max).fill(1))).ok).toBe(true);
    expect(polar(series(1, 2))).toEqual({ ok: false, reason: "A polar plot needs at least 3 periods and these cover 2: a line shows so few better." });
    expect(polar(series(...Array(13).fill(1)))).toEqual({ ok: false, reason: "A polar plot shows 3 to 12 periods and these cover more. Show fewer periods." });
    // Two values far apart are 13 periods, not 2.
    expect(polar([{ period: month(0), value: 1 }, { period: month(12), value: 1 }]).ok).toBe(false);
  });

  it("refuses a value below 0, all zeros, no values, and values off the grid of periods", () => {
    expect(polar(series(10, -1, 5))).toEqual({ ok: false, reason: "A polar plot measures from the centre outward, which is 0, so it cannot show a value below 0. A line chart shows these values." });
    expect(polar(series(0, 0, 0))).toEqual({ ok: false, reason: "Every value is 0, so there is nothing to draw around the circle." });
    expect(polar([])).toEqual({ ok: false, reason: "There are no values to draw." });
    expect(polar([{ period: "2026-01-01", value: 1 }, { period: "2026-01-15", value: 2 }, { period: "2026-03-01", value: 3 }])).toEqual({ ok: false, reason: "These values do not fall on whole periods, so they cannot be placed around the circle." });
    expect(polar([{ period: month(0), value: Number.NaN }, { period: month(1), value: Number.POSITIVE_INFINITY }]).ok).toBe(false);
  });

  it("draws a zero value as 0 at the centre, not as a gap", () => {
    expect(ok(polar(series(0, 5, 10))).marks[0]).toMatchObject({ text: "0 orders", at: 0 });
  });

  it("places weeks and quarters on their own grid", () => {
    const weeks = [0, 1, 2].map((i) => ({ period: shiftPeriod("2026-01-05", "week", i), value: i + 1 }));
    expect(ok(polar(weeks, { by: "week", from: weeks[0].period, to: weeks[2].period })).marks.map((k) => k.at)).toEqual([1 / 3, 2 / 3, 1]);
    const quarters = [0, 1, 2, 3].map((i) => ({ period: shiftPeriod("2026-01-01", "quarter", i), value: 4 - i }));
    expect(ok(polar(quarters, { by: "quarter", from: quarters[0].period, to: quarters[3].period })).marks.map((k) => k.at)).toEqual([1, 0.75, 0.5, 0.25]);
  });

  it("is scale-free and keeps the order: any positive factor gives the same places (property)", () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 3, maxLength: 12 }), fc.integer({ min: 1, max: 50 }), (vs, k) => {
      fc.pre(Math.max(...vs) > 0);
      const a = ok(polar(series(...vs)));
      const b = ok(polar(series(...vs.map((v) => v * k))));
      expect(b.marks.map((m) => m.at)).toEqual(a.marks.map((m) => m.at));
      expect(a.marks.map((m) => m.label)).toEqual(vs.map((_, i) => month(i).slice(0, 7)));
      expect(Math.max(...a.marks.map((m) => m.at!))).toBe(1);
      for (const m of a.marks) expect(m.at! >= 0 && m.at! <= 1).toBe(true);
    }));
  });
});

describe("radarModel", () => {
  const three = [spoke("A", series(10, 20, 30, 30)), spoke("B", series(5, 1, 3, 3)), spoke("C", series(-10, -5, -20, -8))];

  it("puts each latest value between its own lowest and highest, spokes in the order given", () => {
    const m = ok(radar(three));
    expect(m.spokes).toEqual(["A", "B", "C"]);
    const [now] = m.shapes;
    // A: 30 of 10..30 -> 1. B: 3 of 1..5 -> 0.5. C: -8 of -20..-5 -> 0.8 (a sign is kept in the text).
    expect(now.marks.map((k) => [k.label, k.text, k.at])).toEqual([["A", "30", 1], ["B", "3", 0.5], ["C", "-8", 0.8]]);
    expect(m.alt.startsWith("A radar of 3 Metrics, spokes in this order: A, B, C. Each spoke")).toBe(true);
    expect(m.alt.endsWith("A: 30 (2026-04), at its highest; B: 3 (2026-04), 50 % of the way up its range; C: -8 (2026-04), 80 % of the way up its range.")).toBe(true);
    expect(m.alt).toContain("larger. Latest: A:");
    expect(m.alt).toContain("A: 30 (2026-04), at its highest; B: 3 (2026-04), 50 % of the way up its range; C: -8 (2026-04), 80 % of the way up its range");
    expect(m.rule).toContain("Each spoke has its own scale");
    expect(m.rule).toContain("not which Metric is larger");
    expect(m.rule).toContain("Further out means a higher value, not a better one.");
    expect(m.rule).toContain("is on the small inner ring and its highest at the rim");
  });

  it("uses only the periods of the window for the scale", () => {
    const m = ok(radar([spoke("B", series(100, 1, 2, 3)), three[0], three[2]], { window: 2 }));
    // B over its last 2 periods: 2..3, latest 3 -> 1; with all four periods it would be 0.02.
    expect(m.shapes[0].marks[0].at).toBe(1);
    expect(ok(radar([spoke("B", series(100, 1, 2, 3)), three[0], three[2]], { window: 4 })).shapes[0].marks[0].at).toBeCloseTo(0.0202, 3);
  });

  it("shows a Metric with no value as a gap, and one with a single value without a place on its spoke, never as 0", () => {
    const m = ok(radar([three[0], spoke("Empty", []), spoke("One", series(7))]));
    expect(m.shapes[0].marks[1]).toEqual({ label: "Empty", text: null, at: null, gap: "no value in the last 12 periods" });
    expect(m.shapes[0].marks[2]).toMatchObject({ text: "7", at: null, period: "2026-01" });
    expect(m.alt).toContain("Empty: no value");
    expect(m.alt).toContain("One: 7 (2026-01), only one period is shown, so it has no range to sit in");
  });

  it("draws the period before as a second shape on the same scale, and says when it has no value", () => {
    const m = ok(radar([spoke("A", series(10, 30, 20)), spoke("B", series(1, null, 3)), spoke("C", series(4, 8, 6))], { against: "previous" }));
    expect(m.shapes.map((s) => s.name)).toEqual(["Latest", "Period before"]);
    // A: latest 20, before 30, scale 10..30 -> 0.5 and 1. B has no value in the period just before, though it has an earlier one.
    expect(m.shapes[0].marks[0].at).toBe(0.5);
    expect(m.shapes[1].marks[0].at).toBe(1);
    expect(m.shapes[1].marks[1]).toMatchObject({ text: null, at: null, gap: "no value in the period before" });
    expect(m.alt).toMatch(/\. Period before: A: 30/);
    expect(m.alt).toContain("Period before: A: 30 (2026-02), at its highest; B: no value in the period before;");
  });

  it("takes the latest by period, not by the order the points came in", () => {
    const m = ok(radar([spoke("A", [...series(10, 20, 30)].reverse()), three[1], three[2]]));
    expect(m.shapes[0].marks[0]).toMatchObject({ text: "30", at: 1, period: "2026-03" });
  });

  it("scales over the window alone, but never leaves the period before off the scale, and says how many periods", () => {
    const one = [spoke("A", series(null, null, 10, 30)), three[1], three[2]];
    // Window 1, nothing to compare: a single value has no range.
    const solo = ok(radar(one, { window: 1 }));
    expect(solo.shapes[0].marks[0]).toMatchObject({ text: "30", at: null });
    expect(solo.shapes[0].marks[0]).toMatchObject({ gap: "only one period is shown, so it has no range to sit in" });
    expect(solo.rule).toContain("of the last 1 period is on the small inner ring");
    expect(ok(radar([spoke("S", series(4, 4, 4)), three[0], three[1]])).shapes[0].marks[0]).toMatchObject({ gap: "the same in every period shown, so it has no range to sit in" });
    // With the period before, the scale reaches it, though the window does not.
    const both = ok(radar(one, { window: 1, against: "previous" }));
    expect(both.shapes.map((s) => s.marks[0].at)).toEqual([1, 0]);
    expect(both.rule).toContain("of the last 1 period and the period before is on the small inner ring");
    expect(ok(radar(one, { window: 12 })).rule).toContain("of the last 12 periods is");
    // A Metric with no value has no period before either.
    expect(ok(radar([spoke("E", []), three[0], three[1]], { against: "previous" })).shapes[1].marks[0]).toMatchObject({ text: null, gap: "no value in the period before" });
  });

  it("refuses fewer than 3 and more than 12 spokes, in words", () => {
    expect(radar(three.slice(0, 2))).toEqual({ ok: false, reason: "A radar needs 3 to 12 Metrics and this has 2: a line or a table shows so few better." });
    const many = Array.from({ length: 13 }, (_, i) => spoke(`M${i}`, series(1, 2, 3)));
    expect(radar(many)).toEqual({ ok: false, reason: "A radar shows 3 to 12 Metrics and this has 13: more cannot be read. Pick fewer." });
    expect(radar(many.slice(0, 12)).ok).toBe(true);
    expect(radar(many.slice(0, 3)).ok).toBe(true);
  });

  it("marks the period actually used as latest when it is not whole, and not the period before", () => {
    const a = spoke("A", [{ period: month(0), value: 1, note: "so far" }, { period: month(1), value: 2 }, { period: month(2), value: 3, note: "2 of 3 months" }]);
    const m = ok(radar([a, three[1], three[2]], { against: "previous" }));
    expect(m.shapes[0].marks[0]).toMatchObject({ label: "A (2 of 3 months)", text: "3" });
    // The period before is month 1, a whole one: no note, though the first point had one.
    expect(m.shapes[1].marks[0]).toMatchObject({ label: "A", text: "2" });
  });

  it("ignores values that are not numbers", () => {
    const m = ok(radar([spoke("A", [...series(1, 2), { period: month(2), value: Number.NaN }]), three[1], three[2]]));
    expect(m.shapes[0].marks[0].text).toBe("2");
  });

  it("leaves a Metric with nothing in the window as a gap, never its old value as the latest", () => {
    const stale = spoke("Old", series(5, 6));
    const m = ok(radar([three[0], stale, spoke("New", series(1, 2, 3, 4, 5, 6, 7, 8))], { window: 3 }));
    // The newest period is 2026-08; Old ended in 2026-02, outside the last 3 periods.
    expect(m.shapes[0].marks[1]).toEqual({ label: "Old", text: null, at: null, gap: "no value in the last 3 periods" });
    // The scale of each spoke is the window's: New over 2026-06..08 is 6..8, latest 8 at the rim.
    expect(m.shapes[0].marks[2]).toMatchObject({ text: "8", at: 1 });
    expect(m.alt).toContain("Old: no value in the last 3 periods");
  });

  it("ends the window at the newest real value: a value that is not a number moves nothing", () => {
    const m = ok(radar([three[0], three[1], spoke("C", [...three[2].points, { period: month(9), value: Number.NaN }])], { window: 2 }));
    // C's last 2 periods: -20 and -8, so -8 is at the rim (a later NaN would have moved the window past it).
    expect(m.shapes[0].marks[2]).toMatchObject({ text: "-8", at: 1 });
  });

  it("writes a period still running but neither places it nor lets it set the scale", () => {
    const a = spoke("A", [{ period: month(0), value: 10 }, { period: month(1), value: 30 }, { period: month(2), value: 1, note: "so far" }]);
    const m = ok(radar([a, three[1], three[2]], { against: "previous" }));
    expect(m.shapes[0].marks[0]).toMatchObject({ label: "A (so far)", text: "1", at: null, gap: "still running, so it is not placed on the scale" });
    // The period before (30) sits on the scale of the whole periods 10..30: at the rim.
    expect(m.shapes[1].marks[0]).toMatchObject({ text: "30", at: 1 });
    expect(m.alt).toContain("A (so far): 1 (2026-03), still running");
  });

  it("does not let a running period before set the scale either", () => {
    const a = spoke("A", [{ period: month(0), value: 10 }, { period: month(1), value: 500, note: "so far" }, { period: month(2), value: 20 }]);
    const m = ok(radar([a, three[1], three[2]], { against: "previous" }));
    expect(m.shapes[0].marks[0]).toMatchObject({ text: "20", at: 1 });
    expect(m.shapes[1].marks[0]).toMatchObject({ text: "500", at: null });
  });

  it("refuses a Condensed Value in the period before", () => {
    const a = spoke("A", [{ period: month(2), value: 1, condensed: true }, { period: month(3), value: 5 }]);
    expect(radar([a, three[1], three[2]], { window: 1, against: "previous" })).toEqual({ ok: false, reason: expect.stringContaining("Condensed Values") });
  });

  it("counts the window in the Metrics' own periods when a week and a month meet", () => {
    const weekly = spoke("W", [{ period: "2026-10-26", value: 1 }, { period: "2026-11-16", value: 9 }], { by: "week" });
    const monthly = (n: string) => spoke(n, [{ period: "2026-10-01", value: 3 }, { period: "2026-11-01", value: 7 }]);
    const one = ok(radar([weekly, monthly("A"), monthly("B")], { window: 1 }));
    expect(one.shapes[0].marks[1]).toMatchObject({ text: "7", period: "2026-11" });
    const two = ok(radar([weekly, monthly("A"), monthly("B")], { window: 2 }));
    expect(two.shapes[0].marks[1]).toMatchObject({ text: "7", at: 1 });
    // The weekly Metric's window is 2 weeks: the week of 26 October is 3 weeks back, so only one week counts.
    expect(two.shapes[0].marks[0]).toMatchObject({ text: "9", at: null, gap: "only one period is shown, so it has no range to sit in" });
  });

  it("draws only gaps, and does not fail, when no Metric has a value", () => {
    const m = ok(radar(["A", "B", "C"].map((n) => spoke(n, [])), { against: "previous" }));
    expect(m.shapes.flatMap((s) => s.marks.map((k) => k.text))).toEqual([null, null, null, null, null, null]);
    expect(m.shapes[0].marks[0]).toMatchObject({ gap: "no value in the last 12 periods" });
  });

  it("refuses Condensed Values in the window", () => {
    expect(radar([three[0], three[1], spoke("C", series(1, 2).map((p) => ({ ...p, condensed: true })))])).toEqual({ ok: false, reason: expect.stringContaining("Condensed Values") });
  });

  it("places every value between 0 and 1 with the lowest at 0 and the highest at 1, whatever the units (property)", () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 2, maxLength: 12 }), fc.integer({ min: 1, max: 50 }), fc.integer({ min: -500, max: 500 }), (vs, k, shift) => {
      fc.pre(new Set(vs).size > 1);
      const base = [spoke("A", series(...vs)), three[0], three[1]];
      const a = ok(radar(base)).shapes[0].marks[0];
      const b = ok(radar([spoke("A", series(...vs.map((v) => v * k + shift))), three[0], three[1]])).shapes[0].marks[0];
      expect(a.at! >= 0 && a.at! <= 1).toBe(true);
      // A different unit (a factor and a shift) does not move a value on its own spoke.
      expect(b.at!).toBeCloseTo(a.at!, 9);
      const lo = Math.min(...vs), hi = Math.max(...vs);
      expect(a.at!).toBe(along(vs[vs.length - 1], lo, hi));
    }));
  });
});

describe("pointNote", () => {
  it("says so far while a span runs, how many periods it holds when it is over with gaps, and nothing for a whole one", () => {
    expect(pointNote({ held: 2, length: 3, toDate: true }, "month")).toBe("so far");
    expect(pointNote({ held: 2, length: 3, toDate: false }, "month")).toBe("2 of 3 months");
    expect(pointNote({ held: 3, length: 3, toDate: false }, "month")).toBeUndefined();
  });
});

describe("the radar's inner ring", () => {
  it("draws the lowest value on a small ring and the highest at the rim, never at the centre", () => {
    expect(RADAR_INNER).toBe(0.12);
    expect(radarRadius(0)).toBe(0.12);
    expect(radarRadius(1)).toBe(1);
    expect(radarRadius(0.5)).toBeCloseTo(0.56, 12);
  });
});

describe("what a radar refuses and how it tells spokes apart", () => {
  const three = ["A", "B", "C"].map((n) => spoke(n, series(1, 2, 3)));
  it("refuses a window that is not a whole number of 1 or more, in words, never 'last NaN periods'", () => {
    for (const w of [Number.NaN, 0, -2, 1.5, Number.POSITIVE_INFINITY]) {
      expect(radar(three, { window: w })).toEqual({ ok: false, reason: "The number of periods to look back must be a whole number of 1 or more." });
      expect(windowProblem(w)).not.toBeNull();
    }
    expect(windowProblem(12)).toBeNull();
    expect(radar(three, { window: 1 }).ok).toBe(true);
  });

  it("names the Slot when two Metrics have one name", () => {
    const m = ok(radar([spoke("Sales", series(1, 2, 3)), spoke("Sales", series(3, 2, 1)), spoke("Cost", series(1, 2, 3))]));
    expect(m.spokes).toEqual(["Sales (Slot 1)", "Sales (Slot 2)", "Cost"]);
    expect(m.shapes[0].marks.map((k) => k.label)).toEqual(["Sales (Slot 1)", "Sales (Slot 2)", "Cost"]);
  });

  it("says in a few words on the chart why a value is not placed", () => {
    const run = spoke("R", [{ period: month(0), value: 1 }, { period: month(1), value: 2, note: "so far" }]);
    const m = ok(radar([run, spoke("S", series(4, 4, 4)), spoke("O", series(null, null, 9))]));
    expect(m.shapes[0].marks.map((k) => ("why" in k ? k.why : undefined))).toEqual(["not placed", "same in every period", "one period only"]);
  });

  it("says Condensed Values in plain words", () => {
    const m = polar(series(1, 2, 3).map((p) => ({ ...p, condensed: true })));
    expect(m).toEqual({ ok: false, reason: "Some of these values are Condensed Values, each standing for several periods in one value, so this chart cannot place them. Show the values by their own period instead." });
  });
});

describe("whereWords", () => {
  it("never writes a rounded 0 or 100 for a value that is not the lowest or the highest", () => {
    expect(whereWords(0, "1,234.5")).toBe("at its lowest");
    expect(whereWords(1, "1,234.5")).toBe("at its highest");
    expect(whereWords(0.001, "1,234.5")).toBe("1 % of the way up its range");
    expect(whereWords(0.999, "1,234.5")).toBe("99 % of the way up its range");
    expect(whereWords(0.5, "1.234,5")).toBe("50 % of the way up its range");
  });
});

describe("radarInputs", () => {
  const data = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };

  it("gives the Metrics in the order given, each value written in its own unit and Number Style, from the core's series", () => {
    const ms = [data.metrics[3], data.metrics[0], data.metrics[1]];
    const inputs = radarInputs(ms, data, {}, false);
    expect(inputs.map((i) => i.name)).toEqual(ms.map((m) => m.name));
    ms.forEach((m, k) => {
      const last = shownSeries(m, data, undefined, {}).points.at(-1)!;
      expect(inputs[k].points.at(-1)).toMatchObject({ period: last.period, value: last.value });
      expect(inputs[k].write(last.value)).toBe(formatValue(m, last.value, "1.234,5"));
    });
    expect(inputs.map((i) => i.period("2026-06-01"))).toEqual(ms.map(() => periodLabel("2026-06-01", "month", data.yearStart)));
    const m = ok(radarModel(inputs, { window: 12, style: data.numberStyle }));
    expect(m.shapes[0].marks.map((k) => k.text)).toEqual(ms.map((x) => formatValue(x, shownSeries(x, data, undefined, {}).points.at(-1)!.value, data.numberStyle)));
  });

  it("shows by the Display Period only when the design offers it, and flags a span still running", () => {
    const m = data.metrics[0];
    expect(radarInputs([m], data, { display: "quarter" }, false)[0].by).toBe("month");
    const by = radarInputs([m], data, { display: "quarter" }, true)[0];
    expect(by.by).toBe("quarter");
    expect(by.points.at(-1)!.note).toBe("so far");
    expect(radarInputs([m], data, {}, false)[0].points.at(-1)!.note).toBeUndefined();
    // A Snapshot counts "to date" as of its own day: a quarter that was over on that day is not running.
    expect(radarInputs([m], data, { display: "quarter", asOf: "2026-06-30" }, true)[0].points.at(-1)!.note).toBeUndefined();
  });
});
