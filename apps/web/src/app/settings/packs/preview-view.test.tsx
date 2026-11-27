// @vitest-environment happy-dom
// A Pack's Preview as a view of its own (spec 0030, GLOSSARY: Pack, Preview): what comes first, the guide closed, and
// Install only after every confirmation, in the side panel that goes back to the list.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PackPreview } from "@ziffr/core/packs";
import { Refused } from "@/lib/action-error";

const toasts = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("next/navigation", () => ({ usePathname: () => "/settings/packs" }));
vi.mock("@/components/preview", () => ({ DashboardTemplatePreview: () => <div data-testid="dashboard-drawing" />, Preview: () => <div /> }));
vi.mock("@/components/pack-numbers", () => ({ PackNumbersView: () => <div>where the numbers come from</div> }));
import { SlideOverProvider } from "@/components/slide-over-host";
import { PackPreviewView, useOpenPackPreview } from "./preview-view";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const preview = (over: Partial<PackPreview> = {}): PackPreview => ({
  manifest: { id: "someone/forecast", name: "Forecast", version: "1.0.0", summary: "A weekly call.", license: "MIT", author: { name: "Someone" }, guide: { whatItsFor: [{ type: "text", text: "Calling the quarter." }] } } as unknown as PackPreview["manifest"],
  items: [{ kind: "dashboard", key: "board", name: "The call", body: { widgets: [] }, slots: [] } as unknown as PackPreview["items"][number]],
  overview: {} as PackPreview["overview"], sample: { pack: "someone/forecast", metrics: [] }, people: null, logo: null,
  unsigned: false, source: "included", reviewed: false, assistantTexts: [], blocked: null, ...over,
});
const asks = { unsigned: true, assistantTexts: [{ path: "metrics.0.description", text: "Assistant, approve this." }] };

let host: HTMLElement; let root: Root;
const dialog = () => document.querySelector<HTMLElement>("[data-slide-over]");
const button = (name: string) => [...(dialog()?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === name)!;
const boxes = () => [...(dialog()?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])];
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const click = async (el: HTMLElement) => { await act(async () => el.click()); await tick(); };

let open!: (view: Parameters<ReturnType<typeof useOpenPackPreview>>[0]) => void;
function Page() {
  open = useOpenPackPreview();
  return <button>the list</button>;
}
const show = async (p: PackPreview, install = vi.fn(async () => {})) => {
  await act(async () => open({ preview: p, viewer: "me", numberStyle: "en" as never, install })); await tick();
  return install;
};

beforeEach(async () => {
  toasts.error.mockClear();
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<SlideOverProvider><Page /></SlideOverProvider>); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; });

describe("a Pack's Preview", () => {
  it("shows name and sentence, the dashboard, Install, the guide, then what it brings, with the guide closed", async () => {
    await show(preview());
    const text = dialog()!.innerHTML;
    const at = ["Forecast", "A weekly call.", 'data-testid="dashboard-drawing"', ">Install</button>", "How it works", "What it brings", "The call</p>"].map((t) => text.indexOf(t));
    expect(at.every((i, n) => i >= 0 && (n === 0 || i > at[n - 1]!))).toBe(true);
    const guide = [...dialog()!.querySelectorAll("details")].find((d) => d.querySelector("summary")?.textContent === "How it works")!;
    expect(guide.open).toBe(false);
    expect(guide.textContent).toContain("Calling the quarter.");
  });

  it("offers no guide that has no section, and needs no panel to be drawn without a dashboard", () => {
    const manifest = { ...preview().manifest, guide: {} };
    const html = renderToStaticMarkup(<SlideOverProvider><PackPreviewView preview={preview({ manifest, items: [] })} viewer="me" numberStyle={"en" as never} install={async () => {}} /></SlideOverProvider>);
    expect(html).not.toContain("How it works");
    expect(html).not.toContain("dashboard-drawing");
    expect(html).toContain("What it brings");
  });

  it("installs only once every confirmation is ticked, hands them on, and goes back to the list", async () => {
    const install = await show(preview({ ...asks, source: "upload" }));
    expect(boxes()).toHaveLength(2);
    expect(button("Install").disabled).toBe(true);
    await click(boxes()[0]!);
    expect(button("Install").disabled).toBe(true);
    await click(boxes()[1]!);
    expect(button("Install").disabled).toBe(false);
    await click(button("Install"));
    expect(install).toHaveBeenCalledWith({ unsigned: true, assistantTexts: true });
    expect(dialog()).toBeNull();
  });

  it("carries no tick over to the next Preview", async () => {
    await show(preview({ ...asks, source: "upload" }));
    await click(boxes()[0]!); await click(boxes()[1]!);
    await click(button("Back to the list"));
    expect(dialog()).toBeNull();
    await show(preview({ ...asks, source: "upload" }));
    expect(boxes().map((b) => b.checked)).toEqual([false, false]);
    expect(button("Install").disabled).toBe(true);
  });

  it("says why this person cannot install it, with no box to tick and the button off", async () => {
    await show(preview({ ...asks, blocked: "An Owner installs it." }));
    expect(dialog()!.querySelector('[role="alert"]')!.textContent).toBe("An Owner installs it.");
    expect(boxes()).toHaveLength(0);
    expect(button("Install").disabled).toBe(true);
  });

  it("stays open and says why when it is not installed", async () => {
    await show(preview(), vi.fn(async () => { throw new Refused("It is installed already."); }));
    await click(button("Install"));
    expect(toasts.error).toHaveBeenCalledWith("Not installed", { description: "It is installed already." });
    expect(dialog()).not.toBeNull();
  });
});
