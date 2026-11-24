// @vitest-environment happy-dom
// Choose a method on the Analysis Canvas (spec 0041, ticket 16): the list is grouped by what a person wants to know, a Method that does
// not fit is greyed with its reason (never missing), choosing one asks its questions in words, the result carries the Takeaway and what
// can be done with it, and what is sent to the server is only ids and typed settings.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntryView, PickerList, PickerRun } from "@ziffr/core/analysis-picker";
import type { Takeaway } from "@ziffr/core/takeaways/takeaway";
import { groupsFor, metricsNeeded, type CanvasFact } from "@ziffr/core/method-picker-fit";
import { textsOf } from "@ziffr/core/method-picker";

const asked: unknown[] = [];
const ran: unknown[] = [];
let answer: PickerRun;
let canvas: CanvasFact[] = [];
const saved = vi.fn(async (source: unknown, name: string) => { void source; void name; return {}; });
vi.mock("server-only", () => ({}));
vi.mock("@/app/picker-actions", () => ({
  pickerList: async (ids: number[]) => { asked.push(ids); return listFor(canvas); },
  pickerRun: async (request: unknown) => { ran.push(request); return answer; },
}));
vi.mock("@/app/canvas-actions", () => ({ saveToPool: (s: unknown, n: string) => saved(s, n) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
import { MethodPicker } from "./method-picker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fact = (id: number, name: string, over: Partial<CanvasFact> = {}): CanvasFact => ({ id, name, period: "month", aggregation: "sum", periods: 24, hasTarget: false, breakdownLatest: false, breakdownBefore: false, builtFrom: [], ...over });
/** The list as the core gives it for these canvas Metrics (the same pure pieces `listPicker` puts together after the visibility check). */
function listFor(facts: CanvasFact[]): PickerList {
  const on = facts.map((f) => f.id);
  return {
    canvas: facts.map((f) => ({ id: f.id, name: f.name, period: f.period })),
    groups: groupsFor(facts).map((g) => ({
      want: g.want, question: g.question,
      entries: g.entries.map((e): EntryView => ({ id: e.id, name: e.name, generic: e.name, sentence: e.sentence, technical: e.technical, ...textsOf(e), slots: e.slots, settings: e.settings, needs: `${metricsNeeded(e)} Metrics on the canvas`, fit: e.fit, defaults: Object.fromEntries(e.slots.map((s, i) => [s.id, s.optional ? [] : s.many ? on.slice(i) : on.slice(i, i + 1)])), recipeFile: false, widget: e.widget })),
    })),
  };
}

let host: HTMLElement; let root: Root;
async function mount(facts: CanvasFact[]) {
  canvas = facts;
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<MethodPicker ids={facts.map((f) => f.id)} />); });
}
afterEach(() => { act(() => root.unmount()); host.remove(); asked.length = 0; ran.length = 0; saved.mockClear(); });
const cards = () => [...host.querySelectorAll("ul.grid > li")];
const card = (name: string) => cards().find((li) => li.querySelector("button")?.textContent?.startsWith(name))!;

