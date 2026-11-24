// @vitest-environment happy-dom
// The Heads-ups hint on Analyze (ticket #1068): a slim line under the title says how many there are, the list is in the side panel
// behind a button (or `?panel=headsups`), and the old full-width list on the page is gone.
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
import { HeadsUpsHint, hintWords } from "./heads-up-hint";
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

describe("the hint's words", () => {
  it("count the Heads-ups, say when there are none, when they are off for the person, and when they could not be read", () => {
    expect(hintWords({ kind: "count", count: 3 })).toEqual({ text: "3 Heads-ups for you.", look: true });
    expect(hintWords({ kind: "count", count: 1 })).toEqual({ text: "1 Heads-up for you.", look: true });
    expect(hintWords({ kind: "count", count: 0 })).toEqual({ text: "No Heads-ups right now.", look: false });
    expect(hintWords({ kind: "off" }).look).toBe(false);
    expect(hintWords({ kind: "unread" })).toEqual({ text: "Heads-ups could not be read just now.", look: false });
  });
});

describe("the hint on the page", () => {
  it("is one line with a Look button; the list is in the panel only once it is asked for, and the page holds no list", async () => {
    heads = { on: true, items: [item("a", "Cost and Visits have started moving together."), item("b", "Signups turned around.")] } as MyHeadsUps;
    await show(await HeadsUpsSection({ actor: {} as never, demo: false }));
    expect(host.textContent).toContain("2 Heads-ups for you.");
    // The old block is gone: no heading, no list, none of the words of a Heads-up on the page.
    expect(host.querySelector("#heads-ups, #heads-ups-heading, ul")).toBeNull();
    expect(host.textContent).not.toContain("started moving together");
    expect(panel()).toBeNull();
    const look = [...host.querySelectorAll("button")].find((b) => b.textContent === "Look")!;
    await act(async () => { look.click(); });
    expect(panel()!.textContent).toContain("Heads-ups");
    expect(panel()!.textContent).toContain("Cost and Visits have started moving together.");
    expect(panel()!.textContent).toContain("Signups turned around.");
    expect(panel()!.textContent).toContain("Mute Cost");
  });

  it("says when there are none, with no button", async () => {
    heads = { on: true, items: [] } as MyHeadsUps;
    await show(await HeadsUpsSection({ actor: {} as never, demo: false }));
    expect(host.textContent).toContain("No Heads-ups right now.");
    expect(host.querySelector("button")).toBeNull();
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
    expect(host.textContent).toBe("Heads-ups could not be read just now.");
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
