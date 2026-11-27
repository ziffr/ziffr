import { describe, expect, it } from "vitest";
import { TARGETS_ELSEWHERE, targetInEffect } from "./target-in-effect";
import type { Metric, Point } from "./types";

const metric = (over: Partial<Metric> = {}) =>
  ({ id: 1, period: "month", polarity: "higher", target_min: null, target_max: null, format: "number", decimals: 0, unit: "km", unit_position: "after", ...over }) as Metric;
const march = [{ period: "2026-03-01", value: 150 }];
const april = [{ period: "2026-04-01", value: 150 }];
const of = (m: Metric, targets?: Point[], latest: string | null = "2026-03-01") =>
  targetInEffect(m, { latest: latest ?? undefined, today: "2026-05-14", yearStart: 1 }, targets, "1,234.5");

describe("targetInEffect", () => {
  it("states a Target Series value where there is no range", () => {
    expect(of(metric(), march)).toEqual({ period: "2026-03-01", min: 150, max: null, fromSeries: true, words: "≥ 150 km" });
  });

  it("states it as an upper bound where lower is better", () => {
    expect(of(metric({ polarity: "lower" }), march)).toMatchObject({ min: null, max: 150, words: "≤ 150 km" });
  });

  it("states the range where there is no series", () => {
    expect(of(metric({ target_min: 10, target_max: 20 }))).toMatchObject({ fromSeries: false, words: "10 km – 20 km" });
    expect(of(metric())).toMatchObject({ words: "No target" });
  });

  it("lets the period's own target win over the range", () => {
    expect(of(metric({ target_min: 10 }), march)).toMatchObject({ fromSeries: true, words: "≥ 150 km" });
  });

  it("does not claim there is no target when only other periods have one", () => {
    expect(of(metric(), april)).toEqual({ period: "2026-03-01", min: null, max: null, fromSeries: false, words: TARGETS_ELSEWHERE });
    expect(of(metric({ target_min: 10 }), april)).toMatchObject({ words: "≥ 10 km" });
  });

  it("takes the current period of a Metric without a value", () => {
    expect(of(metric(), [{ period: "2026-05-01", value: 7 }], null)).toMatchObject({ period: "2026-05-01", words: "≥ 7 km" });
  });

  it("keeps a Total's added-up rules, and states a period's added-up target", () => {
    const total = metric({ total: { targets: "parts" } as Metric["total"] });
    expect(of(total, [])).toMatchObject({ words: "Its Metrics’ targets added up" });
    expect(of(total, april)).toMatchObject({ words: "Its Metrics’ targets added up" });
    expect(of(total, march)).toMatchObject({ words: "≥ 150 km" });
  });
});
