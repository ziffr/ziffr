import { describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { DemoTextRefused, demoPasteText, demoTextForVisit } from "./demo-text";
import { DEMO_TEXT_WORDS, DEMO_VALUE_WORDS } from "./demo-words";

describe("a visitor's text as a core operation takes it", () => {
  it("is used as it is when it is not a visit's, so the operation's own checks stay what they were", () => {
    expect(demoTextForVisit(false, "see https://example.test", "message")).toBe("see https://example.test");
    expect(demoTextForVisit(false, "", "name")).toBe("");
  });

  it("is cleaned for a visit, and an empty one is left to the operation", () => {
    expect(demoTextForVisit(true, "  42​ ", "name")).toBe("42");
    expect(demoTextForVisit(true, "   ", "name")).toBe("   ");
    expect(demoTextForVisit(true, "", "message")).toBe("");
  });

  it("is refused for a visit with the words to show, as a Forbidden", () => {
    for (const [text, words] of [["see www.example.test", DEMO_TEXT_WORDS.link], ["<b>x</b>", DEMO_TEXT_WORDS.markup], ["x".repeat(500), DEMO_TEXT_WORDS.long]] as const) {
      let caught: unknown;
      try { demoTextForVisit(true, text, "name"); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(DemoTextRefused);
      expect(caught).toBeInstanceOf(Forbidden);
      expect((caught as Error).message).toBe(words);
    }
  });
});

describe("a paste's cells", () => {
  it("keep their tabs, empty cells and blank lines, and lose only what the text rules strip", () => {
    expect(demoPasteText("\tJan\tFeb\nRevenue\t1​2\t30\n\nCost\t\t5")).toBe("\tJan\tFeb\nRevenue\t12\t30\n\nCost\t\t5");
  });

  it("is refused whole when one line is, with that line's words", () => {
    expect(() => demoPasteText("Revenue\t1\nsee www.example.test\t2")).toThrow(DEMO_TEXT_WORDS.link);
  });

  it("is refused past 400 lines, and takes 400", () => {
    expect(() => demoPasteText(Array.from({ length: 400 }, (_, i) => `M${i}\t1`).join("\n"))).not.toThrow();
    expect(() => demoPasteText(Array.from({ length: 401 }, (_, i) => `M${i}\t1`).join("\n"))).toThrow(DEMO_VALUE_WORDS.pasteLong);
  });
});
