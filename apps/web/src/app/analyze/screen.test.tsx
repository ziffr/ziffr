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
const explain = vi.fn(async (id: number) => { void id; return {}; });
const listed = vi.fn(async (ids: number[], mark?: number | null) => { void ids; void mark; return { canvas: [], groups: [] }; });
vi.mock("@/app/picker-actions", () => ({ pickerList: (ids: number[], mark?: number | null) => listed(ids, mark), pickerRun: async () => ({ ok: false, message: "" }) }));
vi.mock("@/app/canvas-actions", () => ({
  canvasExplain: (id: number) => explain(id),
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
import { SlideOverProvider } from "@/components/slide-over-host";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const data = sampleCanvasData("sara", "1,234.5");
const first = data.metrics[0];
let host: HTMLElement; let root: Root;
async function mount(demo: boolean, onCanvas: number[] = [], explained: number | null = null) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<SlideOverProvider><AnalyzeScreen data={data} onCanvas={onCanvas} explained={explained} demo={demo} /></SlideOverProvider>); });
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
    const canvas = host.querySelector<HTMLElement>("[data-canvas]")!;
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

// The Metric to explain (#988): its own mark, shown in words, never the order of the Metrics.
describe("the Metric to explain", () => {
  const [a, b, c] = data.metrics;
  const role = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label$="${name} the one to explain"], button[aria-label="${name} is the one to explain"]`)!;
  const pressed = () => [...host.querySelectorAll("button[aria-pressed='true'][aria-label$='is the one to explain']")].map((x) => x.getAttribute("aria-label")!.replace(" is the one to explain", ""));
  // The picker is asked for the list with the Metric to explain, which starts its Slots.
  const askedWith = async () => { await act(async () => { [...host.querySelectorAll("button")].find((x) => x.textContent?.includes("Choose a method"))!.click(); }); return listed.mock.calls.at(-1)![1]; };

  it("is the first Metric when none is marked, and the marked one wherever it stands, in words", async () => {
    await mount(false, [a.id, b.id, c.id]);
    expect(pressed()).toEqual([a.name]);
    expect(role(b.name).getAttribute("aria-pressed")).toBe("false");
    expect(role(b.name).getAttribute("aria-label")).toBe(`Make ${b.name} the one to explain`);
    expect(await askedWith()).toBe(a.id);
  });

  it("follows the mark, not the order, and the picker is asked with it", async () => {
    await mount(false, [a.id, b.id, c.id], b.id);
    expect(pressed()).toEqual([b.name]);
    expect(await askedWith()).toBe(b.id);
    expect(host.textContent).toContain("Compared with");
  });

  it("is asked of the server when another is chosen, and in the demo is kept on the page with nothing deleted", async () => {
    await mount(false, [a.id, b.id, c.id]);
    await act(async () => { role(c.name).click(); });
    expect(explain).toHaveBeenCalledWith(c.id);
    expect(onCanvas()).toEqual([a.name, b.name, c.name]);
    act(() => root.unmount()); host.remove();
    await mount(true, [a.id, b.id, c.id]);
    await act(async () => { role(b.name).click(); });
    expect(pressed()).toEqual([b.name]);
    expect(onCanvas()).toEqual([a.name, b.name, c.name]);
    expect(explain).toHaveBeenCalledTimes(1);
  });

  it("moves to the next Metric when the marked one is taken off, and is the only Metric when one is left", async () => {
    await mount(true, [a.id, b.id, c.id], b.id);
    await act(async () => { button(`Take ${b.name} off the canvas`).click(); });
    expect(pressed()).toEqual([c.name]);
    await act(async () => { button(`Take ${c.name} off the canvas`).click(); });
    expect(host.textContent).toContain("The one to explain");
    expect(pressed()).toEqual([]);
  });
});

describe("the front door", () => {
  it("opens the picker on an empty canvas, says so, and offers no locked tile", async () => {
    await mount(true);
    expect(host.textContent).toContain("Drop Metrics here, or choose a method.");
    expect(host.querySelector("section[aria-label='Choose a method']")).not.toBeNull();
    expect(host.textContent).not.toMatch(/Forecast|Correlation matrix|What drives/);
  });

  it("keeps the picker shut with Metrics on the canvas until it is asked for, and then opens it", async () => {
    await mount(true, [first.id]);
    expect(host.querySelector("section[aria-label='Choose a method']")).toBeNull();
    const choose = [...host.querySelectorAll("button")].find((x) => x.textContent?.includes("Choose a method"))!;
    await act(async () => { choose.click(); });
    expect(host.querySelector("section[aria-label='Choose a method']")).not.toBeNull();
  });
});
