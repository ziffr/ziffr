// The side a unit is proposed on while it is typed (ticket #184): well-known signs and currency codes only.
import { describe, expect, it } from "vitest";
import { suggestedSide } from "./units";

describe("suggestedSide", () => {
  it("puts dollar, pound and yen signs and currency codes before the number", () => {
    for (const u of ["$", " $ ", "US$", "£", "¥", "CHF", "USD"]) expect(suggestedSide(u)).toBe("before");
  });
  it("puts the euro, percent and Nordic krona after it", () => {
    for (const u of ["€", "%", "kr"]) expect(suggestedSide(u)).toBe("after");
  });
  it("proposes nothing for other units, so the chosen side stays", () => {
    for (const u of ["", "d", "pc", "km", "chf", "users"]) expect(suggestedSide(u)).toBeNull();
  });
});
