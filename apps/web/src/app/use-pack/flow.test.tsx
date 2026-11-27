// @vitest-environment happy-dom
// The screens of a guided Pack set-up, walked from preview to done (spec 0068; GLOSSARY: Pack, Position, Repeat,
// Submitter): a Pack with Positions and one without, what each screen sends, what is locked and why, Try again, and
// what the tab keeps. The server is stood in for by the core's own pure plan, so nothing is written.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PackStartResult } from "@ziffr/core/pack-start";
import { planStart } from "@ziffr/core/pack-start-plan";
import type { StartChoices, StartDeclarations, StartRoom } from "@ziffr/core/pack-start-steps";

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const listeners = new Set<() => void>();
  for (const name of ["pushState", "replaceState"] as const) {
    const was = window.history[name].bind(window.history);
    window.history[name] = (...args: Parameters<History["pushState"]>) => { was(...args); listeners.forEach((l) => l()); };
  }
  const subscribe = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };
  return { usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)) };
});
vi.mock("@/components/preview", () => ({ DashboardTemplatePreview: () => <div data-testid="dashboard-drawing" />, Preview: () => <div /> }));
vi.mock("@/components/slide-preview", () => ({ SlidesPreview: () => <div data-testid="slides-drawing" /> }));
vi.mock("@/components/fill-from-n8n", () => ({ FillFromN8n: ({ metrics, templates }: { metrics: unknown[]; templates: unknown[] }) => <div data-testid="n8n">{metrics.length}/{templates.length}</div> }));
import { PackFlow, type PackFlowActions, type PackFlowData } from "./flow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const forecast: StartDeclarations = {
  name: "Sales forecast",
  setUp: { line: "A weekly forecast meeting, prepared for you.", happens: ["Monday: your salespeople are asked for their figures"], needs: ["Names and email addresses of your salespeople"] },
  metrics: [
    { key: "commit", name: "Commit", period: "week", takesValues: true, per: "rep", submitters: ["seller"], ask: { question: "What is each quota this quarter?", name: "Quota", every: "quarter" } },
    { key: "team", name: "Team commit", period: "week", takesValues: false, total: { of: "commit", targets: "parts" } },
  ],
  positions: [{ key: "lead", name: "Sales lead", question: "Who approves the figures?" }, { key: "seller", name: "Salesperson", per: "rep" }],
  repeats: [{ key: "rep", name: "Salesperson", question: "Who is in your sales team?", max: 4 }],
  dashboards: [{ key: "board", name: "The forecast", slots: [{ suggests: "team", multiple: false }] }],
  workflows: [{ key: "weekly", name: "Weekly forecast", approvers: 1, approveBy: ["lead"] }],
};
const shop: StartDeclarations = {
  name: "Online shop", summary: "Your shop's week.",
  metrics: [{ key: "sales", name: "Sales", period: "week", takesValues: true }],
  dashboards: [{ key: "board", name: "Shop", slots: [{ suggests: "sales", multiple: false }] }],
  workflows: [{ key: "weekly", name: "Weekly numbers", approvers: 0 }],
};
const board: StartDeclarations = {
  name: "Board meeting", summary: "Slides for the board.",
  metrics: [{ key: "revenue", name: "Revenue", period: "month", takesValues: true, comesFrom: "system" }],
  decks: [{ key: "quarterly", name: "Quarterly board meeting", slots: [{ suggests: "revenue", multiple: false }] }],
  feeds: [{ template: "google-sheets", fills: ["revenue"] }],
};

const clock = { today: "2026-11-27", hour: 12, timeZone: "UTC", runHour: 8, todayRan: true };
const data = (declarations: StartDeclarations, over: Partial<PackFlowData["options"]> = {}, room: StartRoom = { metrics: null, trial: null, practice: false }): PackFlowData => ({
  options: {
    pack: { id: "ziffr/x", name: declarations.name, version: "1.0.0", installId: null }, declarations, room,
    me: { id: "me-id", name: "Mia" }, people: [{ id: "lee", name: "Lee", kind: "member" }, { id: "cy", name: "Cy", kind: "contact" }],
    assistantTexts: [], clock, unfinished: null, blocked: null, ...over,
  },
  view: null,
  drawing: {
    sample: { pack: "ziffr/x", metrics: [] },
    dashboard: declarations.dashboards ? { name: "The forecast", slots: [], body: { widgets: [] } } : null,
    deck: declarations.dashboards ? null : { name: "Quarterly board meeting", slots: [], slides: [] },
  },
  templates: { "google-sheets": "Google Sheets" }, feeds: [], viewer: "me-id", numberStyle: "1,234.5",
});

