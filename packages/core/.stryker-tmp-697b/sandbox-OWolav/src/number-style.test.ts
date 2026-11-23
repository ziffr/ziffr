// @ts-nocheck
// The Number Style's pure rules (spec 0022, ticket #108): the four keys, a country's usual style and the example.
import { describe, expect, it } from "vitest";
import { COUNTRIES } from "./workspace-profile";
import { DEFAULT_NUMBER_STYLE, effectiveNumberStyle, isNumberStyle, NUMBER_STYLES, numberStyleExample, numberStyleForCountry } from "./number-style";

describe("the Number Style", () => {
  it("is one of four keys, 1,234.5 by default", () => {
    expect(NUMBER_STYLES).toEqual(["1,234.5", "1.234,5", "1 234,5", "1'234.5"]);
    expect(DEFAULT_NUMBER_STYLE).toBe("1,234.5");
    for (const s of NUMBER_STYLES) expect(isNumberStyle(s)).toBe(true);
    for (const bad of ["1.234.5", "", null, undefined, 1, "toString", "1 234,5 "]) expect(isNumberStyle(bad)).toBe(false);
  });
  it("takes the style a country usually writes", () => {
    expect(numberStyleForCountry("DE")).toBe("1.234,5");
    expect(numberStyleForCountry("BR")).toBe("1.234,5");
    expect(numberStyleForCountry("FR")).toBe("1 234,5");
    expect(numberStyleForCountry("ZA")).toBe("1 234,5");
    expect(numberStyleForCountry("CH")).toBe("1'234.5");
    expect(numberStyleForCountry("US")).toBe("1,234.5");
    expect(numberStyleForCountry("GB")).toBe("1,234.5");
    for (const none of [null, undefined, "", "XX", "de", "constructor"]) expect(numberStyleForCountry(none)).toBe("1,234.5");
  });
  it("maps only codes from the Workspace Profile's country list", () => {
    for (const c of ["DE", "AT", "NL", "BE", "ES", "IT", "PT", "DK", "BR", "ID", "TR", "GR", "FR", "SE", "NO", "FI", "PL", "CZ", "SK", "HU", "RU", "UA", "ZA", "CH", "LI"]) {
      expect(COUNTRIES).toContain(c);
      expect(numberStyleForCountry(c)).not.toBe("1,234.5");
    }
  });
  it("keeps a chosen style over the country's", () => {
    expect(effectiveNumberStyle("1 234,5", "DE")).toBe("1 234,5");
    expect(effectiveNumberStyle(null, "DE")).toBe("1.234,5");
    expect(effectiveNumberStyle("nonsense", null)).toBe("1,234.5");
  });
  it("shows each style with an example", () => {
    expect(NUMBER_STYLES.map(numberStyleExample)).toEqual(["1,234.5 (12.5 %)", "1.234,5 (12,5 %)", "1 234,5 (12,5 %)", "1'234.5 (12.5 %)"]);
  });
});
