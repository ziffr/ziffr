// @vitest-environment happy-dom
// Help in the side panel (spec 0050, ticket #924): the "?" button opens the chapter for the screen you are on, the search
// box (which has a label) lists results with their chapter and section as links, and focus goes back to the button on close.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HelpIndex } from "@/lib/help-index-build";

let path = "/metrics";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
const index: HelpIndex = {
  chapters: [
    { slug: "metrics", title: "The Metrics screens", part: null, sections: [
      { id: "", heading: "The Metrics screens", text: "Metrics are the numbers you keep." },
      { id: "the-metrics-list", heading: "The Metrics list", text: "Each row has a Quick look button." },
    ] },
    { slug: "packs", title: "Packs", part: null, sections: [{ id: "install-a-pack", heading: "Install a Pack", text: "Browse the marketplace and install." }] },
  ],
};
vi.mock("@/lib/help-index.generated.json", () => ({ default: index }));
import { SlideOverProvider } from "./slide-over-host";
import { HelpButton } from "./help-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement; let root: Root;
const dialog = () => document.querySelector<HTMLElement>("[data-slide-over]");
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
const button = () => host.querySelector<HTMLButtonElement>("button[aria-label='Help for this screen']")!;
function type(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(async () => {
  path = "/metrics";
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<SlideOverProvider><HelpButton guide="/guide" /></SlideOverProvider>); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; });

describe("Help panel", () => {
  it("opens with the chapter for this screen, as sections with links into the guide, and a link to the whole guide", async () => {
    await act(async () => button().click()); await tick();
    expect(dialog()!.textContent).toContain("About this screen: The Metrics screens");
    expect(dialog()!.textContent).toContain("Each row has a Quick look button.");
    const hrefs = [...dialog()!.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/guide/metrics#the-metrics-list");
    expect(hrefs).toContain("/guide");
    expect(dialog()!.textContent).toContain("Open the full guide");
  });

  it("has a labelled search box that searches every chapter and lists results as links with chapter and section", async () => {
    await act(async () => button().click()); await tick();
    const input = dialog()!.querySelector<HTMLInputElement>("input")!;
    expect(dialog()!.querySelector(`label[for='${input.id}']`)?.textContent).toBe("Search the user guide");
    await act(async () => type(input, "marketplace")); await tick();
    const list = dialog()!.querySelector("ul[aria-label='Search results']")!;
    const items = [...list.querySelectorAll("li")];
    expect(items).toHaveLength(1);
    expect(items[0].querySelector("a")!.getAttribute("href")).toBe("/guide/packs#install-a-pack");
    expect(items[0].textContent).toContain("Install a Pack");
    expect(items[0].textContent).toContain("Packs");
    expect(items[0].textContent).toContain("marketplace");
    await act(async () => type(input, "zzzz")); await tick();
    expect(dialog()!.textContent).toContain("Nothing in the guide matches");
  });

  it("lists the chapters when no chapter describes the screen", async () => {
    path = "/somewhere-else";
    await act(async () => { root.render(<SlideOverProvider><HelpButton guide="/guide" /></SlideOverProvider>); });
    await act(async () => button().click()); await tick();
    expect(dialog()!.textContent).toContain("There is no chapter for this screen");
    expect(dialog()!.querySelector("a[href='/guide/packs']")).not.toBeNull();
  });

  it("returns focus to the button when it closes", async () => {
    button().focus();
    await act(async () => button().click()); await tick();
    await act(async () => { dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await tick();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(button());
  });
});