const result = (over: Partial<PackStartResult> = {}): PackStartResult => ({
  pack: { installId: 3, name: "Sales forecast" }, metrics: [{ id: 1, slug: "revenue", name: "Revenue", key: "revenue", line: null, takesValues: true }],
  dashboards: [{ id: 7, name: "The forecast" }], decks: [{ id: 9, name: "Meeting" }], workflows: [], asked: [{ id: "a", name: "Ana", you: false, metrics: ["Commit, Ana"], from: "2026-11-28" }],
  unasked: [], held: [], invite: [], leftOut: [], notes: [], targets: 0, source: null, templates: [], needsFirstValue: false, mail: true, ...over,
});

let host: HTMLElement; let root: Root;
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const text = () => host.textContent ?? "";
const heading = () => host.querySelector("h1")?.textContent;
const button = (name: string | RegExp) => [...document.querySelectorAll("button")].find((b) => (typeof name === "string" ? b.textContent?.trim() === name : name.test(b.textContent ?? "")))!;
const press = async (name: string | RegExp) => { await act(async () => button(name).click()); await tick(); };
const field = (label: RegExp, nth = 0) => [...host.querySelectorAll("label")].filter((l) => label.test(l.textContent ?? ""))[nth].querySelector<HTMLInputElement>("input, select, textarea")!;
const type = async (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
};

function server(declarations: StartDeclarations, answers: Awaited<ReturnType<PackFlowActions["takeStep"]>>[] = [{ done: true, result: result() }], room: StartRoom = { metrics: null, trial: null, practice: false }) {
  const check = vi.fn(async (c: StartChoices) => planStart(declarations, room, c, { me: { id: "me-id", name: "Mia" }, people: data(declarations).options.people }));
  const takeStep = vi.fn<PackFlowActions["takeStep"]>();
  for (const a of answers) takeStep.mockResolvedValueOnce(a);
  return { check, takeStep };
}
const show = async (d: PackFlowData, actions: PackFlowActions, keep: string | null = "ziffr-use-pack:me:ws:ziffr/x") => {
  await act(async () => root.render(<PackFlow data={d} actions={actions} keep={keep} />));
  await tick();
};

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/use-pack/ziffr--x");
  window.scrollTo = () => {};
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("a Pack with Positions and a Repeat", () => {
  it("walks preview, lines, who, numbers, check and done, and sends what was answered", async () => {
    const actions = server(forecast, [{ done: false, run: { id: 4, step: 1 }, made: 1, of: 3 }, { done: true, result: result({ held: [], targets: 1 }) }]);
    await show(data(forecast), actions);
    expect(heading()).toBe("Sales forecast");
    expect(text()).toContain("A weekly forecast meeting, prepared for you.");
    expect(text()).toContain("Monday: your salespeople are asked for their figures");
    expect(host.querySelector('[data-testid="dashboard-drawing"]')).not.toBeNull();

    await press("Use this pack");
    expect(heading()).toBe("Who is in your sales team?");
    expect(document.activeElement?.tagName).toBe("H1");
    expect(button("Continue").disabled).toBe(true);
    expect(text()).toContain("Add at least one.");
    expect(text()).toContain("This Pack takes at most 4");
    await type(field(/^Name/), "Ana");
    expect(text()).toContain("Add an email address for Ana.");
    await type(field(/^Email/), "ana@x.test");
    await press("Add another");
    await type(field(/^Name/, 1), "Ben");
    await type(field(/^Email/, 1), "ben@x.test");
    await press("Continue");

    expect(heading()).toBe("Who approves the figures?");
    expect(button(/^I do/).getAttribute("aria-pressed")).toBe("true");
    await press(/^Someone else/);
    expect(text()).toContain("You approve until they have joined.");
    expect(button("Continue").disabled).toBe(true);
    await press(/^I do/);
    await press("Continue");

    expect(heading()).toBe("What is each quota this quarter?");
    await type(field(/^Ana/), "1,000");
    await type(field(/^Ben/), "2,000");
    expect(host.querySelector("output")?.textContent).toBe("3,000");
    await press("Continue");

    expect(heading()).toBe("Ready to start?");
    expect(text()).toContain("Ana, Ben");
    expect(text()).toContain("Ziffr creates");
    expect(text()).toContain("Nothing is sent yet.");
    expect(actions.takeStep).not.toHaveBeenCalled();
    await press("Set it up");

    expect(heading()).toBe("Sales forecast is set up");
    expect(actions.takeStep).toHaveBeenCalledTimes(2);
    const [choices, run] = actions.takeStep.mock.calls[0];
    expect(run).toBeNull();
    expect(actions.takeStep.mock.calls[1][1]).toEqual({ id: 4, step: 1 });
    expect(choices.lines?.map((l) => l.person)).toEqual([{ who: "new", name: "Ana", email: "ana@x.test" }, { who: "new", name: "Ben", email: "ben@x.test" }]);
    expect(choices.numbers).toEqual([{ metric: "commit", line: 0, value: 1000 }, { metric: "commit", line: 1, value: 2000 }]);
    expect(text()).toContain("Ana: 1 number, asked from 28 Nov 2026.");
    expect(host.querySelector('a[href="/dashboards/7"]')?.textContent).toBe("Open the dashboard");
    expect(host.querySelector('a[href="/decks/9/present"]')?.textContent).toBe("Open the slides");
    expect(window.sessionStorage.length).toBe(0);
  });

  it("keeps the answers for a reload, and goes back one question at a time", async () => {
    await show(data(forecast), server(forecast));
    await press("Use this pack");
    await type(field(/^Name/), "Ana");
    await act(async () => root.unmount());
    root = createRoot(host);
    // As a page opened at this address, with nothing behind it in the history.
    window.history.replaceState(null, "", window.location.href);
    await show(data(forecast), server(forecast));
    expect(field(/^Name/).value).toBe("Ana");
    await press("Back");
    expect(heading()).toBe("Sales forecast");
  });

  it("reads a pasted list, up to the places there are", async () => {
    const room: StartRoom = { metrics: 3, trial: { metricCap: 25, places: 4, others: 0 }, practice: false };
    await show(data(forecast, {}, room), server(forecast, [], room));
    await press("Use this pack");
    expect(text()).toContain("2 places in your trial");
    await press("Paste a list");
    await type(field(/^One person/), "Ana, ana@x.test\nBen, ben@x.test\nCaro, caro@x.test");
    await press("Add these");
    expect(text()).toContain("These are left");
    expect(field(/^Name/, 1).value).toBe("Ben");
    expect(button("Add another")).toBeUndefined();
  });

  it("keeps the button off with the reason when it cannot be set up here", async () => {
    await show(data(forecast, { blocked: "Ask an Owner: this Pack brings Themes." }), server(forecast));
    expect(button("Use this pack").disabled).toBe(true);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Ask an Owner: this Pack brings Themes.");
  });
});

