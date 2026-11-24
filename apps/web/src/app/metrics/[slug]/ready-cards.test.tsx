// What is ready for a Metric (ticket #988): the forecast first and largest with its chart words and a widget action, the others after it,
// and nothing at all where no analysis answers.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReadyCard } from "@ziffr/core/analysis-picker";
import type { Takeaway } from "@ziffr/core/takeaways/takeaway";
import type { Metric } from "@ziffr/core/types";
vi.mock("server-only", () => ({}));
vi.mock("@/app/canvas-actions", () => ({ saveToPool: vi.fn() }));
vi.mock("sonner", () => ({ toast: {} }));
vi.mock("./forecast-chart", () => ({ ForecastChart: () => <div data-chart="forecast" /> }));
import { ReadyCards } from "./ready-cards";

const takeaway = (sentence: string): Takeaway => ({ kind: "answer", method: "x", sentence, refusal: null, strength: null, strengthText: null, range: null, basis: null, assumptions: [], cautions: [], notes: [], track: null, footer: "This carries the past forward; it is not a promise.", figures: [], numbers: [] });
const card = (entry: ReadyCard["entry"], title: string, widget: ReadyCard["widget"] = null): ReadyCard => ({ entry, title, takeaway: takeaway(`Sentence of ${title}`), widget });
const metric = { id: 1, name: "Orders", slug: "orders", period: "month" } as Metric;
const draw = (cards: ReadyCard[]) => renderToStaticMarkup(<ReadyCards cards={cards} metric={metric} points={[]} forecast={[]} numberStyle={"1,234.5" as never} yearStart={1 as never} />);

describe("the cards ready for a Metric", () => {
  it("puts the forecast first, with its chart and its widget action, whatever the order given", () => {
    const html = draw([card("usual", "What is usual for Orders? Is this value unusual?"), card("forecast", "Where is Orders heading?", { template: "forecast", metricIds: [1], showTarget: false })]);
    expect(html).toContain("Ready for Orders");
    expect(html.indexOf("Where is Orders heading?")).toBeLessThan(html.indexOf("What is usual for Orders"));
    expect(html).toContain('data-chart="forecast"');
    expect(html).toContain("Save as widget");
  });

  it("offers no widget action where there is no widget, and says nothing at all when nothing answers", () => {
    expect(draw([card("usual", "What is usual for Orders? Is this value unusual?")])).not.toContain("Save as widget");
    expect(draw([])).toBe("");
  });
});
