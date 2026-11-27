// What the Comparison strip draws now that the target and the period Comparisons are ticked apart (GLOSSARY: Comparison, Attainment).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CompareKey } from "@ziffr/core/compare";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { CompareStrip } from "./compare-strip";

const data = sampleCanvasData("sara", "1,234.5");
const metric = { ...data.metrics[0], polarity: "higher" as const, target_min: 1 as number | null, target_max: null };
const draw = (props: { target?: boolean; keys?: CompareKey[]; targetMin?: null } = {}) =>
  renderToStaticMarkup(<CompareStrip metric={props.targetMin === null ? { ...metric, target_min: null } : metric} data={{ ...data, targets: {} }} keys={props.keys} target={props.target} />);

describe("CompareStrip", () => {
  it("shows the target and the default Comparisons when nothing is stored", () => {
    expect(draw()).toContain("of target");
    expect(draw()).toContain("YoY");
  });

  it("shows the target alone with every period unticked", () => {
    expect(draw({ keys: [] })).toContain("of target");
    expect(draw({ keys: [] })).not.toMatch(/YoY|vs prev/);
  });

  it("hides the target and keeps the periods", () => {
    expect(draw({ target: false })).not.toContain("of target");
    expect(draw({ target: false })).toContain("YoY");
  });

  it("is not drawn with nothing to show", () => {
    expect(draw({ keys: [], target: false })).toBe("");
    expect(draw({ keys: [], targetMin: null })).toBe("");
  });
});