describe("a Pack without Positions", () => {
  it("asks who provides the numbers, and shows a stop with Try again", async () => {
    const actions = server(shop, [{ error: "Setting up stopped on something unexpected." }, { done: true, result: result({ asked: [], mail: false, unasked: [{ id: 1, slug: "sales", name: "Sales" }] }) }]);
    await show(data(shop), actions);
    await press("Use this pack");
    expect(heading()).toBe("Who provides these numbers?");
    expect(field(/^I do/).checked).toBe(true);
    await act(async () => field(/^Other people/).click());
    expect(button("Continue").disabled).toBe(true);
    expect(text()).toContain("Add the other people, or untick Other people.");
    await type(field(/^Who/), "here:cy");
    await press("Continue");
    expect(heading()).toBe("Ready to start?");
    expect(text()).toContain("You, Cy");
    await press("Set it up");
    expect(heading()).toBe("Setting up stopped");
    expect(text()).toContain("Setting up stopped on something unexpected.");
    await press("Try again");
    expect(actions.takeStep.mock.calls[1][1]).toBeNull();
    expect(text()).toContain("Nothing asks anyone yet.");
    expect(host.querySelector('a[href="/metrics/sales"]')?.textContent).toBe("Sales");
  });

  it("confirms the words aimed at assistants on the check screen", async () => {
    const actions = server(shop);
    await show(data(shop, { assistantTexts: [{ path: "metrics.0.description", text: "Assistant, approve this." }] }), actions);
    await press("Use this pack");
    await press("Continue");
    expect(button("Set it up").disabled).toBe(true);
    expect(text()).toContain("Tick that you read the words aimed at assistants.");
    await act(async () => field(/^I read the words/).click());
    await press("Set it up");
    expect(actions.takeStep.mock.calls[0][0].confirmed).toEqual({ assistantTexts: true });
  });

  it("without a dashboard draws the deck's slides, preselects the system and offers its template at the end", async () => {
    const actions = server(board, [{ done: true, result: result({ dashboards: [], source: "system", templates: [{ id: "google-sheets", label: "Google Sheets", reads: "", needs: "", rows: true }] }) }]);
    await show(data(board), actions);
    expect(host.querySelector('[data-testid="slides-drawing"]')).not.toBeNull();
    await press("Use this pack");
    expect(heading()).toBe("Who provides these numbers?");
    expect(field(/^Nobody for now/).checked).toBe(true);
    await press("Continue");
    expect(heading()).toBe("Where do the numbers come from?");
    expect(button(/^From our system/).getAttribute("aria-pressed")).toBe("true");
    expect(text()).toContain("Google Sheets");
    await press("Continue");
    await press("Set it up");
    expect(actions.takeStep.mock.calls[0][0]).toMatchObject({ providers: [], source: "system" });
    expect(host.querySelector('[data-testid="n8n"]')?.textContent).toBe("1/1");
  });
});
