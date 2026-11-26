// @vitest-environment happy-dom
// Browse templates, Save as template and Add to deck in the side panel (spec 0050, ticket #926): they open there from
// the screen's own state, show their content, close with Escape or Cancel and tell the screen, and Browse hands over
// to the Slot window without stacking. The server actions are replaced.
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";

const deckChoices = vi.fn(async () => [{ id: 3, name: "Board deck", slides: [{ id: "s1", name: "Intro" }] }]);
vi.mock("@/app/convert-actions", () => ({ addToDeck: vi.fn(), deckChoices: () => deckChoices() }));
vi.mock("@/app/template-actions", () => ({ saveSlideLayout: vi.fn(), saveTemplate: vi.fn() }));
vi.mock("@/app/deck-workflow-template-actions", () => ({ saveAsDeckTemplate: vi.fn() }));
vi.mock("@/app/dashboard-template-actions", () => ({
  draftDashboardTemplate: async () => ({ slots: [{ label: "", multiple: false, exampleIds: [] }], leftOut: [], notices: [], widgets: 1 }),
  saveAsDashboardTemplate: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboards/1" }));
vi.mock("./preview", () => ({ TemplatePreview: () => <div data-testid="template-preview" />, Preview: () => null }));
import { SlideOverProvider, useSlideOver } from "./slide-over-host";
import { AddToDeckDialog } from "./add-to-deck-dialog";
import { SaveDashboardTemplateDialog } from "./save-dashboard-template-dialog";
import { BROWSE_TEMPLATES, TemplateBrowser } from "./template-browser";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement; let root: Root;
const panel = () => document.querySelector<HTMLElement>("[data-slide-over]");
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const button = (label: string) => [...panel()!.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
const title = () => document.getElementById(panel()!.getAttribute("aria-labelledby")!)!.textContent;
const escape = () => act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
const mount = async (ui: React.ReactNode) => {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<SlideOverProvider>{ui}</SlideOverProvider>); });
};
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; });
beforeEach(() => { deckChoices.mockClear(); });

// A screen that owns the "is it open" state, as the widget menu and the dashboards page do.
function Screen({ children }: { children: (close: () => void) => React.ReactNode }) {
  const [on, setOn] = useState(false);
  return <><button onClick={() => setOn(true)}>start</button><output>{on ? "open" : "shut"}</output>{on && children(() => setOn(false))}</>;
}

describe("Add to deck in the side panel", () => {
  const screen = () => <Screen>{(close) => <AddToDeckDialog widgetId={9} open onOpenChange={(o) => { if (!o) close(); }} />}</Screen>;

  it("opens when the screen asks, lists the decks, and names the panel", async () => {
    await mount(screen());
    await act(async () => { host.querySelector("button")!.click(); }); await tick();
    expect(title()).toBe("Add to deck");
    // A choice: a bottom sheet on a phone (spec 0055).
    expect(panel()!.dataset.short).toBe("true");
    expect(panel()!.textContent).toContain("A copy of this widget goes on the slide you pick.");
    expect(panel()!.textContent).toContain("Board deck");
    expect(deckChoices).toHaveBeenCalledTimes(1);
  });

  it("closes on Cancel and tells the screen", async () => {
    await mount(screen());
    await act(async () => { host.querySelector("button")!.click(); }); await tick();
    await act(async () => { button("Cancel").click(); }); await tick();
    expect(panel()).toBeNull();
    expect(host.querySelector("output")!.textContent).toBe("shut");
  });

  it("closes with Escape and tells the screen, so the next click opens it again", async () => {
    await mount(screen());
    await act(async () => { host.querySelector("button")!.click(); }); await tick();
    await escape(); await tick();
    expect(panel()).toBeNull();
    expect(host.querySelector("output")!.textContent).toBe("shut");
    await act(async () => { host.querySelector("button")!.click(); }); await tick();
    expect(panel()).not.toBeNull();
  });
});

describe("Save as template (dashboard) in the side panel", () => {
  it("opens with its form once the draft is read, and closes on Cancel", async () => {
    await mount(<Screen>{(close) => <SaveDashboardTemplateDialog dashboardId={1} dashboardName="Sales" metricName={() => undefined} onClose={close} />}</Screen>);
    await act(async () => { host.querySelector("button")!.click(); }); await tick();
    expect(title()).toBe("Save as template");
    expect((panel()!.querySelector("input") as HTMLInputElement).value).toBe("Sales");
    expect(panel()!.querySelector("[aria-label='Name of place 1']")).not.toBeNull();
    await act(async () => { button("Cancel").click(); }); await tick();
    expect(panel()).toBeNull();
    expect(host.querySelector("output")!.textContent).toBe("shut");
  });
});

describe("Browse templates in the side panel", () => {
  const data = sampleCanvasData("sara", "1,234.5");
  function Pool({ onAdd }: { onAdd: (s: unknown) => void }) {
    const p = useSlideOver();
    return <button onClick={() => p.open({ ...BROWSE_TEMPLATES, content: <TemplateBrowser data={data} layouts={false} onUse={(s) => { p.close(); onAdd(s); }} /> })}>Browse…</button>;
  }

  it("opens with the filter and a card per template, and Use closes it and hands the template on", async () => {
    const onAdd = vi.fn();
    await mount(<Pool onAdd={onAdd} />);
    await act(async () => { host.querySelector("button")!.click(); }); await tick();
    expect(title()).toBe("Browse templates");
    expect(panel()!.dataset.short).toBeUndefined();
    expect(panel()!.querySelector("[aria-label='Filter templates']")).not.toBeNull();
    const use = panel()!.querySelector<HTMLButtonElement>("button[aria-label^='Use ']")!;
    expect(use).not.toBeNull();
    await act(async () => { use.click(); }); await tick();
    expect(panel()).toBeNull();
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ type: "spec", metricIds: [] }));
  });

  it("filters the cards", async () => {
    await mount(<Pool onAdd={() => {}} />);
    await act(async () => { host.querySelector("button")!.click(); }); await tick();
    const input = panel()!.querySelector<HTMLInputElement>("[aria-label='Filter templates']")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "zzzz-no-such-template");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(panel()!.textContent).toContain("No template matches.");
  });

  it("goes back to the browser from a panel opened on top of it", async () => {
    const p = { current: null as ReturnType<typeof useSlideOver> | null };
    function Probe() { p.current = useSlideOver(); return null; }
    await mount(<><Pool onAdd={() => {}} /><Probe /></>);
    await act(async () => { host.querySelector("button")!.click(); }); await tick();
    await act(async () => p.current!.open({ title: "Use this", content: <p>slots</p> })); await tick();
    expect(title()).toBe("Use this");
    await act(async () => { button("Back").click(); }); await tick();
    expect(title()).toBe("Browse templates");
  });
});
