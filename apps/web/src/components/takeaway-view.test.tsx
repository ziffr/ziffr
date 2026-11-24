// The order of a Takeaway as drawn (spec 0041, "The Takeaway format"; ticket #988): the sentence first, then what was done differently,
// the basis, the cautions and assumptions, the track record, and the footer last. A caution never stands above the sentence.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Takeaway } from "@ziffr/core/takeaways/takeaway";
import { TakeawayView } from "./takeaway-view";

const takeaway = { kind: "answer", method: "Pearson", sentence: "Support tickets and Return rate tend to move together over 17 months (moderate).", refusal: null, strength: "moderate", strengthText: "moderate", range: null, basis: "compared month by month", assumptions: ["It assumes the link is a straight line."], cautions: ["This result is pulled by 1 month far from the rest."], notes: ["Rank correlation was used instead."], track: "The range would have held 10 of 12 times.", footer: "This shows what moved together; it does not show why.", figures: [], numbers: [] } as Takeaway;

describe("TakeawayView", () => {
  it("draws the sentence, the notes, the basis, the cautions, the assumptions, the track record and the footer, in that order", () => {
    const html = renderToStaticMarkup(<TakeawayView takeaway={takeaway} />);
    const at = [takeaway.sentence, "Rank correlation was used", "Compared month by month", "pulled by 1 month", "straight line", "would have held", "does not show why", "Show the numbers"].map((t) => html.indexOf(t!));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((x, y) => x - y));
  });
});
