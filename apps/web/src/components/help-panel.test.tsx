// @vitest-environment happy-dom
// Help in the side panel (spec 0050, ticket #924): the "?" button opens the chapter for the screen you are on, the search
// box (which has a label) lists results with their chapter and section as links, and focus goes back to the button on close.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HelpIndex } from "@/lib/help-index-build";

let path = "/metrics";
// The Setup Guide's server actions reach the core, which a component test never loads (spec 0052).
vi.mock("@/app/setup/actions", () => ({ hideSetup: vi.fn(), reopenSetup: vi.fn(), skipStep: vi.fn(), readSetupSteps: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => path }));
// The installed Packs' guides (spec 0058): none unless a test gives some.
let packs: { installId: number; name: string; version: string }[] = [];
const readPackGuide = vi.fn(async (id: number) => ({ installId: id, name: "Sales forecast", version: "1.1.0", author: "Ziffr", overview: null, guide: { whatItsFor: [{ type: "text", text: "The weekly **forecast** call. <b>As words</b>" }] } }));
vi.mock("@/app/pack-guide-actions", () => ({ readPackGuides: async () => packs, readPackGuide: (id: number) => readPackGuide(id) }));
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
import { HelpButton, useOpenHelp } from "./help-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The guide route's answers, by chapter.
const pages: Record<string, { title: string; html: string }> = {
  metrics: { title: "The Metrics screens", html: '<h2 id="the-metrics-list">The Metrics list</h2><p>Rows. See <a href="/guide/packs#install-a-pack">packs</a>, <a href="#the-metrics-list">here</a>, <a href="/guide/nope">gone</a> and <a href="https://example.com" target="_blank" rel="noopener noreferrer">out</a>.</p>' },
  packs: { title: "Packs", html: '<h2 id="install-a-pack">Install a Pack</h2><p>Packs page text.</p>' },
};
const fetchMock = vi.fn(async (url: string) => {
  const hit = pages[decodeURIComponent(url.split("/").pop()!)];
  return hit ? new Response(JSON.stringify(hit), { status: 200 }) : new Response("{}", { status: 404 });
});
/** A harness for the sidebar's Help entry: it opens the panel at the contents. */
function SidebarEntry() { const open = useOpenHelp("/guide"); return <button type="button" onClick={() => open("contents")}>Help entry</button>; }

let host: HTMLElement; let root: Root;
const inPanel = (text: string) => [...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent!.includes(text))!;
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
  packs = [];
  readPackGuide.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  try { window.sessionStorage.clear(); } catch { /* none */ }
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<SlideOverProvider><HelpButton guide="/guide" /></SlideOverProvider>); });
});
afterEach(async () => {
  vi.unstubAllGlobals(); await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; });

