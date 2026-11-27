// The scoreboard mark drawn (GLOSSARY: View Design): every value, change and status in a row is the one the core writes
// for the same Metric, in the order of the Slot; colour keeps its one meaning; what a row cannot say it says in words.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compare, resolverFrom } from "@ziffr/core/compare";
import { shownSeries } from "@ziffr/core/display-periods";
import { formatChange, formatValue, targetLabel, targetStatus, targetText } from "@ziffr/core/format";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { CanvasData, WidgetSettings } from "@ziffr/core/types";
import { DesignView } from "./design-view";

const data: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const [REVENUE, ORDERS, , CHURN, COST] = data.metrics.map((m) => m.id);
const design = BUILT_IN_DESIGNS.scoreboard;

const draw = (ids: number[], settings: WidgetSettings = { window: 12 }, d: CanvasData = data) =>
  renderToStaticMarkup(<DesignView design={design} widget={{ metric_ids: ids, settings }} metrics={ids.map((id) => d.metrics.find((m) => m.id === id)!)} data={d} />);
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const rows = (html: string) => html.split("<tr").slice(2);

describe("scoreboard", () => {
  const ids = [CHURN, REVENUE, ORDERS, COST];

  it("has a row for each Metric, in the order of the Slot, with its latest value in the Number Style", () => {
    const body = rows(draw(ids));
    expect(body).toHaveLength(ids.length);
    ids.forEach((id, i) => {
      const m = data.metrics.find((x) => x.id === id)!;
      const last = shownSeries(m, data, undefined, {}).points.at(-1)!;
      expect(words(body[i])).toContain(m.name);
      expect(words(body[i])).toContain(formatValue(m, last.value, data.numberStyle));
    });
    // A comma-decimal Workspace writes its numbers that way, not as the browser would.
    expect(words(body[0])).toMatch(/\d,\d %/);
  });

  it("writes the change against the previous period as the core does, with an arrow and a sign and no colour of its own", () => {
    const html = draw(ids);
    ids.forEach((id, i) => {
      const m = data.metrics.find((x) => x.id === id)!;
      const c = compare(m, resolverFrom(data.metrics, data.series), { keys: ["prev"], yearStart: data.yearStart })[0];
      expect(words(rows(html)[i])).toContain(formatChange(c.pct, data.numberStyle));
    });
    // Churn fell: a down arrow and a minus, though lower is better there; no red or green on any change.
    const churn = rows(html)[0];
    expect(churn).toContain("−");
    expect(churn).toContain("m7 7 10 10");
    expect(churn).toContain("text-[var(--color-ink-2)]");
  });

  it("says on or off target in words for a Metric that has a Target Range, and nothing for one that has none", () => {
    const m = data.metrics.find((x) => x.id === CHURN)!;
    const last = shownSeries(m, data, undefined, {}).points.at(-1)!;
    // Revenue's made-up data has a Target Series; without it Revenue has no target at all.
    const body = rows(draw(ids, { window: 12 }, { ...data, targets: {} }));
    expect(words(body[0])).toContain(targetLabel(m.polarity, targetStatus(m, last.value)!));
    expect(words(body[1])).not.toMatch(/On target|Too low|Too high|Above target|Below target/);
  });

  it("judges a row by its Target Series for the latest value's period, and by the Target Range for other periods", () => {
    const m = data.metrics.find((x) => x.id === REVENUE)!;
    const last = shownSeries(m, data, undefined, {}).points.at(-1)!;
    const aimed = (period: string): CanvasData => ({ ...data, targets: { ...data.targets, [REVENUE]: [{ period, value: last.value * 2 }] } });
    const now = rows(draw([REVENUE, ORDERS, CHURN], { window: 12 }, aimed(last.period)))[0];
    expect(words(now)).toContain(targetLabel(m.polarity, "below"));
    expect(now).toContain(`against a target of ${targetText({ ...m, target_min: last.value * 2, target_max: null }, data.numberStyle)}`);
    // Revenue has no Target Range, so a target for another period leaves it unjudged.
    expect(words(rows(draw([REVENUE, ORDERS, CHURN], { window: 12 }, aimed("2020-01-01")))[0])).not.toMatch(/On target|Too low/);
  });

  it("says so for a Metric with no value yet, and draws the others", () => {
    const empty: CanvasData = { ...data, series: { ...data.series, "sample-orders": [] } };
    const body = rows(draw([REVENUE, ORDERS, CHURN], { window: 12 }, empty));
    expect(words(body[1])).toContain("Orders");
    expect(words(body[1])).toContain("No values yet");
    expect(words(body[0])).toContain("Revenue");
  });

  it("names the period of a Metric whose latest value is older than the others'", () => {
    const old: CanvasData = { ...data, series: { ...data.series, "sample-orders": data.series["sample-orders"].slice(0, -3) } };
    const html = draw([REVENUE, ORDERS, CHURN], { window: 12 }, old);
    expect(words(rows(html)[1])).toMatch(/March 2026/);
    expect(words(rows(html)[0])).not.toMatch(/June 2026/);
  });

  it("draws a trend for each row, with a text alternative", () => {
    const html = draw(ids);
    expect(html.match(/role="img"/g)).toHaveLength(ids.length);
    expect(html).toContain("over 12 periods");
    expect(draw(ids, { window: 6 })).toContain("over 6 periods");
  });

  it("refuses fewer than 3 and more than 12 Metrics, in words", () => {
    expect(words(draw([REVENUE, CHURN]))).toContain("A scoreboard needs 3 to 12 Metrics and this has 2");
    const many = Array.from({ length: 13 }, () => REVENUE);
    expect(words(draw(many))).toContain("A scoreboard shows 3 to 12 Metrics and this has 13");
    expect(rows(draw(Array.from({ length: 12 }, () => REVENUE)))).toHaveLength(12);
  });

  it("has a table caption for screen readers", () => {
    expect(draw(ids)).toContain("Scoreboard of 4 Metrics");
  });
});
