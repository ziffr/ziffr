// @vitest-environment happy-dom
// The bottom sheet of a phone (spec 0055, ticket #1131; GLOSSARY: Slide-over): which panels ask for it, what it adds,
// and that focus, Escape and `?panel=` work as in any Slide-over. The shape itself is CSS under 640px, which this
// environment does not lay out, so the classes that carry it are checked; a browser walk looks at the result.
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/metrics/revenue",
  useRouter: () => ({ refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/app/alert-actions", () => ({ createAlert: async () => ({}), updateAlert: async () => ({}), deleteAlert: async () => ({}) }));
import { AlertMe } from "./alerts";
import { SlideOverProvider, useSlideOver } from "./slide-over-host";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let api!: ReturnType<typeof useSlideOver>;
function Page() {
  api = useSlideOver();
  return <button>opener</button>;
}

let host: HTMLElement; let root: Root;
const sheet = () => document.querySelector<HTMLElement>("[data-slot='sheet-content']");
const grabBar = () => document.querySelector<HTMLElement>("[data-slot='sheet-grab-bar']");
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const escape = () => act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
const render = (ui: React.ReactNode) => act(async () => { root.render(ui); });

beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; window.history.replaceState(null, "", "/"); });

describe("a short panel in the host", () => {
  const mount = () => render(<SlideOverProvider><Page /></SlideOverProvider>);

  it("rises from the bottom on a phone, with a grab bar and a close button, and stays the right panel from 640px", async () => {
    await mount();
    await act(async () => api.open({ title: "Share", short: true, content: <button>inside</button> })); await tick();
    expect(sheet()!.dataset.short).toBe("true");
    expect(sheet()!.className).toContain("max-sm:data-open:slide-in-from-bottom");
    expect(sheet()!.className).toContain("max-sm:max-h-[85dvh]");
    expect(sheet()!.className).toContain("sm:data-open:slide-in-from-right");
    expect(sheet()!.className).toContain("sm:w-[26rem]");
    expect(grabBar()!.getAttribute("aria-hidden")).toBe("true");
    expect(grabBar()!.className).toContain("sm:hidden");
    expect([...sheet()!.querySelectorAll("button")].map((b) => b.textContent)).toContain("Close");
  });

  it("keeps the keys inside, closes with Escape and gives focus back", async () => {
    await mount();
    const opener = host.querySelector("button")!;
    opener.focus();
    await act(async () => api.open({ title: "Share", short: true, content: <button>inside</button> })); await tick();
    expect(sheet()!.contains(document.activeElement)).toBe(true);
    await escape(); await tick();
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("leaves a work panel full screen, and each step keeps its own shape", async () => {
    await mount();
    await act(async () => api.open({ title: "Help", content: <p>chapter</p> })); await tick();
    expect(sheet()!.dataset.short).toBeUndefined();
    expect(sheet()!.className).not.toContain("max-sm:top-auto");
    expect(sheet()!.className).toContain("data-open:slide-in-from-right");
    expect(grabBar()).toBeNull();
    await act(async () => api.open({ title: "Share", short: true, content: <p>people</p> })); await tick();
    expect(sheet()!.dataset.short).toBe("true");
    await act(async () => api.back()); await tick();
    expect(sheet()!.dataset.short).toBeUndefined();
    expect(grabBar()).toBeNull();
  });
});

describe("a sheet that is a bottom menu at every width it shows", () => {
  it("has the same grab bar, not hidden by width", async () => {
    await render(<Sheet open><SheetContent side="bottom"><SheetTitle>More</SheetTitle></SheetContent></Sheet>); await tick();
    expect(grabBar()!.className).not.toContain("sm:hidden");
  });
});

describe("Alert me…", () => {
  const choices = { held: { person: 0, metric: 0, perPerson: 50, perMetric: 5 }, unavailable: {}, archived: false };
  function Screen() {
    const [, again] = useState(0);
    return <><button onClick={() => again((n) => n + 1)}>rerender</button><AlertMe metric={{ id: 1, name: "Revenue" }} mine={[]} choices={choices} webhooks={[]} /></>;
  }

  it("opens as a short sheet from ?panel=alert and takes the address back on Escape", async () => {
    window.history.replaceState(null, "", "/metrics/revenue?panel=alert");
    await render(<Screen />); await tick();
    expect(sheet()!.dataset.short).toBe("true");
    expect(sheet()!.textContent).toContain("Alert me about Revenue");
    expect(sheet()!.contains(document.activeElement)).toBe(true);
    await escape(); await tick();
    expect(new URL(window.location.href).searchParams.has("panel")).toBe(false);
  });
});
