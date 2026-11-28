import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ReadDeck } from "@ziffr/core/deck-read";
import type { Theme } from "@ziffr/core/types";

import { Presenter } from "@/app/decks/[id]/present/presenter";
import { DECK, slideOf, THEMES } from "./check/samples";
import { drawMadeDeck } from "./made-drawing";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const theme: Theme = { id: 1, owner_id: "", name: "Light", ...THEMES["ziffr-light"]!, is_default: true, updated_at: "" };
const slide = (type: string, hidden = false) => ({ ...slideOf(type), hidden, answers: [] }) as ReadDeck["deck"]["description"]["slides"][number];
const read = (themes: Theme[], hidden = false): ReadDeck => ({
  deck: { id: 1, name: "Review", role: "owner", themeId: null, footer: null, description: { format: "ziffr.deck/1", design: "band", emphasis: "strong", slides: [slide("cover"), slide("about", hidden)] } },
  data: { ...DECK.data, themes },
  leftOut: 0,
});

describe("a deck Ziffr made, drawn for the screen", () => {
  it("draws the slides it was given and leaves hidden ones out", () => {
    expect(drawMadeDeck(read([theme]))!.slides.map((s) => s.type)).toEqual(["cover", "about"]);
    expect(drawMadeDeck(read([theme], true))!.slides.map((s) => s.type)).toEqual(["cover"]);
  });

  it("draws nothing when the Workspace has no Theme", () => {
    expect(drawMadeDeck(read([]))).toBeNull();
  });

  it("presents the slide it starts at, with its place named for those who cannot see it", () => {
    const drawing = drawMadeDeck(read([theme]))!;
    const html = renderToStaticMarkup(<Presenter name="Review" drawing={drawing} start={1} back="/decks" />);
    expect(html).toContain("Slide 2 of 2");
    expect(html).toContain('aria-label="Previous slide"');
  });
});
