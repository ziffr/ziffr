// The words the Installation's audit keeps (GLOSSARY: Installation Admin): cut by characters, never into half an emoji.
import { describe, expect, it } from "vitest";
import { auditWords } from "./installation-admins";

describe("auditWords", () => {
  it("cuts at 120 characters, not UTF-16 units, so an emoji is never split", () => {
    const cut = auditWords("a" + "😀".repeat(139));
    expect(Array.from(cut)).toHaveLength(120);
    expect(cut).toBe("a" + "😀".repeat(119));
    expect(encodeURIComponent(cut)).toBeTruthy();
  });
  it("removes a lone surrogate, which the database would refuse", () => {
    expect(auditWords("x\uD83Dy")).toBe("x\uFFFDy");
  });
  it("leaves short plain words as they are", () => {
    expect(auditWords("Maintenance tonight")).toBe("Maintenance tonight");
  });
});
