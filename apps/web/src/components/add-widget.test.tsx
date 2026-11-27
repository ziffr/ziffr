// @vitest-environment happy-dom
// A dashboard's Add widget panel (#1338): it offers the Note Widget, every style, the Metrics, saved widgets, templates
// and, only where the slide editor has a key, the free layout (#1359); + asks nothing for a style of one Metric; beside the dashboard a card is dragged, in the Slide-over it is tapped; and
// Escape closes it. Server actions and the drawings are replaced.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { Widget, WidgetTemplate } from "@ziffr/core/types";

const { deleteSavedWidget, slideKey } = vi.hoisted(() => ({ deleteSavedWidget: vi.fn<(id: number) => Promise<undefined>>(async () => undefined), slideKey: { set: true } }));
vi.mock("@/decks/slide-license", () => ({ useFreeLayouts: () => slideKey.set }));
vi.mock("@/app/canvas-actions", () => ({ deleteSavedWidget }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/dashboards/1" }));
// The drawings are tested in preview.test.tsx; the template menu imports server actions.
vi.mock("./preview", () => ({ Preview: () => <div data-testid="preview" />, TemplatePreview: () => <div data-testid="sample" /> }));
vi.mock("./template-menu", () => ({ TemplateMenu: () => null }));
vi.mock("./template-browser", () => ({ WhenVisible: ({ children }: { children: () => React.ReactNode }) => <div>{children()}</div> }));
import { AddWidget } from "./add-widget";
import { SlideOverProvider } from "./slide-over-host";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sample = sampleCanvasData("sara", "1,234.5");
const template = { id: 7, kind: "widget", name: "Revenue card", description: "One number to watch.", owner_id: "sara", view: "number", w: 3, h: 4, slots: [{ label: "The number", multiple: false }], body: { metricSlots: [0], settings: {} } } as unknown as WidgetTemplate;
const data = { ...sample, templates: [template] };
const metric = data.metrics.find((m) => m.period === "month" && !Object.keys(data.breakdowns[m.id] ?? {}).length)!;
const saved = [{ id: 31, template: "number", metric_ids: [metric.id], settings: {}, title: "My kept number", w: 3, h: 4 }, { id: 32, template: "canvas", metric_ids: [], settings: {}, title: "My kept layout", w: 8, h: 10 }] as unknown as Widget[];

let host: HTMLElement; let root: Root;
const onAdd = vi.fn(); const onClose = vi.fn(); const onPick = vi.fn(); const onDrag = vi.fn();
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
async function mount(docked: boolean) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => {
    root.render(<SlideOverProvider><AddWidget docked={docked} onClose={onClose} data={data} saved={saved} metricId={metric.id} onPick={onPick} onAdd={onAdd} onDrag={docked ? onDrag : undefined} /></SlideOverProvider>);
  });
  await tick();
}
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; vi.clearAllMocks(); slideKey.set = true; });

