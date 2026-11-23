// The polar and radar marks (spec 0041, ticket 10): what they draw is worked out here, so the tests check it against
// hand-worked numbers and the properties a scale must keep, and every refusal against what the person is told.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { along, polarModel, radarInputs, radarModel, SPOKES, whereWords, type MarkPoint, type RadarInput } from "./polar-marks";
import { shiftPeriod } from "./periods";
import { sampleCanvasData } from "./sample-data";
import { shownSeries } from "./display-periods";
import { formatValue } from "./format";

const month = (i: number) => shiftPeriod("2026-01-01", "month", i);
const series = (...values: (number | null)[]): MarkPoint[] => values.flatMap((v, i) => (v === null ? [] : [{ period: month(i), value: v }]));
const polar = (points: MarkPoint[], extra: Partial<Parameters<typeof polarModel>[0]> = {}) => polarModel({ name: "Orders", points, by: "month", label: (p) => p.slice(0, 7), write: (v) => `${v} orders`, ...extra });
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
    expect(m.alt).toContain("2026-01: 10 orders; 2026-02: 20 orders; 2026-03: 40 orders");
  });

  it("keeps a missing period as a gap, in its place, never as 0", () => {
    const m = ok(polar(series(10, null, 40, 20)));
    expect(m.marks.map((k) => k.at)).toEqual([0.25, null, 1, 0.5]);
    expect(m.marks[1]).toMatchObject({ label: "2026-02", text: null, gap: "no value" });
    expect(m.alt).toContain("2026-02: no value");
  });

  it("gives the periods oldest first, whatever order they came in", () => {
    const m = ok(polar([...series(10, 20, 30)].reverse()));
    expect(m.marks.map((k) => k.label)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("says a running period is not over", () => {
    expect(ok(polar(series(1, 2, 3), { partialLast: true })).marks.map((k) => k.label)).toEqual(["2026-01", "2026-02", "2026-03 (so far)"]);
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
    expect(ok(polar(weeks, { by: "week" })).marks.map((k) => k.at)).toEqual([1 / 3, 2 / 3, 1]);
    const quarters = [0, 1, 2, 3].map((i) => ({ period: shiftPeriod("2026-01-01", "quarter", i), value: 4 - i }));
    expect(ok(polar(quarters, { by: "quarter" })).marks.map((k) => k.at)).toEqual([1, 0.75, 0.5, 0.25]);
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
  const three = [spoke("A", series(10, 20, 30)), spoke("B", series(5, 1, 3)), spoke("C", series(-10, -5, -20, -8))];

  it("puts each latest value between its own lowest and highest, spokes in the order given", () => {
    const m = ok(radar(three));
    expect(m.spokes).toEqual(["A", "B", "C"]);
    const [now] = m.shapes;
    // A: 30 of 10..30 -> 1. B: 3 of 1..5 -> 0.5. C: -8 of -20..-5 -> 0.8 (a sign is kept in the text).
    expect(now.marks.map((k) => [k.label, k.text, k.at])).toEqual([["A", "30", 1], ["B", "3", 0.5], ["C", "-8", 0.8]]);
    expect(m.alt).toContain("spokes in this order: A, B, C");
    expect(m.alt).toContain("A: 30 (2026-03), at its highest; B: 3 (2026-03), 50 % of the way up its range; C: -8 (2026-04), 80 % of the way up its range");
    expect(m.rule).toContain("Each spoke has its own scale");
    expect(m.rule).toContain("not which Metric is larger");
  });

  it("uses only the periods of the window for the scale", () => {
    const m = ok(radar([spoke("B", series(100, 1, 3)), three[0], three[2]], { window: 2 }));
    // B over its last 2 periods: 1..3, latest 3 -> 1; with all three periods it would be 0.02.
    expect(m.shapes[0].marks[0].at).toBe(1);
    expect(ok(radar([spoke("B", series(100, 1, 3)), three[0], three[2]], { window: 3 })).shapes[0].marks[0].at).toBeCloseTo(0.0202, 3);
  });

  it("shows a Metric with no value as a gap, and one with a single value without a place on its spoke, never as 0", () => {
    const m = ok(radar([three[0], spoke("Empty", []), spoke("One", series(7))]));
    expect(m.shapes[0].marks[1]).toEqual({ label: "Empty", text: null, at: null, gap: "no value" });
    expect(m.shapes[0].marks[2]).toMatchObject({ text: "7", at: null, period: "2026-01" });
    expect(m.alt).toContain("Empty: no value");
    expect(m.alt).toContain("One: 7 (2026-01), the same in every period shown, so it has no range to sit in");
  });

  it("draws the period before as a second shape on the same scale, and says when it has no value", () => {
    const m = ok(radar([spoke("A", series(10, 30, 20)), spoke("B", series(1, null, 3)), spoke("C", series(4, 8, 6))], { against: "previous" }));
    expect(m.shapes.map((s) => s.name)).toEqual(["Latest", "Period before"]);
    // A: latest 20, before 30, scale 10..30 -> 0.5 and 1. B has no value in the period just before, though it has an earlier one.
    expect(m.shapes[0].marks[0].at).toBe(0.5);
    expect(m.shapes[1].marks[0].at).toBe(1);
    expect(m.shapes[1].marks[1]).toMatchObject({ text: null, at: null, gap: "no value in the period before" });
    expect(m.alt).toContain("Period before: A: 30 (2026-02), at its highest; B: no value in the period before;");
  });

  it("refuses fewer than 3 and more than 12 spokes, in words", () => {
    expect(radar(three.slice(0, 2))).toEqual({ ok: false, reason: "A radar needs 3 to 12 Metrics and this has 2: a line or a table shows so few better." });
    const many = Array.from({ length: 13 }, (_, i) => spoke(`M${i}`, series(1, 2, 3)));
    expect(radar(many)).toEqual({ ok: false, reason: "A radar shows 3 to 12 Metrics and this has 13: more cannot be read. Pick fewer." });
    expect(radar(many.slice(0, 12)).ok).toBe(true);
    expect(radar(many.slice(0, 3)).ok).toBe(true);
  });

  it("marks a running period and ignores values that are not numbers", () => {
    const m = ok(radar([spoke("A", [...series(1, 2), { period: month(2), value: Number.NaN }], { partialLast: true }), three[1], three[2]]));
    expect(m.shapes[0].marks[0].label).toBe("A (so far)");
    expect(m.shapes[0].marks[0].text).toBe("2");
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
      expect(inputs[k].points.at(-1)).toEqual({ period: last.period, value: last.value });
      expect(inputs[k].write(last.value)).toBe(formatValue(m, last.value, "1.234,5"));
    });
    const m = ok(radarModel(inputs, { window: 12, style: data.numberStyle }));
    expect(m.shapes[0].marks.map((k) => k.text)).toEqual(ms.map((x) => formatValue(x, shownSeries(x, data, undefined, {}).points.at(-1)!.value, data.numberStyle)));
  });

  it("shows by the Display Period only when the design offers it, and flags a span still running", () => {
    const m = data.metrics[0];
    expect(radarInputs([m], data, { display: "quarter" }, false)[0].by).toBe("month");
    const by = radarInputs([m], data, { display: "quarter" }, true)[0];
    expect(by.by).toBe("quarter");
    expect(by.partialLast).toBe(true);
    expect(radarInputs([m], data, {}, false)[0].partialLast).toBe(false);
    // A Snapshot counts "to date" as of its own day: a quarter that was over on that day is not running.
    expect(radarInputs([m], data, { display: "quarter", asOf: "2026-06-30" }, true)[0].partialLast).toBe(false);
  });
});
