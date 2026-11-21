// The settable limits' ranges and the order person ⊂ Workspace ⊂ Installation (ticket #518).
import { describe, expect, it } from "vitest";
import { installationValue, isLimitKey, LIMIT_DEFINITIONS, limitDefinition, limitProblem, resolveLimit, type LimitDefinition } from "./limit-levels";
import { sendingLimitOf } from "./sending-limits";

const free: LimitDefinition = { ...limitDefinition("unusedDays"), person: true };

describe("the definitions", () => {
  it("have a default inside their range, a column of their own and a level to set them at", () => {
    for (const d of LIMIT_DEFINITIONS) {
      expect(d.min).toBeGreaterThanOrEqual(0);
      expect(d.default).toBeGreaterThanOrEqual(d.min);
      expect(d.default).toBeLessThanOrEqual(d.max);
      expect(d.workspace || d.person).toBe(true);
    }
    expect(new Set(LIMIT_DEFINITIONS.map((d) => d.key)).size).toBe(LIMIT_DEFINITIONS.length);
  });

  it("take the Operator's ceiling for the two Alert limits from the Sending Limits, with the same range and default", () => {
    for (const d of LIMIT_DEFINITIONS.filter((x) => x.ceilingFrom)) {
      const s = sendingLimitOf(d.ceilingFrom!);
      expect([s.min, s.max, s.default]).toEqual([d.min, d.max, d.default]);
    }
  });

  it("know their keys", () => {
    expect(isLimitKey("viewLinkDays")).toBe(true);
    expect(isLimitKey("nope")).toBe(false);
    expect(isLimitKey(3)).toBe(false);
  });
});

describe("resolveLimit", () => {
  const perDay = limitDefinition("alertMessagesPerPerson");
  it("gives the Installation's value without anything set, and the default where the Installation has none", () => {
    expect(resolveLimit(perDay, { alertMessagesPerPerson: 50 }, null, null)).toBe(50);
    expect(installationValue(perDay, {})).toBe(20);
    expect(installationValue(limitDefinition("viewLinkDays"), {})).toBe(90);
  });

  it("lets the Workspace and then the person go lower, never higher", () => {
    expect(resolveLimit(perDay, { alertMessagesPerPerson: 50 }, 30, null)).toBe(30);
    expect(resolveLimit(perDay, { alertMessagesPerPerson: 50 }, 30, 10)).toBe(10);
    expect(resolveLimit(perDay, { alertMessagesPerPerson: 50 }, 30, 40)).toBe(30);
    expect(resolveLimit(perDay, { alertMessagesPerPerson: 50 }, 80, null)).toBe(50);
  });

  it("uses a Workspace value that became too high for a lowered ceiling only up to the ceiling", () => {
    expect(resolveLimit(limitDefinition("alertsPerPerson"), { alertsPerPerson: 5 }, 100, null)).toBe(5);
  });

  it("keeps the Installation's value within the range whatever it is given", () => {
    expect(installationValue(perDay, { alertMessagesPerPerson: 5000 })).toBe(200);
    expect(installationValue(perDay, { alertMessagesPerPerson: 0 })).toBe(1);
  });

  it("lets a Workspace move a limit that is not lower-only both ways within its range, and ignores levels it does not have", () => {
    const share = limitDefinition("alertMailShare");
    expect(resolveLimit(share, {}, 70, 5)).toBe(70);
    expect(resolveLimit(share, {}, 10, null)).toBe(10);
    expect(resolveLimit(limitDefinition("overdueDaysBack"), {}, 5, null)).toBe(90);
    expect(resolveLimit(limitDefinition("overdueDaysBack"), {}, 5, 14)).toBe(14);
    expect(resolveLimit(free, {}, 200, 365)).toBe(365);
  });
});

describe("limitProblem", () => {
  const d = limitDefinition("alertMessagesPerPerson");
  it("accepts a whole number from the minimum to the level above", () => {
    expect(limitProblem(d, 1, 20)).toBeNull();
    expect(limitProblem(d, 20, 20)).toBeNull();
  });
  it("says what to change for a number outside, above the level above, or not a whole number", () => {
    expect(limitProblem(d, 0, 20)).toMatch(/from 1 to 20/);
    expect(limitProblem(d, 21, 20)).toMatch(/the most the level above allows/);
    expect(limitProblem(d, 201, 500)).toMatch(/from 1 to 200\./);
    expect(limitProblem(d, 2.5, 20)).toMatch(/whole number/);
    expect(limitProblem(d, "5", 20)).toMatch(/whole number/);
    expect(limitProblem(d, NaN, 20)).toMatch(/whole number/);
  });
  it("lets a limit that is not lower-only go up to its own maximum whatever the ceiling says", () => {
    expect(limitProblem(limitDefinition("alertMailShare"), 90, 40)).toBeNull();
    expect(limitProblem(limitDefinition("alertMailShare"), 91, 40)).toMatch(/10 to 90/);
  });
});
