// What a Heads-up message says (GLOSSARY: Heads-up, Takeaway): the sentence, the basis, the footer and the line about the cap.
import { describe, expect, it } from "vitest";
import { headsUpMessage, WEEKLY_CAP } from "./heads-up-message";
import { keyMetricIds } from "./heads-up-state";
import type { Takeaway } from "./takeaways/takeaway";

const takeaway = (over: Partial<Takeaway>): Pick<{ takeaway: Takeaway }, "takeaway"> => ({ takeaway: { kind: "answer", sentence: "A and B have started moving together.", basis: "changes over 18 months", footer: "This shows what has gone together, not what caused what.", ...over } as Takeaway });

describe("headsUpMessage", () => {
  it("says the sentence, the basis with a capital and a full stop, the footer and the cap, and names the Metrics in the subject", () => {
    const m = headsUpMessage(takeaway({}), ["A", "B"])!;
    expect(m.subject).toBe("Heads-up: A and B");
    expect(m.text.split("\n")).toEqual([
      "A and B have started moving together.",
      "Changes over 18 months.",
      "This shows what has gone together, not what caused what.",
      `At most ${WEEKLY_CAP} Heads-ups a week reach you by message; the rest wait under Analyze. You can turn these messages off under Your Deliveries.`,
    ]);
    expect(WEEKLY_CAP).toBe(3);
  });

  it("leaves out a basis or a footer that is not there, names one Metric alone, and says nothing for a refusal or no sentence", () => {
    expect(headsUpMessage(takeaway({ basis: null }), ["Only"])!.text.split("\n")).toHaveLength(3);
    // Without the footer nothing is said at all.
    expect(headsUpMessage(takeaway({ footer: null }), ["Only"])).toBeNull();
    expect(headsUpMessage(takeaway({ footer: "" }), ["Only"])).toBeNull();
    expect(headsUpMessage(takeaway({ basis: "" }), ["A"])!.text).not.toMatch(/\n\./);
    expect(headsUpMessage(takeaway({ kind: "refusal" }), ["A"])).toBeNull();
    expect(headsUpMessage(takeaway({ sentence: null }), ["A"])).toBeNull();
    expect(headsUpMessage(takeaway({ sentence: "" }), ["A"])).toBeNull();
  });

  it("keeps a subject to 120 characters, one step either side, counting what a person sees as one", () => {
    const at = (n: number) => headsUpMessage(takeaway({}), ["x".repeat(n - "Heads-up: ".length)])!.subject;
    expect(at(120)).toBe(`Heads-up: ${"x".repeat(110)}`);
    expect(at(119)).toHaveLength(119);
    expect([...at(121)]).toHaveLength(120);
    expect(at(121).endsWith("…")).toBe(true);
    expect([...headsUpMessage(takeaway({}), ["😀".repeat(200)])!.subject]).toHaveLength(120);
  });
});

describe("keyMetricIds", () => {
  it("reads the Metrics a key names, and nothing that is not a key", () => {
    expect(keyMetricIds("moving-together:12:40")).toEqual([12, 40]);
    expect(keyMetricIds("target-out-of-reach:7")).toEqual([7]);
    for (const bad of ["", "moving-together", "moving-together:", "moving-together:0", "moving-together:1:2:3", "Moving:1", "1:2", "a b:1", "a:1x", "a:-1", "a:99999999999", `${"a".repeat(41)}:1`, 5, null, undefined, {}]) expect(keyMetricIds(bad)).toBeNull();
    expect(keyMetricIds(`${"a".repeat(40)}:1`)).toEqual([1]);
    expect(keyMetricIds("a:9999999999")).toEqual([9999999999]);
  });
});
