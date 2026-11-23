// @vitest-environment happy-dom
// The built-in Views draw as they did before they became View Designs (spec 0024, #147). Each case draws a widget
// with Sample Data in a browser-like document and compares what is drawn with the file kept in __drawings__, made by
// the Views as they were written before the renderer: every mark's shape, position and colour, every text, every
// title and every data- attribute. Layout classes are left out (they are styling, checked in the running app).
import { act, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { CanvasData, Metric, Point, TemplateId, WidgetSettings } from "@ziffr/core/types";
import { shiftPeriod } from "@ziffr/core/periods";
import { WidgetBody } from "./widget-body";

// Charts measure their box in a browser; here every chart gets the same fixed size.
vi.mock("recharts", async (orig) => {
  const real = await orig<typeof import("recharts")>();
  const Fixed = ({ children }: { children: ReactNode }) => (isValidElement(children) ? cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 480, height: 240 }) : null);
  return { ...real, ResponsiveContainer: Fixed };
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The SVG elements that draw something, and the HTML ones that hold values.
const DRAWN = new Set(["path", "circle", "line", "rect", "text", "tspan", "pattern", "polygon", "polyline", "ellipse", "table", "tr", "td", "th", "li"]);
const BLOCKS = new Set(["div", "p", "ul", "svg", "tbody", "thead", "table"]);
// Ids depend on the order React hands them out, not on the drawing.
const LEFT_OUT = new Set(["class", "id", "data-recharts-item-id","clip-path", "tabindex", "xmlns", "role", "aria-label", "aria-hidden"]);

/** What a widget draws, one line per mark, text or value, independent of the markup that holds them. */
function drawing(root: Element): string {
  const out: string[] = [];
  // Text is compared as it reads: a run of text across inline markup is one line, however it is split into nodes.
  let run = "";
  const flush = () => {
    const t = run.replace(/\s+/g, " ").trim();
    if (t) out.push(`"${t}"`);
    run = "";
  };
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      run += n.textContent ?? "";
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    // A tooltip shows only on hover, and a path without a shape draws nothing.
    if (el.classList.contains("recharts-tooltip-wrapper") || (tag === "path" && !el.getAttribute("d"))) return;
    const attrs = [...el.attributes]
      .filter((a) => !LEFT_OUT.has(a.name) && (DRAWN.has(tag) || a.name === "title" || a.name.startsWith("data-") || (a.name === "style" && /background|width/.test(a.value) && !/position|cursor/.test(a.value))))
      .map((a) => `${a.name}=${a.value.replace(/url\(#[^)]*\)/g, "url(#)")}`)
      .sort();
    // A block (or anything drawn) ends a run of text; inline markup does not.
    const block = DRAWN.has(tag) || attrs.length > 0 || BLOCKS.has(tag);
    if (block) flush();
    if (DRAWN.has(tag) || attrs.length) out.push(`<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`);
    el.childNodes.forEach(walk);
    if (block) flush();
  };
  walk(root);
  flush();
  return `${out.join("\n")}\n`;
}

async function draw(template: TemplateId, metricIds: number[], settings: WidgetSettings, data: CanvasData) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<WidgetBody widget={{ template, metric_ids: metricIds, settings }} data={data} />));
  const out = drawing(el);
  act(() => root.unmount());
  el.remove();
  return out;
}

// Fixed "today", so a span to date stays one: the last sample month is June 2026.
const base = (style: CanvasData["numberStyle"] = "1,234.5"): CanvasData => ({ ...sampleCanvasData("v", style), today: "2026-06-20" });
const REVENUE = -1, ORDERS = -2, CUSTOMERS = -3, CHURN = -4, COST = -5;
const withMetric = (d: CanvasData, id: number, change: Partial<Metric>): CanvasData => ({ ...d, metrics: d.metrics.map((m) => (m.id === id ? { ...m, ...change } : m)) });
const withSeries = (d: CanvasData, id: number, points: Point[]): CanvasData => {
  const slug = d.metrics.find((m) => m.id === id)!.slug;
  return { ...d, series: { ...d.series, [slug]: points } };
};
// Sixty months, more than a line draws dots for.
const long = (d: CanvasData) => withSeries(d, REVENUE, Array.from({ length: 60 }, (_, i) => ({ period: shiftPeriod("2021-07-01", "month", i), value: 80000 + 900 * i + (i % 7) * 1500 })));
const band = (d: CanvasData) => withMetric(d, REVENUE, { target_min: 100000, target_max: 130000 });
const pending = (d: CanvasData): CanvasData => ({ ...d, pending: { [REVENUE]: ["2026-06-01"] }, locked: { [REVENUE]: ["2026-04-01", "2026-03-01"] } });

