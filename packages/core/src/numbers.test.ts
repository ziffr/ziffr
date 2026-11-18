import { describe, expect, it } from "vitest";
import { valueInText } from "./numbers";

describe("valueInText", () => {
  it.each([
    ["12", 12],
    ["we closed 3 today", 3],
    ["126,657 €", 126657],
    ["1,234,567", 1234567],
    ["1.234.567", 1234567],
    ["126 657", 126657],
    ["1,234.5", 1234.5],
    ["1'200", 1200],
  ])("reads %s as before", (text, value) => expect(valueInText(text)).toBe(value));

  it.each([
    ["1,5", 1.5],
    ["12,50", 12.5],
    ["0,5", 0.5],
    ["1,2345", 1.2345],
    ["1.234,56", 1234.56],
    ["12.345,67 €", 12345.67],
    ["Umsatz: 4,75 Mio", 4.75],
  ])("reads the decimal comma in %s", (text, value) => expect(valueInText(text)).toBe(value));

  it("reads a typographic minus", () => {
    expect(valueInText("−5")).toBe(-5);
    expect(valueInText("-5")).toBe(-5);
  });

  it("keeps a lone dot as the decimal point until the Number Style settles it", () => {
    expect(valueInText("1.500")).toBe(1.5);
  });

  it("finds no number in text without one, or one that is not finite", () => {
    expect(valueInText("no idea")).toBeNull();
    expect(valueInText("9".repeat(400))).toBeNull();
  });
});
