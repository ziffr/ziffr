// The decision when the demo is reset (spec 0051, ticket 1): every call resets where visitors may not change the demo,
// and only a changed or no longer young demo where they may.
import { describe, expect, it } from "vitest";
import { demoChangesInEffect, shouldResetDemo, type DemoState } from "./demo-reset-decision";

const at = (s: string) => new Date(s);
const clean: DemoState = { generation: 4, changedSinceReset: false, lastChangeAt: null, resetAt: at("2026-11-23T10:25:00Z"), showcaseReady: true, seedDoneAt: at("2026-11-23T10:25:20Z") };

describe("demoChangesInEffect", () => {
  it("is on only with the setting and a demo-only Installation", () => {
    expect(demoChangesInEffect({})).toBe(false);
    expect(demoChangesInEffect({ ZIFFR_DEMO_CHANGES: "1" })).toBe(false);
    expect(demoChangesInEffect({ ZIFFR_DEMO_ONLY: "1" })).toBe(false);
    expect(demoChangesInEffect({ ZIFFR_DEMO_CHANGES: "0", ZIFFR_DEMO_ONLY: "1" })).toBe(false);
    expect(demoChangesInEffect({ ZIFFR_DEMO_CHANGES: "1", ZIFFR_DEMO_ONLY: "1" })).toBe(true);
  });
});

describe("shouldResetDemo", () => {
  it("always resets where the setting is off, whatever the state", () => {
    const now = at("2026-11-23T10:30:00Z");
    expect(shouldResetDemo({ changesInEffect: false, state: clean, now })).toBe(true);
    expect(shouldResetDemo({ changesInEffect: false, state: null, now })).toBe(true);
  });
  it("skips a clean, young demo where the setting is on", () => {
    expect(shouldResetDemo({ changesInEffect: true, state: clean, now: at("2026-11-23T10:40:00Z") })).toBe(false);
  });
  it("resets a demo a visitor changed", () => {
    const changed = { ...clean, changedSinceReset: true, lastChangeAt: at("2026-11-23T10:30:00Z") };
    expect(shouldResetDemo({ changesInEffect: true, state: changed, now: at("2026-11-23T10:40:00Z") })).toBe(true);
  });
  it("resets a clean demo that is a day old, or from an earlier UTC date", () => {
    expect(shouldResetDemo({ changesInEffect: true, state: clean, now: at("2026-11-24T10:25:00Z") })).toBe(true);
    expect(shouldResetDemo({ changesInEffect: true, state: { ...clean, resetAt: at("2026-11-23T23:55:00Z") }, now: at("2026-11-24T00:10:00Z") })).toBe(true);
  });
  it("resets a clean, young demo whose seed did not finish, which every visit refuses", () => {
    const now = at("2026-11-23T10:40:00Z");
    expect(shouldResetDemo({ changesInEffect: true, state: { ...clean, showcaseReady: false }, now })).toBe(true);
    expect(shouldResetDemo({ changesInEffect: true, state: { ...clean, seedDoneAt: null }, now })).toBe(true);
  });
  it("resets when its state or reset time is unknown", () => {
    const now = at("2026-11-23T10:40:00Z");
    expect(shouldResetDemo({ changesInEffect: true, state: null, now })).toBe(true);
    expect(shouldResetDemo({ changesInEffect: true, state: { ...clean, resetAt: null }, now })).toBe(true);
  });
});
