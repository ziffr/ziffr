// The widget scale (#763): a usual Widget and a phone draw as before; a large or presented one grows, within a limit.
import { describe, expect, it } from "vitest";
import { WIDGET_SCALE_MAX, widgetScale } from "./widget-scale";

describe("widgetScale", () => {
  it("is 1 for a usual Widget on a dashboard and at phone width", () => {
    expect(widgetScale(280, 192)).toBe(1); // 3 × 4 on a laptop
    expect(widgetScale(360, 520)).toBe(1); // one column on a phone, however tall
    expect(widgetScale(570, 296)).toBe(1);
  });

  it("is 1 before the card is measured or when it has no size", () => {
    expect(widgetScale(0, 0)).toBe(1);
    expect(widgetScale(Number.NaN, 400)).toBe(1);
  });

  it("follows the smaller growth, so a short wide Widget does not outgrow its height", () => {
    expect(widgetScale(2250, 504)).toBe(1.7); // 12 × 10 on a wide screen: limited by its height
    expect(widgetScale(1040, 1200)).toBe(2); // tall: limited by its width
  });

  it("grows up to its limit when presented on a wall screen", () => {
    expect(widgetScale(2300, 1000)).toBe(WIDGET_SCALE_MAX);
    expect(widgetScale(6000, 4000)).toBe(WIDGET_SCALE_MAX);
  });

  it("moves in steps of 0.05", () => {
    const s = widgetScale(700, 1000);
    expect(Math.round(s * 20)).toBe(s * 20);
  });
});
