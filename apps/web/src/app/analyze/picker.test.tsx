// @vitest-environment happy-dom
// Choose a method on the Analysis Canvas (spec 0041, ticket 16; ticket #1068): the panel lists the questions grouped by what a person
// wants to know, as titles only; a Method that does not fit is greyed with its reason (never missing); choosing a title opens it in place
// with what it is, when to use it and its fields; the answer goes under the canvas (not in the panel) with the Takeaway and what can be
// done with it; and what is sent to the server is only ids and typed settings.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntryView, PickerRun } from "@ziffr/core/analysis-picker";
import type { Takeaway } from "@ziffr/core/takeaways/takeaway";
import type { CanvasFact } from "./picker.fixtures";
import { fact, listFor } from "./picker.fixtures";

const asked: unknown[] = [];
const ran: unknown[] = [];
let answer: PickerRun;
let canvas: CanvasFact[] = [];
const saved = vi.fn(async (source: unknown, name: string) => { void source; void name; return {}; });
vi.mock("server-only", () => ({}));
// The picker offers Fill past periods, whose actions are the server's.
vi.mock("@/app/paste-actions", () => ({ pasteTemplateFile: vi.fn() }));
vi.mock("@/app/picker-actions", () => ({
  pickerList: async (ids: number[]) => { asked.push(ids); return listFor(canvas); },
  pickerRun: async (request: unknown) => { ran.push(request); return answer; },
}));
vi.mock("@/app/canvas-actions", () => ({ saveToPool: (s: unknown, n: string) => saved(s, n) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
import { MethodPicker } from "./method-picker";
import { Results, addResult, KEPT_RESULTS, type ResultItem } from "./results";
import { useState } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement; let root: Root;
// The page holds the results and the panel hands them over: the same two pieces, side by side.
function Harness({ ids, openEntry = null }: { ids: number[]; openEntry?: EntryView["id"] | null }) {
  const [items, setItems] = useState<ResultItem[]>([]);
  return (
    <>
      <aside><MethodPicker ids={ids} openEntry={openEntry} onResult={(r) => setItems((l) => addResult(l, { ...r, key: l.length + (l[0]?.key ?? 0) + 1 }))} /></aside>
      <main><Results items={items} writing={{ style: "1,234.5", yearStart: 1 }} /></main>
    </>
  );
}
async function mount(facts: CanvasFact[], openEntry: EntryView["id"] | null = null) {
  canvas = facts;
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<Harness ids={facts.map((f) => f.id)} openEntry={openEntry} />); });
}
afterEach(() => { act(() => root.unmount()); host.remove(); asked.length = 0; ran.length = 0; saved.mockClear(); });
const cards = () => [...host.querySelectorAll("aside section > ul > li")];
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
    expect(card("Where is Revenue heading?").querySelector("button")!.disabled).toBe(false);
    // Titles only to start with: what it is and when to use it come once a title is chosen.
    expect(host.querySelector("aside")!.textContent).not.toMatch(/Use it when|What it is/);
    // Greyed ones carry one line of reason beside the title, and are not buttons that open anything.
    expect(corr.querySelector("button")!.getAttribute("aria-expanded")).toBeNull();
  });

  it("opens a title in place: what it is, Use it when / Don't use it when and its fields, one at a time, and closes it again", async () => {
    await mount([fact(1, "Revenue"), fact(2, "Visits"), fact(3, "Price")]);
    const open = (name: string) => card(name).querySelector("button")!;
    expect(open("What moves Revenue?").getAttribute("aria-expanded")).toBe("false");
    await act(async () => { open("What moves Revenue?").click(); });
    const moves = card("What moves Revenue?");
    expect(open("What moves Revenue?").getAttribute("aria-expanded")).toBe("true");
    expect(moves.textContent).toMatch(/What it is\.[\s\S]*Use it when\.[\s\S]*Don.t use it when\.[\s\S]*Which Metric do you want to explain\?/);
    expect(moves.querySelector("form")).not.toBeNull();
    // The Metric to explain starts on the first Metric of the canvas.
    expect(moves.querySelector("select")!.value).toBe("1");
    await act(async () => { open("Where is Revenue heading?").click(); });
    expect(host.querySelectorAll("form")).toHaveLength(1);
    expect(card("What moves Revenue?").querySelector("form")).toBeNull();
    await act(async () => { open("Where is Revenue heading?").click(); });
    expect(host.querySelectorAll("form")).toHaveLength(0);
  });

  it("starts with the Method the page names open (the example question)", async () => {
    await mount([fact(1, "Revenue"), fact(2, "Visits")], "moves");
    expect(card("What moves Revenue?").querySelector("form")).not.toBeNull();
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
    const li = card("Will ");
    expect(li.textContent).toContain(`Needs at least 4 months of values; ${long} has 3.`);
    expect(host.querySelector("b")).toBeNull();
    const reason = [...host.querySelectorAll("[role=note][dir=auto]")].find((s) => s.textContent?.includes(long))!;
    expect(reason.className).toContain("break-words");
  });

  it("asks a chosen Method's questions in words, filled from the canvas, and sends only ids and typed settings", async () => {
    await mount([fact(1, "Revenue", { hasTarget: true }), fact(2, "Visits"), fact(3, "Price")]);
    await act(async () => { card("What does Revenue need").querySelector("button")!.click(); });
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
    expect(host.querySelector("main")!.textContent).toBe("");
    expect(ran).toEqual([{ entry: "needs", slots: { metric: [1], drivers: [2, 3] }, settings: {} }]);
    expect(host.querySelector("[role=alert]")!.textContent).toBe("Which value should it reach? Give a number.");
  });

  it("shows the Takeaway of a result with Save as widget where the Method has a widget, and says so where it has none", async () => {
    await mount([fact(1, "Revenue", { hasTarget: true })]);
    const takeaway = { kind: "answer", method: "Holt", sentence: "At this pace Revenue reaches 150 € in March: about 7 in 10.", refusal: null, strength: null, strengthText: null, range: null, basis: null, assumptions: [], cautions: [], notes: [], track: null, footer: "This carries the past forward; it is not a promise.", figures: [], numbers: [] } as Takeaway;
    answer = { ok: true, entry: "reach-target", takeaway, recipe: null, widget: { template: "forecast", metricIds: [1], showTarget: true } };
    await act(async () => { card("Will Revenue reach its Target?").querySelector("button")!.click(); });
    await act(async () => { host.querySelector("form")!.requestSubmit(); });
    const result = host.querySelector("main section")!;
    expect(result.textContent).toContain("At this pace Revenue reaches 150 € in March: about 7 in 10.");
    expect(result.textContent).toContain("This carries the past forward; it is not a promise.");
    expect(result.textContent).not.toContain("Analysis Recipe");
    const save = [...result.querySelectorAll<HTMLButtonElement>("[id^=result-] button")].find((b) => b.textContent?.includes("Save as widget"))!;
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
    await act(async () => { card("Do Revenue and Visits rise").querySelector("button")!.click(); });
    await act(async () => { host.querySelector("form")!.requestSubmit(); });
    const result = host.querySelector("main section")!;
    expect(result.textContent).toContain("Not enough months yet: 4 of 6 needed.");
    expect(result.textContent).toContain("You can\u2019t save this one as a widget yet.");
    expect([...result.querySelectorAll("[id^=result-] button")].map((b) => b.textContent)).toEqual([" Download as Analysis Recipe"]);
    expect(result.textContent).toContain("An Owner or Admin can add it to the Workspace from the Playground");
  });
});

