// @vitest-environment happy-dom
// Present for a deck Ziffr makes (GLOSSARY: Deck, Slide; spec 0069): what the keys do.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeckDrawing } from "@ziffr/core/deck-drawing/draw-deck";

const calls = vi.hoisted(() => ({ push: vi.fn(), left: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: calls.push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest} onClick={(e) => { e.preventDefault(); calls.left(); }}>{children}</a> }));
vi.mock("@/decks/slides/fonts", () => ({ slideFontsHref: () => "data:text/css," }));
vi.mock("@/decks/slides/slide-view", () => ({ SlideView: () => null }));

import { Presenter } from "./presenter";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// The slide fonts are a stylesheet the test does not load.
(window as unknown as { happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: boolean } } }).happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
const drawing = { look: { fonts: [] }, slides: [1, 2, 3].map((n) => ({ id: `sl_${n}`, headline: `Slide ${n}` })) } as unknown as DeckDrawing;
let host: HTMLElement; let root: Root;
beforeEach(async () => {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<Presenter name="Review" drawing={drawing} start={1} back="/decks/5/slides" />); });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });
/** Presses a key on an element; answers whether the browser would still do its own action. */
const key = async (name: string, on: Element = document.body, shiftKey = false) => {
  let left = true;
  await act(async () => { left = on.dispatchEvent(new KeyboardEvent("keydown", { key: name, shiftKey, bubbles: true, cancelable: true })); });
  return left;
};
const at = () => host.querySelector("[aria-live]")!.textContent!.match(/Slide (\d) of/)![1];
const labelled = (label: string) => host.querySelector(`[aria-label="${label}"]`)!;

describe("the keys while presenting", () => {
  it("leaves on Escape", async () => {
    await key("Escape");
    expect(calls.push).toHaveBeenCalledWith("/decks/5/slides");
  });

  it("goes on with Space and back with Shift and Space", async () => {
    await key(" ");
    expect(at()).toBe("3");
    await key(" ", document.body, true);
    expect(at()).toBe("2");
  });

  it("leaves Enter and Space to a focused button", async () => {
    for (const name of ["Enter", " "]) expect(await key(name, labelled("Previous slide"))).toBe(true);
    expect(at()).toBe("2");
  });

  it("follows a focused link: Enter by the browser, Space by a click", async () => {
    expect(await key("Enter", labelled("Leave the presentation"))).toBe(true);
    expect(calls.left).not.toHaveBeenCalled();
    await key(" ", labelled("Leave the presentation"));
    expect(calls.left).toHaveBeenCalledTimes(1);
    expect(at()).toBe("2");
  });
});
