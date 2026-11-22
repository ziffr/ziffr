// Tag names, pure (GLOSSARY: Tag; spec 0038): normalising, what is allowed and the list a program or a Pack sends.
import { describe, expect, it } from "vitest";
import { cleanTagNames, normaliseTagName, tagKey, tagNameProblem, TAG_NAME_MAX, TAGS_PER_METRIC } from "./tag-names";

describe("normaliseTagName", () => {
  it("makes Unicode NFC, drops leading # and surrounding space, and folds white space to one space", () => {
    expect(normaliseTagName("  #finance ")).toBe("finance");
    expect(normaliseTagName("##weekly   \t review\n")).toBe("weekly review");
    expect(normaliseTagName("Café")).toBe("Café");
    expect(normaliseTagName("# ")).toBe("");
    expect(normaliseTagName(null)).toBe("");
  });
  it("folds no other way: Finanz and finance stay two words, capitals only decide equality", () => {
    expect(normaliseTagName("Finanz")).not.toBe(normaliseTagName("finance"));
    expect(tagKey("Finance")).toBe(tagKey("finance"));
    expect(tagKey("Straße")).not.toBe(tagKey("STRASSE"));
  });
});

describe("tagNameProblem", () => {
  it("allows 1 to 32 characters of plain text", () => {
    expect(tagNameProblem("a")).toBeNull();
    expect(tagNameProblem("x".repeat(TAG_NAME_MAX))).toBeNull();
    expect(tagNameProblem("R&D / Berlin shop 🏬")).toBeNull();
    expect(tagNameProblem("é".repeat(TAG_NAME_MAX))).toBeNull();
  });
  it("refuses nothing, 33 characters, a comma, markup and control or invisible characters, in words", () => {
    expect(tagNameProblem("")).toMatch(/needs a word/);
    expect(tagNameProblem("x".repeat(TAG_NAME_MAX + 1))).toMatch(/at most 32/);
    expect(tagNameProblem("a,b")).toMatch(/comma/);
    expect(tagNameProblem("<b>bold</b>")).toMatch(/markup/);
    expect(tagNameProblem("a\u0000b")).toMatch(/control/);
    expect(tagNameProblem("a‮b")).toMatch(/control/);
    expect(tagNameProblem("a​b")).toMatch(/control/);
  });
  it("counts characters, not UTF-16 units", () => {
    expect(tagNameProblem("🏬".repeat(TAG_NAME_MAX))).toBeNull();
    expect(tagNameProblem("🏬".repeat(TAG_NAME_MAX + 1))).toMatch(/at most 32/);
  });
});

describe("cleanTagNames", () => {
  it("normalises, keeps the first spelling of a word and its order", () => {
    expect(cleanTagNames(["#Finance", "monthly", "finance", " Monthly "])).toEqual({ names: ["Finance", "monthly"] });
    expect(cleanTagNames([])).toEqual({ names: [] });
  });
  it("refuses what is not a list of words, a bad word and more than 10 Tags, never cutting silently", () => {
    expect(cleanTagNames("finance")).toHaveProperty("error");
    expect(cleanTagNames([1])).toHaveProperty("error");
    expect(cleanTagNames(["ok", "a,b"])).toHaveProperty("error");
    expect(cleanTagNames(Array.from({ length: TAGS_PER_METRIC + 1 }, (_, i) => `t${i}`))).toHaveProperty("error");
    expect(cleanTagNames(Array.from({ length: TAGS_PER_METRIC }, (_, i) => `t${i}`))).toHaveProperty("names");
    // The same word twice is one Tag, so it does not count twice.
    expect(cleanTagNames([...Array.from({ length: TAGS_PER_METRIC }, (_, i) => `t${i}`), "T0"])).toHaveProperty("names");
    expect(cleanTagNames(Array.from({ length: 100_000 }, () => "x"))).toHaveProperty("error");
  });
});