const button = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
const card = (id: string) => document.querySelector<HTMLElement>(`[data-card="${id}"]`)!;
const type = (value: string) => act(async () => {
  const input = document.querySelector<HTMLInputElement>("[aria-label='Search what you can add']")!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

describe("Add widget beside the dashboard", () => {
  it("shows the picked Metric, every section, and takes the focus", async () => {
    await mount(true);
    const panel = document.querySelector<HTMLElement>("aside[aria-label='Add widget']")!;
    expect(document.activeElement).toBe(panel);
    expect(panel.querySelector("select")!.value).toBe(String(metric.id));
    expect([...panel.querySelectorAll("section")].map((s) => s.getAttribute("aria-label"))).toEqual(["Your words", "Views", "Analyses", "Findings", "Metrics", "My Widgets", "The team’s templates", "Layout"]);
  });

  it("adds a note widget with no question and no Metric", async () => {
    await mount(true);
    await act(async () => { button("Add Note widget").click(); });
    expect(onAdd).toHaveBeenLastCalledWith({ type: "spec", template: "note", metricIds: [] }, [metric.id]);
  });

  it("offers no free layout, new or saved, where the slide editor has no key", async () => {
    slideKey.set = false;
    await mount(true);
    expect([...document.querySelectorAll("section")].map((s) => s.getAttribute("aria-label"))).not.toContain("Layout");
    expect(card("bcanvas")).toBeNull();
    expect(card("w32")).toBeNull();
    expect(card("w31")).not.toBeNull();
  });

  it("adds a style for one Metric with it and no question; one of several Metrics asks for its Slots, starting from it", async () => {
    await mount(true);
    await act(async () => { button("Add Line chart").click(); });
    expect(onAdd).toHaveBeenLastCalledWith({ type: "spec", template: "line", metricIds: [metric.id] }, [metric.id]);
    await act(async () => { button("Add Correlation").click(); });
    expect(onAdd).toHaveBeenLastCalledWith({ type: "spec", template: "correlation", metricIds: [] }, [metric.id]);
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it("adds a Metric, a saved widget and a team template", async () => {
    await mount(true);
    await act(async () => { button(`Add ${metric.name}`).click(); });
    expect(onAdd).toHaveBeenLastCalledWith({ type: "metric", id: metric.id }, [metric.id]);
    await act(async () => { button("Add My kept number").click(); });
    expect(onAdd).toHaveBeenLastCalledWith({ type: "widget", id: 31 }, [metric.id]);
    await act(async () => { button("Add Revenue card").click(); });
    expect(onAdd).toHaveBeenLastCalledWith({ type: "template", id: 7 }, [metric.id]);
  });

  it("carries a card to the dashboard, and a click on the card itself adds nothing", async () => {
    await mount(true);
    const bars = card("bbars");
    expect(bars.getAttribute("draggable")).toBe("true");
    const set = vi.fn();
    await act(async () => {
      const e = new Event("dragstart", { bubbles: true });
      Object.defineProperty(e, "dataTransfer", { value: { setData: set } });
      bars.dispatchEvent(e);
    });
    expect(onDrag).toHaveBeenLastCalledWith([metric.id]);
    expect(JSON.parse(set.mock.calls[0][1])).toEqual({ type: "spec", template: "bars", metricIds: [metric.id] });
    await act(async () => { bars.dispatchEvent(new Event("dragend", { bubbles: true })); });
    expect(onDrag).toHaveBeenLastCalledWith(null);
    await act(async () => { bars.click(); });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("searches everything it offers, and says when nothing matches", async () => {
    await mount(true);
    await type("kept");
    expect([...document.querySelectorAll("section")].map((s) => s.getAttribute("aria-label"))).toEqual(["My Widgets"]);
    await type("zzzz");
    expect(document.querySelectorAll("section")).toHaveLength(0);
    expect(document.querySelector("[role=status]")!.textContent).toBe("Nothing matches.");
  });

  it("takes a deleted saved widget away", async () => {
    await mount(true);
    await act(async () => { button("Delete My kept number").click(); }); await tick();
    expect(deleteSavedWidget).toHaveBeenCalledWith(31);
    expect(card("w31")).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("closes with its button and with Escape", async () => {
    await mount(true);
    await act(async () => { button("Close Add widget").click(); });
    await act(async () => { document.querySelector("select")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("Add widget in the Slide-over (a narrow screen)", () => {
  it("adds a card by tapping it, once, and nothing is dragged", async () => {
    await mount(false);
    expect(document.querySelector("[data-slide-over]")!.textContent).toContain("Tap a card to add it to the dashboard.");
    const bars = card("bbars");
    expect(bars.getAttribute("draggable")).toBeNull();
    await act(async () => { bars.click(); });
    expect(onAdd).toHaveBeenCalledTimes(1);
    await act(async () => { button("Add Bars per period").click(); });
    expect(onAdd).toHaveBeenCalledTimes(2);
  });
});
