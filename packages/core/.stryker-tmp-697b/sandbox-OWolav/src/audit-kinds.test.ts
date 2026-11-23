// @ts-nocheck
// The Audit Log's pure rules (spec 0008): filters from untrusted input, details as stored, and CSV cells.
import { describe, expect, it } from "vitest";
import { AUDIT_CATEGORIES, AUDIT_KINDS, cleanAuditFilter, cleanDetails, csvCell, csvLine, kindsOf } from "./audit-kinds";

describe("cleanAuditFilter", () => {
  it("keeps known kinds, categories, object types, ids and real days", () => {
    expect(cleanAuditFilter({ person: "t-abc_1", kind: "share.granted", type: "metric", id: "12", from: "2026-01-01", to: "2026-01-31" }))
      .toEqual({ person: "t-abc_1", kind: "share.granted", objectType: "metric", objectId: "12", from: "2026-01-01", to: "2026-01-31" });
    expect(cleanAuditFilter({ kind: "group" })).toEqual({ category: "group" });
  });
  it("drops anything else, and puts dates the right way round", () => {
    expect(cleanAuditFilter({ person: "a,b", kind: "share.%", type: "profiles", id: "1", from: "2026-02-30", to: "tomorrow" })).toEqual({});
    expect(cleanAuditFilter({ id: "5" })).toEqual({});
    expect(cleanAuditFilter({ from: "2026-03-01", to: "2026-01-01" })).toEqual({ from: "2026-01-01", to: "2026-03-01" });
    expect(cleanAuditFilter({ kind: ["share.granted", "x"] })).toEqual({ kind: "share.granted" });
    expect(cleanAuditFilter(null)).toEqual({});
  });
});

describe("kinds", () => {
  it("each belong to a category, and each category has kinds", () => {
    for (const k of Object.keys(AUDIT_KINDS)) expect(Object.keys(AUDIT_CATEGORIES)).toContain(k.split(".")[0]);
    for (const c of Object.keys(AUDIT_CATEGORIES) as (keyof typeof AUDIT_CATEGORIES)[]) expect(kindsOf(c).length).toBeGreaterThan(0);
  });
});

describe("cleanDetails", () => {
  it("keeps short, plain facts only", () => {
    expect(cleanDetails({ from: "member", n: 3, ok: true, none: null, scopes: ["a", "b"], Bad: "x", nan: Number.NaN, long: "x".repeat(500) }))
      .toEqual({ from: "member", n: 3, ok: true, none: null, scopes: ["a", "b"], long: "x".repeat(120) });
  });
});

describe("csvCell", () => {
  it("quotes every cell and doubles quotes", () => {
    expect(csvCell('Say "hi", folks')).toBe('"Say ""hi"", folks"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
  it("keeps spreadsheets from running a cell as a formula", () => {
    for (const s of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) expect(csvCell(s).startsWith(`"'`)).toBe(true);
    expect(csvCell("Revenue")).toBe('"Revenue"');
  });
  it("ends lines with CRLF", () => {
    expect(csvLine(["a", 1])).toBe('"a","1"\r\n');
  });
});
