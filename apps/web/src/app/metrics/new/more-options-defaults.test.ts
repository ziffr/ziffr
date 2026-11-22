// The defaults behind "More options" are what the new-Metric form submitted before they were folded away.
import { describe, expect, it } from "vitest";
import { MORE_DEFAULTS, defaultSide, nonDefaultOptions, type MoreOptionValues } from "./more-options-defaults";

const blank: MoreOptionValues = { unit: "", unit_position: "after", decimals: 0, submission_rule: "overwrite", aggregation: "sum", sources: [...MORE_DEFAULTS.sources], attainment_method: "" };

describe("More options defaults", () => {
  it("are the blank form's values", () => {
    expect(MORE_DEFAULTS).toEqual({ decimals: 0, submission_rule: "overwrite", aggregation: "sum", sources: ["web_form", "mail", "slack", "telegram", "api"], attainment_method: "" });
    expect(nonDefaultOptions(blank)).toEqual([]);
  });
  it("count the side a unit's sign suggests as the default", () => {
    expect(defaultSide("$")).toBe("before");
    expect(defaultSide("€")).toBe("after");
    expect(defaultSide("pc")).toBe("after");
    expect(nonDefaultOptions({ ...blank, unit: "$", unit_position: "before" })).toEqual([]);
    expect(nonDefaultOptions({ ...blank, unit: "$", unit_position: "after" })).toEqual(["Stands after the number"]);
  });
  it("name every value that differs", () => {
    const v: MoreOptionValues = { unit: "d", unit_position: "before", decimals: 2, submission_rule: "add", aggregation: "average", sources: ["api", "slack"], attainment_method: "ratio" };
    expect(nonDefaultOptions(v, { api: "API", slack: "Slack" }, "Ratio")).toEqual([
      "Stands before the number", "2 decimals", "Second value: Add up all values", "Aggregation: Average", "Sources: API, Slack", "Attainment: Ratio",
    ]);
  });
  it("ignores the order of Sources", () => {
    expect(nonDefaultOptions({ ...blank, sources: [...MORE_DEFAULTS.sources].reverse() })).toEqual([]);
  });
});
