// @vitest-environment happy-dom
// The Heads-ups block on Analyze (ticket #1068; the owner's words of 2026-11-27): a bordered block with the heading and the count, none
// when there are none, the list in the side panel behind a button (or `?panel=headsups`).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MyHeadsUps } from "@ziffr/core/heads-up-state";

let search = "";
let heads: MyHeadsUps | null = null;
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/analyze", useSearchParams: () => new URLSearchParams(search) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/heads-up-actions", () => ({ markHeadsUpNotUseful: vi.fn(async () => ({})), muteHeadsUpMetric: vi.fn(async () => ({})) }));
vi.mock("@ziffr/core/heads-up-state", () => ({ myHeadsUps: async () => { if (heads === null) throw new Error("no"); return heads; } }));
import { SlideOverProvider } from "@/components/slide-over-host";
import { HeadsUpsHint } from "./heads-up-hint";
import { HeadsUpsSection } from "./heads-ups";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLElement; let root: Root;
async function show(node: React.ReactNode) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<SlideOverProvider>{node}</SlideOverProvider>); });
}
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); search = ""; heads = null; });
const item = (key: string, sentence: string) => ({ key, named: [{ id: 1, name: "Cost" }], takeaway: { kind: "answer", method: "x", sentence, refusal: null, strength: null, strengthText: null, range: null, basis: null, assumptions: [], cautions: [], notes: [], track: null, footer: null, figures: [], numbers: [] } }) as never;
const panel = () => document.querySelector("[data-slide-over]");

describe("the block on the page", () => {
  it("has the heading, the count and a Look button; the list is in the panel only once it is asked for, and the page holds no list", async () => {
    heads = { on: true, items: [item("a", "Cost and Visits have started moving together."), item("b", "Signups turned around.")] } as MyHeadsUps;
    await show(await HeadsUpsSection({ actor: {} as never, demo: false }));
    expect(host.querySelector("section h2")!.textContent!.trim()).toBe("Heads-ups 2");
    // No list and none of the words of a Heads-up on the page.
    expect(host.querySelector("ul")).toBeNull();
    expect(host.textContent).not.toContain("started moving together");
    expect(panel()).toBeNull();
    const look = [...host.querySelectorAll("button")].find((b) => b.textContent === "Look")!;
    await act(async () => { look.click(); });
    expect(panel()!.textContent).toContain("Heads-ups");
    expect(panel()!.textContent).toContain("Cost and Visits have started moving together.");
    expect(panel()!.textContent).toContain("Signups turned around.");
    expect(panel()!.textContent).toContain("Mute Cost");
  });

  it("shows nothing when there are none", async () => {
    heads = { on: true, items: [] } as MyHeadsUps;
    await show(await HeadsUpsSection({ actor: {} as never, demo: false }));
    expect(host.textContent).toBe("");
  });

  it("says they are off for the person and where to turn them on, and does not guess why when they could not be read", async () => {
    heads = { on: false, items: [] } as unknown as MyHeadsUps;
    await show(await HeadsUpsSection({ actor: {} as never, demo: false }));
    expect(host.textContent).toContain("You turned Heads-ups off for yourself.");
    expect(host.querySelector("a")!.getAttribute("href")).toBe("/settings/deliveries");
    act(() => root.unmount()); host.remove();
    heads = null;
    await show(await HeadsUpsSection({ actor: {} as never, demo: false }));
    expect(host.textContent).toContain("could not be read just now");
    expect(host.textContent!.trim()).toBe("Heads-ups Heads-ups could not be read just now.");
  });

  it("opens the list when the address says ?panel=headsups", async () => {
    search = "panel=headsups";
    await show(<HeadsUpsHint state={{ kind: "count", count: 1 }}><p>The one Heads-up.</p></HeadsUpsHint>);
    expect(panel()!.textContent).toContain("The one Heads-up.");
  });

  it("does not open an empty panel for ?panel=headsups when there is nothing to look at", async () => {
    search = "panel=headsups";
    await show(<HeadsUpsHint state={{ kind: "count", count: 0 }}><p>Nothing.</p></HeadsUpsHint>);
    expect(panel()).toBeNull();
  });
});