const CASES: [string, TemplateId, number[], WidgetSettings, CanvasData][] = [
  ["number", "number", [REVENUE], { window: 12 }, base()],
  ["number-churn", "number", [CHURN], { window: 12 }, base()],
  ["number-quarter", "number", [REVENUE], { window: 12, display: "quarter" }, base()],
  ["number-pending", "number", [REVENUE], { window: 12 }, pending(base())],
  ["number-comma", "number", [REVENUE], { window: 6 }, base("1.234,5")],
  ["number-empty", "number", [REVENUE], { window: 12 }, withSeries(base(), REVENUE, [])],
  ["number-one", "number", [REVENUE], { window: 12 }, withSeries(base(), REVENUE, [{ period: "2026-06-01", value: 5 }])],
  ["line", "line", [REVENUE], { window: 12, showTarget: true, showForecast: false }, base()],
  ["line-window", "line", [REVENUE], { window: 6, showTarget: true }, base()],
  ["line-band", "line", [REVENUE], { window: 12, showTarget: true }, band(base())],
  ["line-band-off", "line", [REVENUE], { window: 12, showTarget: false }, band(base())],
  ["line-churn", "line", [CHURN], { window: 12, showTarget: true }, base()],
  ["line-forecast", "line", [REVENUE], { window: 12, showTarget: true, showForecast: true }, band(base())],
  ["line-quarter", "line", [REVENUE], { window: 8, showTarget: true, display: "quarter" }, base()],
  ["line-quarter-customers", "line", [CUSTOMERS], { window: 8, showTarget: true, showForecast: true, display: "quarter" }, base()],
  ["line-long", "line", [REVENUE], { window: 48, showTarget: true }, long(base())],
  ["line-snapshot", "line", [REVENUE], { window: 12, showTarget: true, asOf: "2026-03-31" }, base()],
  ["line-weeks", "line", [ORDERS], { window: 24, showTarget: true }, { ...sampleCanvasData("v", "1,234.5", "week"), today: "2026-06-03" }],
  ["bars", "bars", [REVENUE], { window: 12, showTarget: true }, base()],
  ["bars-band", "bars", [REVENUE], { window: 12, showTarget: true }, band(base())],
  ["bars-band-off", "bars", [REVENUE], { window: 12, showTarget: false }, band(base())],
  ["bars-churn", "bars", [CHURN], { window: 12, showTarget: true }, base()],
  ["bars-quarter", "bars", [CUSTOMERS], { window: 8, showTarget: true, display: "quarter" }, base()],
  ["gauge", "gauge", [REVENUE], {}, base()],
  ["gauge-churn", "gauge", [CHURN], {}, base()],
  ["gauge-band", "gauge", [REVENUE], {}, band(base())],
  ["gauge-empty", "gauge", [REVENUE], {}, withSeries(base(), REVENUE, [])],
  ["table", "table", [REVENUE], { rows: 6 }, base()],
  ["table-pending", "table", [REVENUE], { rows: 4 }, pending(band(base()))],
  ["table-churn", "table", [CHURN], { rows: 6 }, base()],
  ["table-quarter", "table", [REVENUE], { rows: 6, display: "quarter" }, pending(base())],
  ["forecast", "forecast", [REVENUE], { window: 18 }, base()],
  ["forecast-band", "forecast", [REVENUE], { window: 18 }, band(base())],
  ["forecast-quarter", "forecast", [COST], { window: 8, display: "quarter" }, base()],
  ["forecast-short", "forecast", [REVENUE], { window: 18 }, withSeries(base(), REVENUE, base().series["sample-revenue"].slice(-3))],
  ["correlation", "correlation", [REVENUE, ORDERS], {}, base()],
  ["correlation-churn", "correlation", [CHURN, COST], {}, base()],
  ["correlation-one", "correlation", [REVENUE], {}, base()],
  ["correlation-short", "correlation", [REVENUE, ORDERS], {}, withSeries(base(), ORDERS, base().series["sample-orders"].slice(-4))],
  ["matrix", "matrix", [REVENUE, ORDERS, CHURN], {}, base()],
  ["matrix-all", "matrix", [REVENUE, ORDERS, CUSTOMERS, CHURN, COST], {}, base()],
  ["matrix-one", "matrix", [REVENUE], {}, base()],
  ["drivers", "drivers", [REVENUE, ORDERS, CUSTOMERS, CHURN, COST], {}, base()],
  ["drivers-alone", "drivers", [REVENUE], {}, base()],
  ["drivers-comma", "drivers", [COST, REVENUE, CHURN], {}, base("1.234,5")],
  ["running-total", "running-total", [REVENUE], { showTarget: true }, base()],
  ["running-total-no-plan", "running-total", [ORDERS], { showTarget: true }, base()],
  ["running-total-plan-off", "running-total", [REVENUE], { showTarget: false }, base()],
  ["running-total-not-sum", "running-total", [CHURN], { showTarget: true }, base()],
  ["running-total-comma", "running-total", [COST], { showTarget: true }, withMetric(base("1.234,5"), COST, { target_max: 60000 })],
];

describe("the built-in Views draw as before", () => {
  it.each(CASES)("%s", async (name, template, ids, settings, data) => {
    await expect(await draw(template, ids, settings, data)).toMatchFileSnapshot(`__drawings__/${name}.txt`);
  });
});
