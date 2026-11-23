// The demo's countdown (spec 0051, ticket 7): the schedule, the words and the spread of the asks, without a clock or a database.
import { describe, expect, it } from "vitest";
import { clockSkew, demoLine, demoLineWords, generationCheckDelay, nextResetWindowStart, slotAfter, STARTING_FRESH_MS } from "./demo-reset-line";

const at = (s: string) => new Date(`2026-11-23T${s}Z`).getTime();

describe("the schedule", () => {
  it("is the next of 10, 25, 40 and 55 past the hour, and the slot after it", () => {
    expect(nextResetWindowStart(new Date(at("14:16:00"))).toISOString()).toBe("2026-11-23T14:25:00.000Z");
    expect(nextResetWindowStart(new Date(at("14:25:00"))).toISOString()).toBe("2026-11-23T14:40:00.000Z");
    expect(nextResetWindowStart(new Date(at("14:56:00"))).toISOString()).toBe("2026-11-23T15:10:00.000Z");
    expect(slotAfter(at("14:25:00"))).toBe(at("14:40:00"));
  });
});

describe("demoLine", () => {
  const facts = { resetAt: at("14:10:00"), nextResetAt: at("14:25:00") };

  it("counts the minutes left, rounded up so that it never says 0", () => {
    expect(demoLine(facts, at("14:16:00"))).toEqual({ kind: "counting", minutes: 9 });
    expect(demoLine(facts, at("14:16:30"))).toEqual({ kind: "counting", minutes: 9 });
    expect(demoLine(facts, at("14:23:59"))).toEqual({ kind: "counting", minutes: 2 });
    expect(demoLine(facts, at("14:23:00"))).toEqual({ kind: "counting", minutes: 2 });
  });

  it("says soon in the last minute", () => {
    expect(demoLine(facts, at("14:24:00"))).toEqual({ kind: "soon" });
    expect(demoLine(facts, at("14:24:59"))).toEqual({ kind: "soon" });
  });

  it("is starting fresh right after a reset, and once the slot has passed", () => {
    expect(demoLine(facts, at("14:10:00"))).toEqual({ kind: "fresh" });
    expect(demoLine(facts, facts.resetAt + STARTING_FRESH_MS - 1)).toEqual({ kind: "fresh" });
    expect(demoLine(facts, facts.resetAt + STARTING_FRESH_MS)).toEqual({ kind: "counting", minutes: 14 });
    expect(demoLine(facts, at("14:25:00"))).toEqual({ kind: "fresh" });
    expect(demoLine(facts, at("14:26:00"))).toEqual({ kind: "fresh" });
  });

  it("does not call a demo with no known start fresh", () => {
    expect(demoLine({ resetAt: null, nextResetAt: at("14:25:00") }, at("14:16:00"))).toEqual({ kind: "counting", minutes: 9 });
  });

  it("does not call a time before the reset fresh (a skewed clock)", () => {
    expect(demoLine(facts, at("14:09:00"))).toEqual({ kind: "counting", minutes: 16 });
  });
});

describe("demoLineWords", () => {
  it("says it in plain words", () => {
    expect(demoLineWords({ kind: "counting", minutes: 9 })).toBe("Resets in 9 min.");
    expect(demoLineWords({ kind: "soon" })).toBe("Resets in under a minute.");
    expect(demoLineWords({ kind: "fresh" })).toBe("Starting fresh.");
  });
});

describe("clockSkew", () => {
  it("is what a browser adds to its own clock to get the server's", () => {
    expect(clockSkew(10_000, 4_000)).toBe(6_000);
    expect(clockSkew(4_000, 10_000)).toBe(-6_000);
  });
});

describe("generationCheckDelay", () => {
  it("backs off, spreads by up to a third and gives up", () => {
    expect([0, 1, 2, 3, 4].map((n) => generationCheckDelay(n, 0))).toEqual([3000, 6000, 12000, 24000, 30000]);
    expect(generationCheckDelay(0, 1)).toBe(4000);
    expect(generationCheckDelay(5, 0.5)).toBeNull();
  });

  it("keeps a bad spread inside its range", () => {
    expect(generationCheckDelay(0, -3)).toBe(3000);
    expect(generationCheckDelay(0, 9)).toBe(4000);
  });
});
