// @vitest-environment happy-dom
// Export as Pack's set-up questions and "Try it" (spec 0068, #1346; GLOSSARY: Pack): the fields say their limits and
// what was refused, they start empty and take an installed Pack's words only on a press, and a try walks the guided
// set-up to its end while calling no server action that changes anything, keeping nothing and leaving the address alone.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PackExportTry } from "@ziffr/core/pack-export-try";

const on = vi.hoisted(() => ({ value: true }));
vi.mock("@/app/use-pack/switch", () => ({ get PACK_SET_UP_ON() { return on.value; }, PACKS_PAGE: "/settings/packs" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/preview", () => ({ DashboardTemplatePreview: () => <div data-testid="dashboard-drawing" />, Preview: () => <div /> }));
vi.mock("@/components/slide-preview", () => ({ SlidesPreview: () => <div data-testid="slides-drawing" /> }));
vi.mock("@/components/fill-from-n8n", () => ({ FillFromN8n: () => null }));
// Every server action the dialog or the screens could reach.
const actions = vi.hoisted(() => ({
  exportAsPack: vi.fn(), tryAsPack: vi.fn(), themeLogoPreview: vi.fn(),
  describePack: vi.fn(), checkPackDescription: vi.fn(),
  checkPackStart: vi.fn(), takePackStartStep: vi.fn(),
}));
vi.mock("@/app/pack-actions", () => ({ exportAsPack: actions.exportAsPack, tryAsPack: actions.tryAsPack, themeLogoPreview: actions.themeLogoPreview }));
vi.mock("@/app/pack-guide-actions", () => ({ describePack: actions.describePack, checkPackDescription: actions.checkPackDescription }));
vi.mock("@/app/use-pack/actions", () => ({ checkPackStart: actions.checkPackStart, takePackStartStep: actions.takePackStartStep }));
import { ExportPack } from "./export";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const made: PackExportTry = {
  pack: { id: "northwind/sales", name: "Weekly sales", version: "1.0.0" },
  declarations: {
    name: "Weekly sales", setUp: { line: "Your week of sales.", happens: ["Monday: you are asked for the figures"] },
    metrics: [{ key: "sales", name: "Sales", period: "week", takesValues: true, ask: { question: "What is the target this quarter?", name: "Target", every: "quarter" } }],
    dashboards: [{ key: "board", name: "Sales board", slots: [{ suggests: "sales", multiple: false }] }],
    workflows: [{ key: "weekly", name: "Weekly numbers", approvers: 0 }],
  },
  drawing: { sample: { pack: "northwind/sales", metrics: [] }, dashboard: { name: "Sales board", slots: [], body: { widgets: [] } }, deck: null },
  assistantTexts: [],
};
const options = { metrics: [{ id: 1, name: "Sales", detail: "by week" }], catalog: [], dashboards: [], decks: [], workflows: [], designs: [], themes: [] };

let host: HTMLElement; let root: Root;
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const text = () => document.body.textContent ?? "";
const headings = () => [...document.querySelectorAll("h1")].map((h) => h.textContent);
const button = (name: string | RegExp) => [...document.querySelectorAll("button")].find((b) => (typeof name === "string" ? b.textContent?.trim() === name : name.test(b.textContent ?? "")))!;
const press = async (name: string | RegExp) => { await act(async () => button(name).click()); await tick(); };
const label = (words: RegExp) => [...document.querySelectorAll("label")].find((l) => words.test(l.textContent ?? ""))!;
const control = (words: RegExp) => { const l = label(words); return (l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector("input, select, textarea")) as HTMLInputElement; };
const type = async (el: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

/** The try's dialog, the one that holds the screen's heading: the export's own stays open behind it. */
const trying = () => document.querySelector("h1")!.closest<HTMLElement>('[role="dialog"]')!;
/** Presses a button of the try: the export's dialog has buttons of the same names behind it. */
const inTry = async (name: string) => { await act(async () => [...trying().querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!.click()); await tick(); };
/** The dialog at its second step, "Describe your Pack". */
async function describing() {
  await act(async () => root.render(<ExportPack options={options} defaultAuthor="Northwind" viewer="me-id" numberStyle="1,234.5" />));
  await press(/Export as Pack/);
  await type(control(/^Name/), "Weekly sales");
  await type(control(/^Id/), "northwind/sales");
  await act(async () => control(/Salesby week/).click());
  await press(/Next: describe it/);
}

beforeEach(() => {
  on.value = true;
  vi.clearAllMocks();
  actions.describePack.mockResolvedValue({
    contents: "", installed: [], numbers: [{ ref: "metric:1", name: "Sales", period: "week", said: null }, { ref: "metric:2", name: "Revenue", period: "year", said: null }],
    setUps: [{ installId: 3, name: "Shop", version: "1.2.0", setUp: { line: "A shop's week.", happens: ["You are asked"] } }],
  });
  actions.checkPackDescription.mockResolvedValue({ guide: [], numbers: [], setUp: [] });
  actions.tryAsPack.mockResolvedValue(made);
  window.sessionStorage.clear();
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.replaceChildren(); });

describe("Set-up questions", () => {
  it("start empty, say their limits and offer an installed Pack's words only on a press", async () => {
    await describing();
    const line = control(/^In one sentence/);
    expect(line.value).toBe("");
    expect(text()).toContain("0 of 120 characters.");
    expect([...document.querySelectorAll("input[data-set-up-field]")].map((i) => (i as HTMLInputElement).value).filter((v) => v && v !== "on")).toEqual([]);
    await type(line, "x".repeat(121));
    expect(text()).toContain("Too long: 121 of 120 characters.");
    expect(line.getAttribute("aria-invalid")).toBe("true");
    await press(/^Use its set-up questions/);
    expect(control(/^In one sentence/).value).toBe("A shop's week.");
  });

  it("offer one more line while there is room", async () => {
    await describing();
    const happens = () => [...document.querySelectorAll<HTMLInputElement>('input[data-set-up-field^="happens."]')];
    expect(happens()).toHaveLength(1);
    for (let i = 0; i < 4; i++) await type(happens()[i], `Line ${i}`);
    expect(happens()).toHaveLength(4);
  });

  it("ask a number only for spans as long as its period", async () => {
    await describing();
    await act(async () => control(/Ask for a target for “Sales”/).click());
    await act(async () => control(/Ask for a target for “Revenue”/).click());
    const spans = (name: string) => [...control(new RegExp(`One answer for ${name}`)).querySelectorAll("option")].map((o) => o.getAttribute("value"));
    expect([spans("Sales"), spans("Revenue")]).toEqual([["month", "quarter", "year"], ["year"]]);
    expect(text()).toContain("At most 3 in a Pack; 2 chosen.");
  });

  it("show what the core refused at its field, focus it and download nothing", async () => {
    // The checks answer in the file's order, not the page's.
    actions.checkPackDescription.mockResolvedValue({ guide: [], numbers: [], setUp: [{ field: "happens.0", message: "must not be empty." }, { field: "line", message: "must be plain text, without markup or web addresses." }] });
    await describing();
    await type(control(/^In one sentence/), "<b>");
    await press(/Download Pack/);
    expect(actions.checkPackDescription.mock.calls[0][2]).toEqual({ choice: { metrics: [1] }, setUp: { line: "<b>" } });
    expect(text()).toContain("This field must be plain text, without markup or web addresses.");
    expect(document.activeElement).toBe(control(/^In one sentence/));
    expect(actions.exportAsPack).not.toHaveBeenCalled();
    await press(/Try it/);
    expect(actions.tryAsPack).not.toHaveBeenCalled();
  });

  it("are not shown, nor is Try it, while the guided set-up is switched off", async () => {
    on.value = false;
    await describing();
    expect(text()).not.toContain("Set-up questions");
    expect(button(/Try it/)).toBeUndefined();
    expect(button(/Download Pack/)).toBeDefined();
  });
});

describe("Try it", () => {
  it("walks the set-up to its end with made-up people and calls nothing that changes anything", async () => {
    const pushed = vi.spyOn(window.history, "pushState");
    const replaced = vi.spyOn(window.history, "replaceState");
    const stored = vi.spyOn(window.sessionStorage, "setItem");
    const fetched = vi.spyOn(globalThis, "fetch");
    await describing();
    await type(control(/^In one sentence/), "Your week of sales.");
    await press(/Try it/);
    expect(actions.tryAsPack).toHaveBeenCalledTimes(1);
    expect(actions.tryAsPack.mock.calls[0][3]).toMatchObject({ setUp: { line: "Your week of sales." } });
    expect(headings()).toEqual(["Weekly sales"]);
    expect(text()).toContain("A try of your Pack, with made-up people. Nothing is saved, made or sent.");
    expect(document.querySelector('[data-testid="dashboard-drawing"]')).not.toBeNull();
    // No way out of the try leaves the page.
    expect(trying().querySelector("a[href]")).toBeNull();

    await press("Use this pack");
    expect(headings()).toEqual(["Who provides these numbers?"]);
    // The people to pick are made up.
    expect(trying().textContent).toContain("Alex Example");
    await press("Continue");
    expect(headings()).toEqual(["What is the target this quarter?"]);
    await inTry("Back");
    expect(headings()).toEqual(["Who provides these numbers?"]);
    await press("Continue");
    await press("Continue");
    expect(headings()).toEqual(["Ready to start?"]);
    expect(text()).toContain("Provides the numbersYou");
    await press("Set it up");
    expect(headings()).toEqual(["That is the whole set-up"]);
    expect(text()).toContain("nothing was made, nobody was added and nothing was sent");
    expect(text()).toContain("You: 1 number.");
    expect(trying().querySelector("a[href]")).toBeNull();

    await press("Try it again");
    expect(headings()).toEqual(["Weekly sales"]);
    await inTry("Close");
    expect(headings()).toEqual([]);
    // The export is still there, with what was written.
    expect(control(/^In one sentence/).value).toBe("Your week of sales.");
    for (const never of [actions.exportAsPack, actions.checkPackStart, actions.takePackStartStep]) expect(never).not.toHaveBeenCalled();
    for (const never of [pushed, replaced, stored, fetched]) expect(never).not.toHaveBeenCalled();
  });

  it("says so where a Pack has nothing to ask", async () => {
    actions.tryAsPack.mockResolvedValue({ ...made, declarations: { name: "Only entries", metrics: made.declarations.metrics } });
    await describing();
    await press(/Try it/);
    expect(headings()).toEqual(["There are no questions to try"]);
    await press("Back to the export");
    expect(headings()).toEqual([]);
  });
});
