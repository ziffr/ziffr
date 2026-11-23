// Words that fit a narrow place: broken only at spaces, a word too long clipped with an ellipsis, wide scripts counted double.
import { describe, expect, it } from "vitest";
import { fitWords } from "./label-fit";

describe("fitWords", () => {
  it("keeps words whole and breaks only at spaces", () => {
    expect(fitWords("Germany", 7, 3)).toEqual(["Germany"]);
    expect(fitWords("Not in these parts", 8, 3)).toEqual(["Not in", "these", "parts"]);
  });
  it("clips a word longer than a line with an ellipsis, never splitting it", () => {
    expect(fitWords("Extraordinarily", 6, 3)).toEqual(["Extra…"]);
    expect(fitWords("A Extraordinarily", 6, 3)).toEqual(["A", "Extra…"]);
  });
  it("ends the last line with an ellipsis when words are left over", () => {
    expect(fitWords("one two three four", 5, 2)).toEqual(["one", "two…"]);
    expect(fitWords("one two three four", 5, 1)).toEqual(["one…"]);
    expect(fitWords("abcde fghij", 5, 1)).toEqual(["abcd…"]);
  });
  it("counts wide scripts twice", () => {
    expect(fitWords("売上高の推移", 6, 1)).toEqual(["売上…"]);
    expect(fitWords("売上高", 6, 1)).toEqual(["売上高"]);
  });
  it("gives one empty line for no words", () => {
    expect(fitWords("  ", 5, 2)).toEqual([""]);
  });
});
