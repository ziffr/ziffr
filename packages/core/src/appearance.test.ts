import { describe, expect, it } from "vitest";
import { APPEARANCES, APPEARANCE_WORDS, parseAppearance } from "./appearance";

describe("appearance", () => {
  it("keeps the four choices and names each", () => {
    expect(APPEARANCES).toEqual(["system", "light", "dark", "contrast"]);
    for (const a of APPEARANCES) expect(APPEARANCE_WORDS[a].label).toBeTruthy();
  });
  it("reads a known value and falls back to System for anything else", () => {
    for (const a of APPEARANCES) expect(parseAppearance(a)).toBe(a);
    for (const v of [undefined, null, "", "Dark", "sepia", 3, {}]) expect(parseAppearance(v)).toBe("system");
  });
});
