// @vitest-environment happy-dom
// The deck page of a deck Ziffr makes (GLOSSARY: Deck, Slide; spec 0069): the form shows what will be saved.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeckDescription } from "@ziffr/pack/deck-description";

const calls = vi.hoisted(() => ({ clear: vi.fn(async () => ({ ok: true })), save: vi.fn<(id: number, change: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true })), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: calls.push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/made-deck-actions", () => ({ clearMadeAnswers: calls.clear, saveMadeSlides: calls.save, renameMadeDeck: vi.fn(), footerOfMadeDeck: vi.fn(), themeOfMadeDeck: vi.fn() }));
vi.mock("@/components/theme-picker", () => ({ ThemePicker: () => null }));
vi.mock("@/decks/slides/slide-view", () => ({ SlideView: () => null }));

import { MadeDeckPage } from "./made-deck-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const description = (answer: string, hidden = false): DeckDescription => ({
  format: "ziffr.deck/1", design: "band", emphasis: "strong",
  slides: [{ id: "sl_1", type: "questions", metrics: [], options: {}, headline: null, hidden, answers: [{ question: "What next?", text: answer, writtenOn: answer ? "2026-11-01" : null }] }],
});
let host: HTMLElement; let root: Root;
const page = (d: DeckDescription) => <MadeDeckPage id={5} name="Review" footer={null} themeId={null} themes={[]} description={d} drawing={null} leftOut={0} />;
const show = async (d: DeckDescription) => {
  if (!root) { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); }
  await act(async () => { root.render(page(d)); });
};
afterEach(() => { act(() => root.unmount()); host.remove(); root = undefined as never; vi.clearAllMocks(); });
const button = (words: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === words)!;
const press = async (el: HTMLElement) => { await act(async () => { el.click(); }); };
/** Types into a field as a person does, so React hears it. */
const type = async (field: HTMLInputElement | HTMLTextAreaElement, words: string) => {
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")!.set!;
  await act(async () => { set.call(field, words); field.dispatchEvent(new Event("input", { bubbles: true })); });
};
const answer = () => host.querySelector("textarea")!;
const headline = () => host.querySelector<HTMLInputElement>('input[placeholder="Ziffr writes one"]')!;

describe("Clear answers", () => {
  it("empties the boxes, keeps other changes, and the next save does not write the old answer back", async () => {
    await show(description("Hire two people"));
    await type(headline(), "My headline");
    await press(button("Clear answers"));
    await show(description(""));
    expect(answer().value).toBe("");
    expect(headline().value).toBe("My headline");
    await press(button("Save changes"));
    expect(calls.save.mock.calls[0]![1]).toEqual({ slides: [{ id: "sl_1", hidden: false, headline: "My headline", answers: [{ question: "What next?", text: "" }] }] });
  });

  it("leaves the boxes as they are when clearing is refused", async () => {
    calls.clear.mockResolvedValueOnce({ error: "Not allowed" } as never);
    await show(description("Hire two people"));
    await press(button("Clear answers"));
    expect(answer().value).toBe("Hire two people");
  });
});
