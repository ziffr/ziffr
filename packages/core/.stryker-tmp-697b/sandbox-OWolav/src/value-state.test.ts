// @ts-nocheck
// When a value is final (spec 0041, ticket 13; GLOSSARY: Approval): one rule for Alerts and Heads-ups.
import { describe, expect, it } from "vitest";
import { isFinalState, NOT_FINAL_STATES } from "./value-state";

describe("isFinalState", () => {
  it("is false for a period waiting for Approval or sent back, true for no state and every other state", () => {
    expect([...NOT_FINAL_STATES]).toEqual(["approval", "submitted"]);
    for (const s of ["approval", "submitted"]) expect(isFinalState(s), s).toBe(false);
    for (const s of ["locked", "asked", "published", "", null, undefined]) expect(isFinalState(s), String(s)).toBe(true);
  });
});
