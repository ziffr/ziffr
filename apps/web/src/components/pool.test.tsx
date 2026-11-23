// @vitest-environment happy-dom
// A Metric's Preview in the Pool (#827): its ⓘ opens a card over the page with what the Metric counts and how it
// stands, and never adds anything to the list, so the rows below stay where they were.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { formatValue } from "@ziffr/core/format";

vi.mock("@/app/canvas-actions", () => ({ deleteSavedWidget: vi.fn() }));
// Server action modules the template menu imports, never called here.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/viewer", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/analyze", useSearchParams: () => new URLSearchParams() }));
import { Pool } from "./pool";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const data = sampleCanvasData("sara", "1,234.5");
const m = { ...data.metrics[0], description: "Money in from orders, before refunds." };
const shown = { ...data, metrics: [m, ...data.metrics.slice(1)] };
let host: HTMLElement; let root: Root;
const draw = (d: typeof shown) => root.render(<Pool data={d} saved={[]} metricsOnly onAdd={() => {}} hint="Drag metrics onto the canvas, or click +." />);
async function mount(d = shown) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { draw(d); });
}
const card = () => document.getElementById("pool-preview");
const info = () => host.querySelector<HTMLButtonElement>(`button[aria-label="Preview of ${m.name}"]`)!;
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("a Metric's Preview in the Pool", () => {
  it("opens over the page with its description, unit, period and latest value, and leaves the list as it was", async () => {
    await mount();
    const rows = host.querySelectorAll("li").length;
    await act(async () => { info().click(); });
    expect(host.querySelectorAll("li").length).toBe(rows);
    const c = card()!;
    expect(host.contains(c)).toBe(false);
    expect(info().getAttribute("aria-expanded")).toBe("true");
    expect(c.getAttribute("aria-label")).toBe(`About ${m.name}`);
    expect(c.textContent).toContain(m.description);
    const points = data.series[m.slug];
    expect(c.textContent).toContain(formatValue(m, points[points.length - 1].value, data.numberStyle));
    expect(c.textContent).toMatch(/Monthly/);
  });

  it("closes with its ⓘ again, with Escape, and with a tap elsewhere", async () => {
    await mount();
    await act(async () => { info().click(); });
    await act(async () => { info().click(); });
    expect(card()).toBeNull();
    await act(async () => { info().click(); });
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(card()).toBeNull();
    await act(async () => { info().click(); });
    await act(async () => { document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
    expect(card()).toBeNull();
  });

  it("shows the latest value once its series arrives after it opened", async () => {
    const { [m.slug]: points, ...others } = shown.series;
    await mount({ ...shown, series: others });
    await act(async () => { info().click(); });
    expect(card()!.textContent).toContain("No values yet");
    await act(async () => { draw(shown); });
    expect(card()!.textContent).toContain(formatValue(m, points[points.length - 1].value, data.numberStyle));
  });
});
