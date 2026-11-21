// The words and small rules of the Retention setting (spec 0033, ticket #381).
import { describe, expect, it } from "vitest";
import { suggestedRetention, dayWords, needsConfirmation, pendingNote, retentionForApi, retentionFromParam, retentionToParam, retentionWords, storedPending, storedRetention } from "./retention-words";

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
    const ok = { id: "a", retention: del(24), starts_on: "2026-12-01", starts_after: "2026-12-01T08:00:00.000Z", confirmed_on: "2026-11-23", set_by: "p", counted: { periods: 3, values: 9, held_back_periods: 1, held_back_values: 2 }, told: true, reminded: false };
    expect(storedPending(ok)).toEqual(ok);
    // A confirmation made before the daily job counted what it left alone reads as having left none.
    expect(storedPending({ ...ok, counted: { periods: 3, values: 9, held_back_periods: 0, held_back_values: 0 } })?.counted).toEqual({ periods: 3, values: 9, held_back_periods: 0, held_back_values: 0 });
    expect(storedPending({ ...ok, told: "yes", reminded: 1 })).toEqual({ ...ok, told: false, reminded: false });
    for (const bad of [null, [], "x", { ...ok, starts_on: "soon" }, { ...ok, retention: null }, { ...ok, set_by: 1 }, { ...ok, id: 1 }, { ...ok, starts_after: "later" }, { ...ok, starts_after: 5 }, { ...ok, counted: null }, { ...ok, counted: { periods: -1, values: 1 } }, { ...ok, counted: { periods: 1.5, values: 1 } }, { ...ok, counted: { periods: 1, values: 1, held_back_periods: -1 } }, { ...ok, counted: { periods: 1, values: 1, held_back_values: "x" } }]) expect(storedPending(bad)).toBeNull();
  });

  it("says when the values go", () => {
    expect(dayWords("2026-11-28")).toBe("28 November 2026");
    const p = { id: "a", retention: condense(24, "month"), starts_on: "2026-11-28", starts_after: "2026-11-28T00:00:00.000Z", confirmed_on: "2026-11-20", set_by: "p", counted: { periods: 0, values: 0, held_back_periods: 0, held_back_values: 0 }, told: true, reminded: false };
    expect(pendingNote(p, "2024-11-28")).toBe("Values before 28 November 2024 will be condensed into months from 28 November 2026.");
    expect(pendingNote({ ...p, retention: del(24) }, "2024-11-28")).toBe("Values before 28 November 2024 will be deleted from 28 November 2026.");
  });
});

describe("retention for programs and links", () => {
  const pending = { id: "x", retention: condense(24), starts_on: "2026-12-01", starts_after: "2026-11-24T00:00:00Z", confirmed_on: "2026-11-23", set_by: "someone", counted: { periods: 1, values: 2, held_back_periods: 0, held_back_values: 0 }, told: false, reminded: false };
  it("shows the setting and the first day, never who set it", () => {
    expect(retentionForApi(null, null)).toEqual({ retention: null, retention_pending: null });
    expect(retentionForApi(del(36), pending)).toEqual({ retention: del(36), retention_pending: { ...condense(24), starts_on: "2026-12-01" } });
    expect(JSON.stringify(retentionForApi(null, pending))).not.toMatch(/someone|counted/);
    expect(retentionForApi("junk", { nope: 1 })).toEqual({ retention: null, retention_pending: null });
  });
  it("carries a setting in a link and reads back only a valid one", () => {
    expect(retentionToParam(condense(24, "quarter"))).toBe("condense.24.quarter");
    expect(retentionToParam(del(36))).toBe("delete.36");
    expect(retentionFromParam("condense.24.quarter")).toEqual(condense(24, "quarter"));
    expect(retentionFromParam("delete.36")).toEqual(del(36));
    for (const bad of [undefined, 5, "x".repeat(41), "delete.3", "condense.24", "condense.24.day", "delete.36.month", "condense.24.month.x", "delete.abc", "delete", "keep.36"]) expect(retentionFromParam(bad)).toBeNull();
  });
});

describe("the Retention Usage suggests", () => {
  it("condenses daily values into months and weekly ones into quarters, after two years", () => {
    expect(suggestedRetention({ period: "day", aggregation: "sum" })).toEqual({ keep_months: 24, then: "condense", into: "month" });
    expect(suggestedRetention({ period: "week", aggregation: "last" })).toEqual({ keep_months: 24, then: "condense", into: "quarter" });
  });
  it("suggests nothing for monthly or longer Metrics, rates and Derived Metrics, and never a delete", () => {
    expect(suggestedRetention({ period: "month", aggregation: "sum" })).toBeNull();
    expect(suggestedRetention({ period: "day", aggregation: "none" })).toBeNull();
    expect(suggestedRetention({ period: "day", aggregation: "sum", formula: "a / b" })).toBeNull();
  });
});
