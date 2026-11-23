// @vitest-environment happy-dom
// Adding a Metric to the Analysis Canvas (#827). Outside the demo the server keeps the canvas; in the demo its
// database refuses every write, so the canvas must take the Metric without asking the server, or nothing ever lands.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";

const refused = { error: "The demo is read-only." };
const add = vi.fn(async (ids: number[]) => { void ids; return refused; });
const set = vi.fn(async (ids: number[]) => { void ids; return refused; });
const remove = vi.fn(async (id: number) => { void id; return refused; });
const shownError = vi.fn();
vi.mock("@/app/canvas-actions", () => ({
  canvasAdd: (ids: number[]) => add(ids),
  canvasSet: (ids: number[]) => set(ids),
  canvasRemove: (id: number) => remove(id),
  deleteSavedWidget: vi.fn(),
}));
// Server action modules the Pool and widgets import, never called here.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/viewer", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/analyze", useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { error: (t: string, o?: { description?: string }) => shownError(o?.description ?? t), info: vi.fn(), success: vi.fn() } }));
import { AnalyzeScreen } from "./screen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const data = sampleCanvasData("sara", "1,234.5");
const first = data.metrics[0];
let host: HTMLElement; let root: Root;
async function mount(demo: boolean, onCanvas: number[] = []) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<AnalyzeScreen data={data} onCanvas={onCanvas} targets={[]} demo={demo} />); });
}
const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const onCanvas = () => [...host.querySelectorAll("button[aria-label^='Take ']")].map((b) => b.getAttribute("aria-label")!.replace(/^Take | off the canvas$/g, ""));
afterEach(() => { act(() => root.unmount()); host.remove(); add.mockClear(); set.mockClear(); remove.mockClear(); shownError.mockClear(); });

describe("adding a Metric to the Analysis Canvas", () => {
  it("in the demo, + puts it on the canvas without asking the server", async () => {
    await mount(true);
    await act(async () => { button(`Add ${first.name}`).click(); });
    expect(onCanvas()).toEqual([first.name]);
    expect(add).not.toHaveBeenCalled();
    expect(shownError).not.toHaveBeenCalled();
  });

  it("in the demo, a drop from the Pool lands too, once, and the × takes it off again", async () => {
    await mount(true);
    const canvas = host.querySelector<HTMLElement>(".desk")!;
    const dropped = () => {
      const e = new Event("drop", { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
      e.dataTransfer = { getData: () => JSON.stringify({ type: "metric", id: first.id }) };
      return e;
    };
    await act(async () => { canvas.dispatchEvent(dropped()); });
    await act(async () => { canvas.dispatchEvent(dropped()); });
    expect(onCanvas()).toEqual([first.name]);
    await act(async () => { button(`Take ${first.name} off the canvas`).click(); });
    expect(onCanvas()).toEqual([]);
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("outside the demo, + asks the server, which keeps the canvas, and says why when it refuses", async () => {
    await mount(false);
    await act(async () => { button(`Add ${first.name}`).click(); });
    expect(add).toHaveBeenCalledWith([first.id]);
    expect(shownError).toHaveBeenCalledWith(refused.error);
    // What is drawn is what the server sends: nothing, until the page comes back with the Metric on it.
    expect(onCanvas()).toEqual([]);
  });
});
