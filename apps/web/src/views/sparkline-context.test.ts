// When each part of a sparkline's context shows (#782): ends, latest, highest and lowest, target, and its range.
import { describe, expect, it } from "vitest";
import { CONTEXT_SCALE, sparklineContext } from "./sparkline-context";

const series = (...values: number[]) => values.map((value, i) => ({ period: `2026-0${i + 1}-01`, value }));
type Target = { target_min: number | null; target_max: number | null };
const none: Target = { target_min: null, target_max: null };
const at = (scale: number, values: number[], target: Target = none, bars = false) => sparklineContext({ scale, points: series(...values), target, bars });

describe("sparklineContext", () => {
  it("stays bare in a usual Widget and on a phone, and below the threshold", () => {
    expect(at(1, [3, 5, 4])).toBeNull();
    expect(at(CONTEXT_SCALE - 0.05, [3, 5, 4])).toBeNull();
    expect(at(CONTEXT_SCALE, [3, 5, 4])).not.toBeNull();
  });

  it("needs two values", () => {
    expect(at(2, [3])).toBeNull();
    expect(sparklineContext({ scale: 2, points: [{ period: "2026-01-01", value: 3 }, { period: "2026-02-01", value: undefined }], target: null, bars: false })).toBeNull();
  });

  it("names the first and last period and marks the latest value", () => {
    const c = at(2, [3, 5, 4])!;
    expect(c.ends).toEqual({ first: "2026-01-01", last: "2026-03-01" });
    expect(c.last).toEqual({ period: "2026-03-01", value: 4 });
  });

  it("labels the highest and lowest, but not the latest, whose dot is there already", () => {
    const c = at(2, [3, 5, 4])!;
    expect(c.high?.value).toBe(5);
    expect(c.low?.value).toBe(3);
    expect(at(2, [3, 4, 5])!.high).toBeNull();
    expect(at(2, [5, 4, 3])!.low).toBeNull();
  });

  it("labels neither when the values are flat", () => {
    const c = at(2, [4, 4, 4])!;
    expect(c.high).toBeNull();
    expect(c.low).toBeNull();
  });

  it("draws no reference without a target: no invented average", () => {
    expect(at(2, [3, 5, 4])!.target).toBeNull();
    expect(sparklineContext({ scale: 2, points: series(3, 5), target: null, bars: false })!.target).toBeNull();
  });

  it("draws a target near the values and takes it into the range", () => {
    const c = at(2, [300, 320, 310], { target_min: 330, target_max: null })!;
    expect(c.target).toEqual({ min: 330, max: null, drawn: true });
    expect(c.domain[1]).toBeGreaterThan(330);
    const band = at(2, [300, 320, 310], { target_min: 305, target_max: 315 })!;
    expect(band.target).toMatchObject({ min: 305, max: 315, drawn: true });
  });

  it("names a target far from the values at the edge instead of flattening the line", () => {
    const c = at(2, [300, 320, 310], { target_min: 1000, target_max: null })!;
    expect(c.target).toEqual({ min: 1000, max: null, drawn: false, side: "above" });
    expect(c.domain[1]).toBeLessThan(400);
    expect(at(2, [300, 320, 310], { target_min: null, target_max: 10 })!.target).toMatchObject({ drawn: false, side: "below" });
  });

  it("fits a line's range to its values with a little room, never from 0", () => {
    const [lo, hi] = at(2, [300, 320, 310])!.domain;
    expect(lo).toBeGreaterThan(290);
    expect(lo).toBeLessThan(300);
    expect(hi).toBeGreaterThan(320);
    expect(hi).toBeLessThan(330);
  });

  it("starts bars at 0", () => {
    expect(at(2, [300, 320, 310], none, true)!.domain[0]).toBe(0);
  });
});
