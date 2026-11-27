// What the browser may say when the first Metric is added (spec 0067; GLOSSARY: First Steps, Metric): a catalog id
// alone, or a name, a unit, how often and which way is good alone.
import { describe, expect, it } from "vitest";
import { checkFirstMetric, FirstMetricRefused } from "./first-steps-metric";
import { FIRST_METRIC_NAME_FIELD } from "./first-steps-screens";

const OWN = { name: "Visitors", unit: "number", period: "day", polarity: "higher" };

describe("a first Metric as the browser describes it", () => {
  it("is a catalog id, or a name with a unit, how often and which way is good", () => {
    expect(checkFirstMetric({ catalogId: 7 })).toEqual({ catalogId: 7 });
    expect(checkFirstMetric({ catalogId: 7, period: "week" })).toEqual({ catalogId: 7, period: "week" });
    expect(checkFirstMetric({ ...OWN, name: "  New   visitors " })).toEqual({ ...OWN, name: "New visitors" });
    expect(checkFirstMetric({ ...OWN, polarity: "lower" })).toEqual({ ...OWN, polarity: "lower" });
  });

  it("refuses everything else: other shapes, other values and fields it does not know", () => {
    const bad: unknown[] = [
      null, "Revenue", 7, [], {},
      { catalogId: "7" }, { catalogId: 0 }, { catalogId: -1 }, { catalogId: 1.5 }, { catalogId: 1e300 }, { catalogId: null }, { catalogId: 7, name: "x" }, { catalogId: 7, period: "day" }, { catalogId: 7, period: "quarter" }, { catalogId: 7, period: null },
      { ...OWN, name: "" }, { ...OWN, name: "   " }, { ...OWN, name: 4 }, { ...OWN, name: "x".repeat(FIRST_METRIC_NAME_FIELD + 1) }, { ...OWN, name: "x".repeat(1_000_000) }, { ...OWN, name: "Vis‮itors" },
      { ...OWN, unit: "currency" }, { ...OWN, unit: undefined }, { ...OWN, period: "quarter" }, { ...OWN, period: "year" },
      { ...OWN, polarity: undefined }, { ...OWN, polarity: "target" }, { ...OWN, polarity: "neither" }, { ...OWN, polarity: null },
      { ...OWN, submitters: ["someone"] }, { ...OWN, formula: "a+1" }, { ...OWN, targetMin: 1 }, { ...OWN, sources: ["api"] },
    ];
    for (const input of bad) expect(() => checkFirstMetric(input), JSON.stringify(input)?.slice(0, 80)).toThrow(FirstMetricRefused);
  });
});
