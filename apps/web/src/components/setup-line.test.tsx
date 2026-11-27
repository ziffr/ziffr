// @vitest-environment happy-dom
// The Setup line and the guide's Slide-over (spec 0052, ticket 11; GLOSSARY: Setup Guide): each state a person can be in,
// from a Member part-way to a Guest, with the actions mocked (the core's own rules are in setup-guide.db.test.ts).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let path = "/metrics";
let panelParam: string | null = null;
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => path, useRouter: () => ({ refresh }), useSearchParams: () => new URLSearchParams(panelParam ? { panel: panelParam } : {}) }));
const hideSetup = vi.fn(async () => undefined);
const reopenSetup = vi.fn(async () => undefined);
const skipStep = vi.fn(async (step: string) => (step ? undefined : undefined));
let steps = [
  { id: "about", ticked: true, skipped: false, next: false },
  { id: "ways", ticked: false, skipped: false, next: true },
];
const readSetupSteps = vi.fn(async () => ({ steps, ticked: steps.filter((s) => s.ticked).length, total: steps.length }));
vi.mock("@/app/setup/actions", () => ({ hideSetup: () => hideSetup(), reopenSetup: () => reopenSetup(), skipStep: (s: string) => skipStep(s), readSetupSteps: () => readSetupSteps() }));
import { SlideOverProvider } from "./slide-over-host";
import { SetupGuideButton, SetupOpener, SetupProvider, type SetupState } from "./setup-panel";
import { SetupLine } from "./setup-line";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement; let root: Root;
const dialog = () => document.querySelector<HTMLElement>("[data-slide-over]");
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
const press = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); await tick(); };
const byText = (scope: ParentNode, text: string) => [...scope.querySelectorAll<HTMLElement>("button, a")].find((b) => b.textContent!.includes(text));
async function show(state: SetupState, line: { done: number; total: number; next: "ways" | "about" | null } | null) {
  await act(async () => {
    root.render(
      <SetupProvider value={state}>
        <SlideOverProvider>
          <SetupOpener />
          {line && <SetupLine done={line.done} total={line.total} next={line.next} />}
          <SetupGuideButton>Setup Guide</SetupGuideButton>
        </SlideOverProvider>
      </SetupProvider>,
    );
  });
  await tick();
}

beforeEach(() => {
  path = "/metrics"; panelParam = null;
  for (const f of [hideSetup, reopenSetup, skipStep, readSetupSteps, refresh]) f.mockClear();
  steps = [
    { id: "about", ticked: true, skipped: false, next: false }, { id: "start", ticked: true, skipped: false, next: false },
    { id: "ways", ticked: false, skipped: false, next: true }, { id: "first_metric", ticked: false, skipped: false, next: false },
    { id: "team", ticked: false, skipped: false, next: false },
  ];
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; });

describe("the Setup line", () => {
  it("says how far an Owner is and what is next, as a labelled region with two buttons", async () => {
    await show({ applies: true, shown: true }, { done: 2, total: 5, next: "ways" });
    const region = host.querySelector("section[aria-label='Setup Guide']")!;
    expect(region.textContent).toContain("Setup: 2 of 5 done.");
    expect(region.textContent).toContain("Next: Ways in and out.");
    expect(byText(region, "Continue")).toBeTruthy();
    expect(byText(region, "Hide")).toBeTruthy();
  });

  it("shows a Member's short version in the same words", async () => {
    await show({ applies: true, shown: true }, { done: 1, total: 2, next: "ways" });
    expect(host.querySelector("section")!.textContent).toContain("Setup: 1 of 2 done.");
  });

  it("is left off the full Setup page", async () => {
    path = "/setup";
    await show({ applies: true, shown: true }, { done: 2, total: 5, next: "ways" });
    expect(host.querySelector("section")).toBeNull();
  });

  it("opens the steps beside the page with the next one marked and Skip beside the open ones", async () => {
    await show({ applies: true, shown: true }, { done: 2, total: 5, next: "ways" });
    await press(byText(host, "Continue"));
    const d = dialog()!;
    expect(d.textContent).toContain("Setup Guide");
    const items = [...d.querySelectorAll("ol[aria-label='Setup steps'] > li")];
    expect(items).toHaveLength(5);
    expect(items[2].getAttribute("aria-current")).toBe("step");
    expect(items[0].textContent).toContain("done");
    expect(byText(items[0], "Skip")).toBeUndefined();
    expect(byText(items[3], "Skip")).toBeTruthy();
    expect(d.textContent).toContain("2 of 5 done");
    // A step's name leads to its screen on the full page.
    expect(items[2].querySelector("a")!.getAttribute("href")).toBe("/setup?step=ways");
  });

  it("skips a step through the server and reads the list again", async () => {
    await show({ applies: true, shown: true }, { done: 2, total: 5, next: "ways" });
    await press(byText(host, "Continue"));
    steps = steps.map((s) => (s.id === "ways" ? { ...s, skipped: true, next: false } : s.id === "first_metric" ? { ...s, next: true } : s));
    await press(byText(dialog()!.querySelectorAll("li")[2], "Skip"));
    expect(skipStep).toHaveBeenCalledWith("ways");
    expect(refresh).toHaveBeenCalled();
    expect(dialog()!.textContent).toContain("3 of 5 done");
    expect(dialog()!.querySelectorAll("li")[2].textContent).toContain("Skipped");
  });

  it("says plainly that everything is done when it is", async () => {
    steps = steps.map((s) => ({ ...s, ticked: true, next: false }));
    await show({ applies: true, shown: false }, null);
    await press(byText(host, "Setup Guide"));
    expect(dialog()!.textContent).toContain("Everything here is done or skipped");
    expect(byText(dialog()!, "Skip")).toBeUndefined();
  });

  it("hides the guide for the person from the line and from the panel", async () => {
    await show({ applies: true, shown: true }, { done: 2, total: 5, next: "ways" });
    await press(byText(host.querySelector("section")!, "Hide"));
    expect(hideSetup).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
    await press(byText(host, "Continue"));
    await press(byText(dialog()!, "Hide the Setup Guide"));
    expect(hideSetup).toHaveBeenCalledTimes(2);
    expect(dialog()).toBeNull();
  });
});

describe("reopening and the address", () => {
  it("reopens from Help or the menu: it clears the Hide first, then opens the steps", async () => {
    await show({ applies: true, shown: false }, null);
    await press(byText(host, "Setup Guide"));
    expect(reopenSetup).toHaveBeenCalledTimes(1);
    expect(dialog()!.textContent).toContain("2 of 5 done");
  });

  it("offers nothing to a Guest or in the demo (it does not apply)", async () => {
    await show({ applies: false, shown: false }, null);
    expect(byText(host, "Setup Guide")).toBeUndefined();
  });

  it("opens once for ?panel=setup, and not at all where the guide does not apply", async () => {
    panelParam = "setup";
    await show({ applies: true, shown: true }, null);
    expect(dialog()).not.toBeNull();
    expect(reopenSetup).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    document.body.innerHTML = "";
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    await show({ applies: false, shown: false }, null);
    expect(dialog()).toBeNull();
  });
});
