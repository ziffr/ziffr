// @vitest-environment happy-dom
// The Slot window ("Use this…") in the side panel (spec 0050, ticket #926): it opens with the template's name, asks
// which Metrics fill each Slot, draws the Preview once all are filled (sized from the panel's width), answers the
// question with the fills, and answers null when it is cancelled or the panel is closed some other way.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { WidgetTemplate } from "@ziffr/core/types";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboards/1" }));
// The Preview itself is tested in preview.test.tsx: here only the width it is asked to draw at matters.
vi.mock("./preview", () => ({ Preview: (p: { width?: number }) => <div data-testid="preview" data-width={p.width} /> }));
import { SlideOverProvider } from "./slide-over-host";
import { previewWidth, useSlotFill } from "./slot-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sample = sampleCanvasData("sara", "1,234.5");
const t = { id: 7, kind: "widget", name: "Revenue card", description: "One number to watch.", owner_id: "sara", view: "number", w: 3, h: 4, slots: [{ label: "The number", multiple: false }], body: { metricSlots: [0], settings: {} } } as unknown as WidgetTemplate;
const data = { ...sample, templates: [t] };

let fill!: ReturnType<typeof useSlotFill>;
function Page() {
  fill = useSlotFill(data);
  return <>{fill.dialog}</>;
}

let host: HTMLElement; let root: Root;
const panel = () => document.querySelector<HTMLElement>("[data-slide-over]");
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const button = (label: string) => [...panel()!.querySelectorAll("button")].find((b) => b.textContent === label)!;
async function choose(value: string) {
  const select = panel()!.querySelector("select")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const submit = () => act(async () => { panel()!.querySelector("form")!.requestSubmit(); });

beforeEach(async () => {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<SlideOverProvider><Page /></SlideOverProvider>); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; });

describe("the Slot window in the side panel", () => {
  it("opens in the panel with the template's name and line, and a question per Slot", async () => {
    let answer: unknown = "pending";
    await act(async () => { void fill.ask(t).then((a) => { answer = a; }); }); await tick();
    expect(panel()).not.toBeNull();
    expect(document.getElementById(panel()!.getAttribute("aria-labelledby")!)!.textContent).toBe("Revenue card");
    expect(panel()!.textContent).toContain("One number to watch.");
    expect(panel()!.querySelector("select")!.getAttribute("aria-label")).toBe("The number");
    expect(button("Use template").hasAttribute("disabled")).toBe(true);
    expect(panel()!.querySelector("[data-testid=preview]")).toBeNull();
    expect(answer).toBe("pending");
  });

  it("shows the Preview once the Slot is filled, and answers with the fills on Use template", async () => {
    let answer: unknown = "pending";
    await act(async () => { void fill.ask(t).then((a) => { answer = a; }); }); await tick();
    await choose(String(data.metrics[0].id));
    expect(panel()!.querySelector("[data-testid=preview]")).not.toBeNull();
    expect(button("Use template").hasAttribute("disabled")).toBe(false);
    await submit(); await tick();
    expect(answer).toEqual([[data.metrics[0].id]]);
    expect(panel()).toBeNull();
  });

  it("answers null and closes on Cancel", async () => {
    let answer: unknown = "pending";
    await act(async () => { void fill.ask(t).then((a) => { answer = a; }); }); await tick();
    await act(async () => { button("Cancel").click(); }); await tick();
    expect(answer).toBeNull();
    expect(panel()).toBeNull();
  });

  it("answers null when the panel is closed with Escape or its close button", async () => {
    let answer: unknown = "pending";
    await act(async () => { void fill.ask(t).then((a) => { answer = a; }); }); await tick();
    await act(async () => { button("Close").click(); }); await tick();
    expect(answer).toBeNull();
    expect(panel()).toBeNull();
    // And it can be asked again afterwards.
    let again: unknown = "pending";
    await act(async () => { void fill.ask(t).then((a) => { again = a; }); }); await tick();
    expect(panel()).not.toBeNull();
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await tick();
    expect(again).toBeNull();
    expect(panel()).toBeNull();
  });

  it("opens once, with no step back, also when React runs effects twice", async () => {
    await act(async () => { void fill.ask(t); }); await tick();
    expect([...panel()!.querySelectorAll("button")].some((b) => b.textContent?.includes("Back"))).toBe(false);
  });
});

describe("the Preview frame at the panel's width", () => {
  it("draws as wide as the frame allows, between 160 and 380 px", () => {
    expect(previewWidth(384)).toBe(368); // a desktop panel, 26 rem less its padding
    expect(previewWidth(272)).toBe(256); // a phone
    expect(previewWidth(1000)).toBe(380);
    expect(previewWidth(100)).toBe(160);
  });

  it("draws at a nominal width until the frame is measured", async () => {
    await act(async () => { void fill.ask(t); }); await tick();
    await choose(String(data.metrics[0].id));
    expect(panel()!.querySelector("[data-testid=preview]")!.getAttribute("data-width")).toBe("280");
  });
});