describe("Help panel", () => {
  it("opens with the chapter for this screen, as sections that open in the panel, and a link to the whole guide in a new tab", async () => {
    await act(async () => button().click()); await tick();
    expect(dialog()!.textContent).toContain("About this screen: The Metrics screens");
    expect(dialog()!.textContent).toContain("Each row has a Quick look button.");
    expect(inPanel("Read this section")).toBeTruthy();
    const full = dialog()!.querySelector<HTMLAnchorElement>("a[href='/guide']")!;
    expect(full.textContent).toContain("Open the full guide");
    expect(full.target).toBe("_blank");
    // Nothing in the panel is a link that would leave the screen in this tab.
    expect([...dialog()!.querySelectorAll<HTMLAnchorElement>("a")].every((a) => a.target === "_blank")).toBe(true);
  });

  it("shows a section inside the panel, scrolled to it, and Back returns to the list with the search kept", async () => {
    await act(async () => button().click()); await tick();
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = function (this: Element) { scrolled(this.id); };
    const input = dialog()!.querySelector<HTMLInputElement>("input")!;
    await act(async () => type(input, "marketplace")); await tick();
    await act(async () => inPanel("Install a Pack").click()); await tick();
    expect(fetchMock).toHaveBeenCalledWith("/api/guide/packs");
    expect(dialog()!.textContent).toContain("Packs page text.");
    expect(dialog()!.querySelector("input")).toBeNull();
    expect(scrolled).toHaveBeenCalledWith("install-a-pack");
    expect(dialog()!.querySelector<HTMLAnchorElement>("a[href='/guide/packs#install-a-pack']")!.target).toBe("_blank");
    await act(async () => inPanel("Back").click()); await tick();
    expect(dialog()!.querySelector<HTMLInputElement>("input")!.value).toBe("marketplace");
    expect(dialog()!.querySelector("ul[aria-label='Search results']")).not.toBeNull();
  });

  it("keeps links between chapters in the panel (Back goes through them), and sends other links to a new tab", async () => {
    const open = vi.fn(); vi.stubGlobal("open", open);
    await act(async () => button().click()); await tick();
    await act(async () => inPanel("Read the whole chapter").click()); await tick();
    const link = (text: string) => [...dialog()!.querySelectorAll<HTMLAnchorElement>("article a")].find((a) => a.textContent === text)!;
    const clicked = (a: HTMLAnchorElement) => { const e = new MouseEvent("click", { bubbles: true, cancelable: true }); a.dispatchEvent(e); return e.defaultPrevented; };
    let prevented = false;
    await act(async () => { prevented = clicked(link("packs")); }); await tick();
    expect(prevented).toBe(true);
    expect(dialog()!.textContent).toContain("Packs page text.");
    await act(async () => inPanel("Back").click()); await tick();
    expect(dialog()!.textContent).toContain("The Metrics list");
    // An anchor in the same page scrolls; a chapter that does not exist goes to a new tab; an outside link is left to the browser.
    await act(async () => { prevented = clicked(link("here")); });
    expect(prevented).toBe(true);
    await act(async () => { prevented = clicked(link("gone")); });
    expect(prevented).toBe(true);
    expect(open).toHaveBeenCalledWith("/guide/nope", "_blank", "noopener,noreferrer");
    await act(async () => { prevented = clicked(link("out")); });
    expect(prevented).toBe(false);
    expect(dialog()!.textContent).toContain("The Metrics list");
  });

  it("says when a page could not be loaded and still offers the full page", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    await act(async () => button().click()); await tick();
    await act(async () => inPanel("Read the whole chapter").click()); await tick();
    expect(dialog()!.textContent).toContain("This page could not be loaded");
    expect(dialog()!.textContent).toContain("Open full page");
  });

  it("has a Wider / Narrower button that keeps its choice for the session", async () => {
    await act(async () => button().click()); await tick();
    const toggle = () => [...dialog()!.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")][0];
    expect(toggle().textContent).toContain("Wider");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    expect(dialog()!.className).toContain("sm:w-[26rem]");
    await act(async () => toggle().click());
    expect(toggle().textContent).toContain("Narrower");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(dialog()!.className).toContain("sm:w-[48rem]");
    // Closed and opened again in the same session: still wide.
    await act(async () => { dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await tick();
    await act(async () => button().click()); await tick();
    expect(dialog()!.className).toContain("sm:w-[48rem]");
    await act(async () => toggle().click());
    expect(dialog()!.className).toContain("sm:w-[26rem]");
  });

  it("opens at the list of chapters from the sidebar's Help entry, the chapter for this screen first", async () => {
    await act(async () => { root.render(<SlideOverProvider><SidebarEntry /></SlideOverProvider>); });
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click()); await tick();
    const items = [...dialog()!.querySelectorAll("ul[aria-label='Chapters'] li")].map((li) => li.textContent);
    expect(items[0]).toContain("The Metrics screens");
    expect(items[0]).toContain("this screen");
    expect(items[1]).toBe("Packs");
    await act(async () => inPanel("Packs").click()); await tick();
    expect(dialog()!.textContent).toContain("Packs page text.");
  });

  it("has a labelled search box that searches every chapter and lists results as links with chapter and section", async () => {
    await act(async () => button().click()); await tick();
    const input = dialog()!.querySelector<HTMLInputElement>("input")!;
    expect(dialog()!.querySelector(`label[for='${input.id}']`)?.textContent).toBe("Search the user guide");
    await act(async () => type(input, "marketplace")); await tick();
    const list = dialog()!.querySelector("ul[aria-label='Search results']")!;
    const items = [...list.querySelectorAll("li")];
    expect(items).toHaveLength(1);
    expect(items[0].querySelector("button")).not.toBeNull();
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
    expect(inPanel("Packs")).toBeTruthy();
  });

  it("offers the installed Packs' guides, first on the Packs screen, and shows one as text with Back", async () => {
    path = "/settings/packs";
    packs = [{ installId: 7, name: "Sales forecast", version: "1.1.0" }];
    await act(async () => { root.render(<SlideOverProvider><HelpButton guide="/guide" /></SlideOverProvider>); });
    await act(async () => button().click()); await tick();
    const text = dialog()!.textContent!;
    expect(text.indexOf("Guides from your Packs")).toBeGreaterThan(-1);
    expect(text.indexOf("Guides from your Packs")).toBeLessThan(text.indexOf("About this screen"));
    await act(async () => inPanel("Sales forecast").click()); await tick();
    expect(readPackGuide).toHaveBeenCalledWith(7);
    expect(dialog()!.querySelector("section[aria-label='Pack Guide']")!.textContent).toContain("The weekly forecast call. <b>As words</b>");
    expect(dialog()!.querySelector("section[aria-label='Pack Guide'] b, section[aria-label='Pack Guide'] a")).toBeNull();
    await act(async () => inPanel("Back").click()); await tick();
    expect(dialog()!.textContent).toContain("About this screen: Packs");
  });

  it("puts the guides after the screen's own help elsewhere, and shows none while searching or when there is none", async () => {
    packs = [{ installId: 7, name: "Sales forecast", version: "1.1.0" }];
    await act(async () => button().click()); await tick();
    const text = dialog()!.textContent!;
    expect(text.indexOf("Guides from your Packs")).toBeGreaterThan(text.indexOf("About this screen"));
    await act(async () => type(dialog()!.querySelector<HTMLInputElement>("input")!, "marketplace")); await tick();
    expect(dialog()!.textContent).not.toContain("Guides from your Packs");
    await act(async () => { dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await tick();
    packs = [];
    await act(async () => button().click()); await tick();
    expect(dialog()!.textContent).not.toContain("Guides from your Packs");
  });

  it("returns focus to the button when it closes", async () => {
    button().focus();
    await act(async () => button().click()); await tick();
    await act(async () => { dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await tick();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(button());
  });
});
