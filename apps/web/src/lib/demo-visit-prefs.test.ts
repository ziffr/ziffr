// A demo visit's pins and home (spec 0051, ticket 7): reading what the browser kept, the pin rules and finding a saved
// dashboard again after a Demo Reset.
import { describe, expect, it } from "vitest";
import { MAX_DEMO_PINS, movePin, parsePrefs, prefsKey, resolveRef, resolveRefs, serializePrefs, togglePin } from "./demo-visit-prefs";

const ref = (id: number, name = `D${id}`) => ({ id, name });

describe("parsePrefs", () => {
  it("keeps nothing for nothing, junk or the wrong shape", () => {
    const none = { pins: null, home: null };
    expect(parsePrefs(null)).toEqual(none);
    expect(parsePrefs("not json")).toEqual(none);
    expect(parsePrefs("[1]")).toEqual(none);
    expect(parsePrefs('{"pins":"x","home":3}')).toEqual(none);
  });

  it("drops entries that are not dashboards and caps the pins", () => {
    const raw = JSON.stringify({ pins: [ref(1), { id: "2", name: "x" }, { id: -1, name: "y" }, ...Array.from({ length: 12 }, (_, i) => ref(i + 10))], home: ref(5) });
    const prefs = parsePrefs(raw);
    expect(prefs.pins?.length).toBe(MAX_DEMO_PINS);
    expect(prefs.pins?.[0]).toEqual(ref(1));
    expect(prefs.home).toEqual(ref(5));
  });

  it("round-trips", () => {
    const prefs = { pins: [ref(2), ref(1)], home: ref(2) };
    expect(parsePrefs(serializePrefs(prefs))).toEqual(prefs);
  });

  it("is kept per person viewed as", () => {
    expect(prefsKey("sara")).not.toBe(prefsKey("ben"));
  });
});

describe("resolveRef", () => {
  const known = [ref(31, "Monthly overview"), ref(30, "Sales"), ref(44, "Sales")];

  it("finds a saved dashboard by its id while it exists", () => {
    expect(resolveRef(ref(44, "Sales"), known)).toEqual(ref(44, "Sales"));
  });

  it("finds it by its name after a reset gave it a new id, the oldest if two share the name", () => {
    expect(resolveRef(ref(7, "Monthly overview"), known)).toEqual(ref(31, "Monthly overview"));
    expect(resolveRef(ref(8, "Sales"), known)).toEqual(ref(30, "Sales"));
  });

  it("is null when it is gone", () => {
    expect(resolveRef(ref(9, "A visitor's own"), known)).toBeNull();
  });

  it("drops what is gone from a list, and doubles", () => {
    expect(resolveRefs([ref(7, "Monthly overview"), ref(9, "Gone"), ref(31, "Monthly overview")], known)).toEqual([ref(31, "Monthly overview")]);
  });
});

describe("togglePin", () => {
  it("adds at the end and takes off", () => {
    expect(togglePin([ref(1)], ref(2)).pins).toEqual([ref(1), ref(2)]);
    expect(togglePin([ref(1), ref(2)], ref(1)).pins).toEqual([ref(2)]);
  });

  it("refuses a ninth and says why", () => {
    const full = Array.from({ length: MAX_DEMO_PINS }, (_, i) => ref(i + 1));
    const r = togglePin(full, ref(99));
    expect(r.pins).toBe(full);
    expect(r.refused).toMatch(/up to 8/);
    expect(togglePin(full, ref(3)).refused).toBeUndefined();
  });
});

describe("movePin", () => {
  const pins = [ref(1), ref(2), ref(3)];
  it("moves a pin to a place", () => {
    expect(movePin(pins, 1, 2).map((p) => p.id)).toEqual([2, 3, 1]);
    expect(movePin(pins, 3, 0).map((p) => p.id)).toEqual([3, 1, 2]);
  });
  it("clamps the place and ignores a pin that is not there", () => {
    expect(movePin(pins, 2, 99).map((p) => p.id)).toEqual([1, 3, 2]);
    expect(movePin(pins, 9, 0)).toBe(pins);
  });
});
