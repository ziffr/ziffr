// @vitest-environment happy-dom
// The side panel host (spec 0050, ticket #922): open, replace, back, close, Escape and where focus goes.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let path = "/dashboards/1";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
import { SlideOverProvider, useSlideOver } from "./slide-over-host";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let api!: ReturnType<typeof useSlideOver>;
function Page() {
  api = useSlideOver();
  return <button>open share</button>;
}

let host: HTMLElement; let root: Root;
const dialog = () => document.querySelector<HTMLElement>("[data-slide-over]");
const labels = () => [...(dialog()?.querySelectorAll("button") ?? [])].map((b) => b.textContent ?? "");
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const render = () => act(async () => { root.render(<SlideOverProvider><Page /></SlideOverProvider>); });
const share = { title: "Share", description: "Who can see it", content: <button>inside share</button> };

beforeEach(async () => {
  path = "/dashboards/1";
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; });

describe("SlideOverProvider", () => {
  it("is closed until something opens it, then names itself by its title", async () => {
    expect(dialog()).toBeNull();
    await act(async () => api.open(share)); await tick();
    expect(dialog()).not.toBeNull();
    expect(document.getElementById(dialog()!.getAttribute("aria-labelledby")!)!.textContent).toBe("Share");
    expect(dialog()!.textContent).toContain("Who can see it");
    expect(dialog()!.textContent).toContain("inside share");
  });

  it("moves focus into the panel when it opens", async () => {
    await act(async () => api.open(share)); await tick();
    expect(dialog()!.contains(document.activeElement)).toBe(true);
  });

  it("opening another one replaces the first, and Back returns to it; with none left Back is not offered", async () => {
    await act(async () => api.open({ title: "One", content: <p>first</p> }));
    expect(labels()).not.toContain("Back");
    await act(async () => api.open({ title: "Two", content: <p>second</p> })); await tick();
    expect(dialog()!.textContent).toContain("second");
    expect(dialog()!.textContent).not.toContain("first");
    await act(async () => { [...dialog()!.querySelectorAll("button")].find((b) => b.textContent?.includes("Back"))!.click(); }); await tick();
    expect(dialog()!.textContent).toContain("first");
    expect(labels()).not.toContain("Back");
    await act(async () => api.back()); await tick();
    expect(dialog()).toBeNull();
  });

  it("replace swaps the content without keeping a step back", async () => {
    await act(async () => api.open({ title: "One", content: <p>first</p> }));
    await act(async () => api.replace({ title: "Swapped", content: <p>swapped body</p> })); await tick();
    expect(dialog()!.textContent).toContain("swapped body");
    expect(labels().some((l) => l.includes("Back"))).toBe(false);
  });

  it("closes with Escape and returns focus to the button that opened it", async () => {
    const opener = host.querySelector("button")!;
    opener.focus();
    await act(async () => api.open(share)); await tick();
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await tick();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes with its close button and with close(), and forgets its steps", async () => {
    const opener = host.querySelector("button")!;
    opener.focus();
    await act(async () => api.open({ title: "One", content: <p>first</p> }));
    await act(async () => api.open({ title: "Two", content: <p>second</p> })); await tick();
    await act(async () => { [...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "Close")!.click(); }); await tick();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
    await act(async () => api.open(share)); await tick();
    expect(labels()).not.toContain("Back");
    await act(async () => api.close()); await tick();
    expect(dialog()).toBeNull();
    expect(api.isOpen).toBe(false);
  });

  it("closes when the person goes to another page", async () => {
    await act(async () => api.open(share)); await tick();
    path = "/metrics/revenue";
    await render(); await tick();
    expect(dialog()).toBeNull();
  });

  it("refuses to be used outside the app shell", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lone = createRoot(document.createElement("div"));
    expect(() => act(() => { lone.render(<Page />); })).toThrow(/SlideOverProvider/);
    err.mockRestore();
  });
});
