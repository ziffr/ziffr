// The words and small rules of the Retention setting (spec 0033, ticket #381).
import { describe, expect, it } from "vitest";
import { dayWords, needsConfirmation, pendingNote, retentionWords, storedPending, storedRetention } from "./retention-words";

const condense = (keep_months: number, into: "week" | "month" | "quarter" | "year" = "month") => ({ keep_months, then: "condense" as const, into });
const del = (keep_months: number) => ({ keep_months, then: "delete" as const });

describe("retention words", () => {
  it("says a setting in a sentence", () => {
    expect(retentionWords(null)).toMatch(/kept for ever/);
    expect(retentionWords(condense(24))).toBe("keep 2 years, then condense into months");
    expect(retentionWords(del(12 + 12 * 4))).toBe("keep 5 years, then delete");
    expect(retentionWords(del(13))).toBe("keep 13 months, then delete");
    expect(retentionWords(del(12))).toBe("keep 1 year, then delete");
  });

  it("needs a confirmation only for what keeps less", () => {
    expect(needsConfirmation(null, null)).toBe(false);
    expect(needsConfirmation(condense(24), null)).toBe(false);
    expect(needsConfirmation(null, condense(24))).toBe(true);
    expect(needsConfirmation(condense(24), condense(36))).toBe(false);
    expect(needsConfirmation(condense(24), condense(13))).toBe(true);
    expect(needsConfirmation(condense(24), del(24))).toBe(true);
    expect(needsConfirmation(del(24), condense(24))).toBe(false);
    expect(needsConfirmation(del(24), del(36))).toBe(false);
    expect(needsConfirmation(condense(24, "month"), condense(24, "year"))).toBe(true);
    expect(needsConfirmation(condense(24, "month"), condense(24, "month"))).toBe(false);
  });

  it("reads back only what is a setting", () => {
    expect(storedRetention(undefined)).toBeNull();
    expect(storedRetention({ keep_months: 3, then: "delete" })).toBeNull();
    expect(storedRetention(del(24))).toEqual(del(24));
    const ok = { retention: del(24), starts_on: "2026-12-01", confirmed_on: "2026-11-23", set_by: "p", told: true, reminded: false };
    expect(storedPending(ok)).toEqual(ok);
    expect(storedPending({ ...ok, told: "yes", reminded: 1 })).toEqual({ ...ok, told: false, reminded: false });
    for (const bad of [null, [], "x", { ...ok, starts_on: "soon" }, { ...ok, retention: null }, { ...ok, set_by: 1 }]) expect(storedPending(bad)).toBeNull();
  });

  it("says when the values go", () => {
    expect(dayWords("2026-11-28")).toBe("28 November 2026");
    const p = { retention: condense(24, "month"), starts_on: "2026-11-28", confirmed_on: "2026-11-20", set_by: "p", told: true, reminded: false };
    expect(pendingNote(p, "2024-11-28")).toBe("Values before 28 November 2024 will be condensed into months from 28 November 2026.");
    expect(pendingNote({ ...p, retention: del(24) }, "2024-11-28")).toBe("Values before 28 November 2024 will be deleted from 28 November 2026.");
  });
});
