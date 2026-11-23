// @vitest-environment happy-dom
// What a widget costs the page's budget of exact work (GLOSSARY: Widget, Dashboard; spec 0041): once, however often the widget is drawn again
// (a re-render of the page, a toggle of the basis back, a development build that draws everything twice). The budget is read by a probe next to the widgets.
import { act, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS } from "@ziffr/core/built-in-designs";
import type { RecipeBudget } from "@ziffr/core/design-analysis";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { PAGE_EXACT_BUDGET } from "@ziffr/core/work-bound";
import type { CanvasData } from "@ziffr/core/types";
import { DesignView } from "./design-view";
import { RecipeBudgetProvider, useRecipeBudget } from "./recipe-budget";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const data: CanvasData = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
let host: HTMLElement; let root: Root; let budget: RecipeBudget | null = null;
const Probe = () => { budget = useRecipeBudget(); return null; };
const spent = () => PAGE_EXACT_BUDGET - budget!.exact;
const ids = (n: number) => data.metrics.slice(0, n).map((m) => m.id);
type W = { design: "correlation" | "drivers"; ids: number[] };
// The Metrics are a new array at every call, as the page's widgets are given them at every render.
const page = (widgets: W[], pageData: unknown = data) => (
  <RecipeBudgetProvider data={pageData}>
    <Probe />
    {widgets.map((w, i) => <div key={i}><DesignView design={BUILT_IN_DESIGNS[w.design]} widget={{ metric_ids: w.ids, settings: {} }} metrics={w.ids.map((id) => data.metrics.find((m) => m.id === id)!)} data={data} /></div>)}
  </RecipeBudgetProvider>
);
const click = (label: string) => act(async () => { [...host.querySelectorAll("button")].find((b) => b.textContent === label)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
async function mount(tree: ReactElement) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(tree); });
}
afterEach(() => { act(() => root.unmount()); host.remove(); document.body.innerHTML = ""; budget = null; });

const one: W = { design: "correlation", ids: ids(2) };
describe("a widget's correlation work is charged to the page once", () => {
  it("is charged once however often the widget is drawn again, and the page keeps its answer", async () => {
    await mount(page([one]));
    const once = spent();
    expect(once).toBeGreaterThan(0);
    const text = host.textContent;
    for (let i = 0; i < 30; i++) await act(async () => { root.render(page([one])); });
    expect(spent()).toBe(once);
    expect(host.textContent).toBe(text);
    expect(host.textContent).not.toContain("Too much analysis");
  });
  it("is charged once under StrictMode, which runs everything twice", async () => {
    await mount(page([one]));
    const once = spent();
    await act(async () => { root.unmount(); });
    root = createRoot(host);
    await act(async () => { root.render(<StrictMode>{page([one])}</StrictMode>); });
    expect(spent()).toBe(once);
  });
  it("is charged for each different widget, and for the other basis once", async () => {
    await mount(page([one]));
    const first = spent();
    await act(async () => { root.render(page([one, { design: "drivers", ids: ids(3) }])); });
    const two = spent();
    expect(two).toBeGreaterThan(first);
    await click("Compare on the values as they are");
    const values = spent();
    expect(values).toBeGreaterThan(two);
    // Back to the first basis and to the second again: nothing more.
    await click("Remove growth again");
    await click("Compare on the values as they are");
    expect(spent()).toBe(values);
  });
  it("says the same at every draw where the page has nothing left", async () => {
    await mount(page([one]));
    budget!.exact = 0;
    await act(async () => { root.render(page([{ design: "drivers", ids: ids(3) }])); });
    const refused = host.textContent;
    expect(refused).toContain("Too much analysis on this Dashboard");
    for (let i = 0; i < 5; i++) await act(async () => { root.render(page([{ design: "drivers", ids: ids(3) }])); });
    expect(host.textContent).toBe(refused);
    expect(budget!.exact).toBe(0);
  });
});
