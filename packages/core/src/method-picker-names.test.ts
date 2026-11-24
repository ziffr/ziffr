// The picker's questions in the Metrics' own words (ticket #988): named where the Metrics are known, generic where they are not.
import { describe, expect, it } from "vitest";
import { ENTRIES } from "./method-picker";
import { questionFor, sentenceFor } from "./method-picker-names";

const generic = (id: string) => ENTRIES.find((e) => e.id === id)!.name;

describe("questionFor", () => {
  it("names the Metrics the person has chosen", () => {
    expect(questionFor("moves", { metric: "Cost" }, generic("moves"))).toBe("What moves Cost?");
    expect(questionFor("needs", { metric: "Revenue", goal: "1.2m" }, generic("needs"))).toBe("What does Revenue need to reach 1.2m?");
    expect(questionFor("what-if", { metric: "Support tickets", percent: "10" }, generic("what-if"))).toBe("What if we change Support tickets by 10 %?");
    expect(questionFor("what-if", { metric: "Support tickets", by: "-250" }, generic("what-if"))).toBe("What if we change Support tickets by -250?");
    expect(questionFor("correlation", { first: "Support tickets", second: "Return rate" }, generic("correlation"))).toBe("Does Support tickets move with Return rate?");
    expect(questionFor("matrix", { metrics: ["Cost", "Revenue", "Support tickets"] }, generic("matrix"))).toBe("How do Cost, Revenue and Support tickets move together?");
    expect(questionFor("matrix", { metrics: ["Cost", "Revenue"] }, generic("matrix"))).toBe(generic("matrix"));
    expect(questionFor("partial", { first: "A1", second: "B1", held: ["C1", "D1"] }, generic("partial"))).toBe("Do A1 and B1 still move together when C1 and D1 is held the same?");
  });

  it("keeps the generic words where a Slot is empty or a typed setting is blank", () => {
    for (const e of ENTRIES) expect(questionFor(e.id, {}, e.name), e.id).toBe(e.name);
    expect(questionFor("correlation", { first: "Cost" }, generic("correlation"))).toBe(generic("correlation"));
    expect(questionFor("needs", { metric: "Revenue", goal: "  " }, generic("needs"))).toBe("What does Revenue need to reach a value?");
    expect(questionFor("what-if", { metric: "Cost" }, generic("what-if"))).toBe("What if we change Cost?");
  });

  it("puts a name in as text, whatever it holds", () => {
    expect(questionFor("moves", { metric: "<b>x</b> $1 B" }, "")).toBe("What moves <b>x</b> $1 B?");
  });

  it("words no entry with a letter once every Slot is filled, and never with a word that claims a cause", () => {
    const all = { metric: "Cost", first: "Cost", second: "Revenue", held: ["Visits"], metrics: ["Cost", "Revenue", "Visits"], goal: "5", percent: "10" };
    for (const e of ENTRIES) {
      const q = questionFor(e.id, all, e.name);
      expect(q, e.id).not.toMatch(/\b[ABC]\b/);
      expect(q.toLowerCase(), e.id).not.toMatch(/\bcause|because|impact/);
    }
  });
});

describe("sentenceFor", () => {
  it("replaces B for the entries that speak of it, and leaves the others alone", () => {
    const moves = ENTRIES.find((e) => e.id === "moves")!;
    expect(sentenceFor("moves", moves.sentence, { metric: "Cost" })).toContain("matter most for Cost");
    expect(sentenceFor("moves", moves.sentence, {})).toBe(moves.sentence);
    expect(sentenceFor("forecast", "x B", { metric: "Cost" })).toBe("x B");
  });
});
