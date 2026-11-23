// Questions you can ask about a Metric (ticket #988): the entries that fit come first, a few that do not stay greyed with their
// reason, and "See all questions" opens Analyze on this Metric. The card only draws what the core gave for this person.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EntryView } from "@ziffr/core/analysis-picker";
import { ENTRIES, textsOf } from "@ziffr/core/method-picker";
import { QuestionsList, questionsToShow } from "./metric-questions";

const view = (i: number, ok: boolean): EntryView => {
  const e = ENTRIES[i];
  return { id: e.id, name: e.name, sentence: e.sentence, technical: e.technical, ...textsOf(e), slots: e.slots, settings: e.settings, needs: "1 Metric on the canvas", fit: ok ? { entry: e.id, ok: true } : { entry: e.id, ok: false, reason: `Reason ${i}.` }, defaults: {}, recipeFile: false, widget: e.widget };
};
const entries = ENTRIES.map((_, i) => view(i, i % 3 !== 0));

describe("questions about a Metric", () => {
  it("shows up to four that fit and two that do not", () => {
    const shown = questionsToShow(entries);
    expect(shown.filter((e) => e.fit.ok)).toHaveLength(4);
    expect(shown.filter((e) => !e.fit.ok)).toHaveLength(2);
    expect(shown.slice(0, 4).every((e) => e.fit.ok)).toBe(true);
  });

  it("draws the reasons of the greyed ones and the link into Analyze with the Metric's slug", () => {
    const html = renderToStaticMarkup(<QuestionsList name="Cost" slug="cost" entries={entries} />);
    expect(html).toContain("Questions you can ask about Cost");
    expect(html).toContain("Reason 0.");
    expect(html).toContain('href="/analyze?metric=cost"');
    expect(html).toContain("See all questions");
    expect(html).not.toMatch(/coming soon/i);
  });
});
