// @vitest-environment happy-dom
// A question with too little history (GLOSSARY: Analysis Canvas, Method): the row says how close it is in place of "not now".
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntryView, PickerList, ShortView } from "@ziffr/core/analysis-picker";
import { fact, listFor } from "./picker.fixtures";

vi.mock("server-only", () => ({}));
const pushed: string[] = [];
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (href: string) => pushed.push(href) }) }));
vi.mock("@/app/paste-actions", () => ({ pasteTemplateFile: vi.fn() }));
import { PickerGroups } from "./picker-list";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SHORT: ShortView = { words: "1 of 8 days. Ready on 4 Dec 2026 if you add one each day.", metric: { id: 1, name: "Steps", slug: "steps" }, span: "day", mayAddEarlier: true };
const withShort = (list: PickerList, id: EntryView["id"], short: ShortView): PickerList => ({ ...list, groups: list.groups.map((g) => ({ ...g, entries: g.entries.map((e) => (e.id === id ? { ...e, short } : e)) })) });

let host: HTMLElement; let root: Root;
async function mount(list: PickerList) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<PickerGroups list={list} openId={null} onPick={() => {}} ask={() => null} />); });
}
afterEach(() => { act(() => root.unmount()); host.remove(); });
const row = (name: string) => [...host.querySelectorAll("li")].find((li) => li.querySelector("button")?.textContent?.startsWith(name))!;
const list = () => withShort(listFor([fact(1, "Steps", { period: "day", periods: 1 })]), "usual", SHORT);

describe("a question with too little history", () => {
  it("says how close it is in place of not now", async () => {
    await mount(list());
    const usual = row("What is usual");
    expect(usual.textContent).toContain(SHORT.words);
    expect(usual.textContent).not.toContain("Not now.");
    // Another reason is still said as before.
    expect(row("Does A move with B?").textContent).toContain("Not now.");
  });

  it("opens Fill past periods for that Metric, with a way back to Analyze", async () => {
    await mount(list());
    const add = [...row("What is usual").querySelectorAll("button")].find((b) => b.textContent?.includes("Add earlier values"))!;
    await act(async () => { add.click(); });
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Fill past periods of Steps");
    expect(dialog.textContent).not.toMatch(/Ask my assistant|Send from another system/);
    await act(async () => { [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Open Paste history")!.click(); });
    expect(pushed).toEqual(["/paste-values?metric=steps&from=analyze"]);
  });

  it("offers no way to add values to someone who may not", async () => {
    await mount(withShort(list(), "usual", { ...SHORT, mayAddEarlier: false }));
    expect(row("What is usual").textContent).not.toContain("Add earlier values");
  });
});