describe("Choose a method", () => {
  it("lists every Method grouped by what a person wants, greyed with a reason when it does not fit, asking only for the canvas's ids", async () => {
    await mount([fact(1, "Revenue")]);
    expect(asked).toEqual([[1]]);
    expect([...host.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Where is it heading?", "What moves with what?", "What would it take?", "What would happen if?", "What changed?", "What is usual?", "Where is it concentrated?"]);
    expect(cards()).toHaveLength(16);
    const corr = card("Does A move with B?");
    expect(corr.querySelector("button")!.disabled).toBe(true);
    expect(corr.textContent).toContain("Needs 2 Metrics on the canvas; there is 1.");
    expect(corr.textContent).toContain("Correlation");
    expect(card("Where is it heading?").querySelector("button")!.disabled).toBe(false);
    // Use it when / Don't use it when are on every entry, greyed or not.
    for (const li of cards()) expect(li.textContent).toMatch(/Use it when[\s\S]*Don.t use it when/);
  });

  it("with nothing on the canvas every Method is greyed with the same first step", async () => {
    await mount([]);
    for (const li of cards()) {
      expect(li.querySelector("button")!.disabled).toBe(true);
      expect(li.textContent).toContain("Drop a Metric on the canvas first.");
    }
  });

  it("long and right-to-left Metric names are put in as text and wrap, never as markup", async () => {
    const long = "Quarterly recurring revenue from enterprise customers in the DACH region excluding one-off set-up fees ".repeat(2).trim();
    const rtl = "إيرادات <b>الشهر</b> الحالي";
    await mount([fact(1, long, { hasTarget: true, periods: 3 }), fact(2, rtl)]);
    const li = card("Will we reach the Target?");
    expect(li.textContent).toContain(`Needs at least 4 months of values; ${long} has 3.`);
    expect(host.querySelector("b")).toBeNull();
    const reason = [...host.querySelectorAll("[role=note] span[dir=auto]")].find((s) => s.textContent?.includes(long))!;
    expect(reason.className).toContain("break-words");
  });

  it("asks a chosen Method's questions in words, filled from the canvas, and sends only ids and typed settings", async () => {
    await mount([fact(1, "Revenue", { hasTarget: true }), fact(2, "Visits"), fact(3, "Price")]);
    await act(async () => { card("What does B need").querySelector("button")!.click(); });
    const form = host.querySelector("form")!;
    expect(form.textContent).toContain("Which Metric do you want to reach a value?");
    expect(form.textContent).toContain("Which Metrics might get it there?");
    expect(form.textContent).toContain("Which value should it reach?");
    const select = form.querySelector("select")!;
    expect(select.value).toBe("1");
    const boxes = [...form.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    // The Metric to explain is not offered as its own driver.
    expect(boxes.map((b) => b.checked)).toEqual([true, true]);
    expect(boxes).toHaveLength(2);
    answer = { ok: false, message: "Which value should it reach? Give a number." };
    await act(async () => { form.requestSubmit(); });
    expect(ran).toEqual([{ entry: "needs", slots: { metric: [1], drivers: [2, 3] }, settings: {} }]);
    expect(host.querySelector("[role=alert]")!.textContent).toBe("Which value should it reach? Give a number.");
  });

  it("shows the Takeaway of a result with Save as widget where the Method has a widget, and says so where it has none", async () => {
    await mount([fact(1, "Revenue", { hasTarget: true })]);
    const takeaway = { kind: "answer", method: "Holt", sentence: "At this pace Revenue reaches 150 € in March: about 7 in 10.", refusal: null, strength: null, strengthText: null, range: null, basis: null, assumptions: [], cautions: [], notes: [], track: null, footer: "This carries the past forward; it is not a promise.", figures: [], numbers: [] } as Takeaway;
    answer = { ok: true, entry: "reach-target", takeaway, recipe: null, widget: { template: "forecast", metricIds: [1], showTarget: true } };
    await act(async () => { card("Will we reach the Target?").querySelector("button")!.click(); });
    await act(async () => { host.querySelector("form")!.requestSubmit(); });
    const result = host.querySelector("[role=region]")!;
    expect(result.textContent).toContain("At this pace Revenue reaches 150 € in March: about 7 in 10.");
    expect(result.textContent).toContain("This carries the past forward; it is not a promise.");
    expect(result.textContent).toContain("This Method is not an Analysis Recipe yet");
    const save = [...result.querySelectorAll("button")].find((b) => b.textContent?.includes("Save as widget"))!;
    window.prompt = vi.fn(() => "My forecast");
    await act(async () => { save.click(); });
    expect(saved).toHaveBeenCalledTimes(1);
    const [source, name] = saved.mock.calls[0];
    expect(name).toBe("My forecast");
    expect(source).toMatchObject({ type: "spec", template: "forecast", metricIds: [1], settings: { showTarget: true } });
  });

  it("says a result has no widget yet, and offers the Analysis Recipe file where the Method can be one", async () => {
    await mount([fact(1, "Revenue"), fact(2, "Visits")]);
    const takeaway = { kind: "refusal", method: "Rank", sentence: null, refusal: "Not enough months yet: 4 of 6 needed.", strength: null, strengthText: null, range: null, basis: null, assumptions: [], cautions: [], notes: [], track: null, footer: null, figures: [], numbers: [] } as Takeaway;
    answer = { ok: true, entry: "rank", takeaway, recipe: { format: "ziffr.analysis/2", name: "x", slots: [{ label: "A" }], steps: [], outputs: [] }, widget: null };
    await act(async () => { card("Do A and B rise and fall").querySelector("button")!.click(); });
    await act(async () => { host.querySelector("form")!.requestSubmit(); });
    const result = host.querySelector("[role=region]")!;
    expect(result.textContent).toContain("Not enough months yet: 4 of 6 needed.");
    expect(result.textContent).toContain("This result cannot be saved as a widget yet.");
    expect([...result.querySelectorAll("button")].map((b) => b.textContent)).toEqual([" Download as Analysis Recipe"]);
    expect(result.textContent).toContain("An Owner or Admin can add it to the Workspace from the Playground");
  });
});