describe("the results under the canvas", () => {
  const takeaway = (sentence: string) => ({ kind: "answer", method: "Rank", sentence, refusal: null, strength: null, strengthText: null, range: null, basis: null, assumptions: [], cautions: [], notes: [], track: null, footer: null, figures: [], numbers: [] }) as Takeaway;
  const runOne = async (name: string, sentence: string) => {
    answer = { ok: true, entry: "rank", takeaway: takeaway(sentence), recipe: null, widget: null };
    // A title already open stays open: choosing it again would close it.
    if (!host.querySelector("form")) await act(async () => { card(name).querySelector("button")!.click(); });
    await act(async () => { host.querySelector("form")!.requestSubmit(); });
  };

  it("puts the answer outside the panel, titled with the question and the Metrics, with a place for a chart above the Takeaway", async () => {
    await mount([fact(1, "Revenue"), fact(2, "Visits")]);
    await runOne("Do Revenue and Visits rise", "Revenue and Visits rose together.");
    expect(host.querySelector("aside")!.textContent).not.toContain("rose together");
    expect(host.querySelector("aside [role=status]")!.textContent).toBe("The answer is under the canvas.");
    const result = host.querySelector("main section")!;
    expect(result.getAttribute("aria-label")).toBe("Result: Do Revenue and Visits rise and fall in step, whatever their size?");
    expect(result.textContent).toContain("About Revenue, Visits");
    const chart = result.querySelector("[data-result-chart]")!;
    const take = [...result.querySelectorAll("*")].find((n) => n.textContent === "Revenue and Visits rose together." && n.children.length === 0)!;
    // The chart's place comes before the Takeaway in the page's order.
    expect(chart.compareDocumentPosition(take) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the last three results, newest first, each of which can be folded away", async () => {
    await mount([fact(1, "Revenue"), fact(2, "Visits")]);
    for (const n of ["one", "two", "three", "four"]) {
      await runOne("Do Revenue and Visits rise", `Answer ${n}.`);
    }
    const sections = [...host.querySelectorAll("main section")];
    expect(sections).toHaveLength(KEPT_RESULTS);
    expect(sections.map((s) => /Answer (\w+)\./.exec(s.textContent!)![1])).toEqual(["four", "three", "two"]);
    const toggle = sections[0].querySelector<HTMLButtonElement>("h3 button")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await act(async () => { toggle.click(); });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(sections[0].querySelector<HTMLElement>(`#${toggle.getAttribute("aria-controls")}`)!.hidden).toBe(true);
  });
});
