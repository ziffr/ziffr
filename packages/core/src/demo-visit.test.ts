import { describe, expect, it } from "vitest";
import { DEMO_WORKSPACE_ID } from "./team";
import { bumpDemoVisitCount, minuteStart, nextResetWindowStart, resetWindowStart, visitKey } from "./demo-visit";

const id = "0123456789abcdef0123456789abcdef";

describe("visitKey", () => {
  it("is 32 hex characters, the same for the same id", () => {
    expect(visitKey(id)).toMatch(/^[0-9a-f]{32}$/);
    expect(visitKey(id)).toBe(visitKey(id));
  });

  it("differs for different ids and is not the id", () => {
    const other = "0123456789abcdef0123456789abcdee";
    expect(visitKey(other)).not.toBe(visitKey(id));
    expect(visitKey(id)).not.toBe(id);
    expect(id).not.toContain(visitKey(id));
  });

  it("refuses what is not an id", () => {
    for (const bad of ["", "1", "a".repeat(31), "a".repeat(33), "A".repeat(32), `${"a".repeat(31)}g`]) expect(() => visitKey(bad)).toThrow();
  });
});

describe("reset windows", () => {
  it("begin at 10, 25, 40 and 55 past the hour", () => {
    expect(resetWindowStart(new Date("2026-11-23T14:25:00Z")).toISOString()).toBe("2026-11-23T14:25:00.000Z");
    expect(resetWindowStart(new Date("2026-11-23T14:39:59.999Z")).toISOString()).toBe("2026-11-23T14:25:00.000Z");
    expect(resetWindowStart(new Date("2026-11-23T14:40:00Z")).toISOString()).toBe("2026-11-23T14:40:00.000Z");
    expect(resetWindowStart(new Date("2026-11-23T14:55:00Z")).toISOString()).toBe("2026-11-23T14:55:00.000Z");
    expect(resetWindowStart(new Date("2026-11-23T15:09:59Z")).toISOString()).toBe("2026-11-23T14:55:00.000Z");
    expect(resetWindowStart(new Date("2026-11-23T15:10:00Z")).toISOString()).toBe("2026-11-23T15:10:00.000Z");
  });

  it("belong to the window before when it is just past midnight, and the next follows 15 minutes later", () => {
    expect(resetWindowStart(new Date("2026-11-23T00:05:00Z")).toISOString()).toBe("2026-11-22T23:55:00.000Z");
    expect(nextResetWindowStart(new Date("2026-11-23T14:30:00Z")).toISOString()).toBe("2026-11-23T14:40:00.000Z");
    expect(nextResetWindowStart(new Date("2026-11-23T14:55:00Z")).toISOString()).toBe("2026-11-23T15:10:00.000Z");
  });

  it("start the minute at its first second", () => {
    expect(minuteStart(new Date("2026-11-23T14:25:42.500Z")).toISOString()).toBe("2026-11-23T14:25:00.000Z");
  });
});

describe("bumpDemoVisitCount", () => {
  const demo = { workspaceId: DEMO_WORKSPACE_ID };
  const w = new Date("2026-11-23T14:25:00Z");

  it("refuses a key that is not a hash and a step out of range before asking the database", async () => {
    await expect(bumpDemoVisitCount(demo, "visit", "not-a-hash", w)).rejects.toThrow("hash");
    await expect(bumpDemoVisitCount(demo, "address", "", w)).rejects.toThrow("hash");
    await expect(bumpDemoVisitCount(demo, "visit", visitKey(id), w, 0)).rejects.toThrow("1 to 1000");
    await expect(bumpDemoVisitCount(demo, "visit", visitKey(id), w, 1001)).rejects.toThrow("1 to 1000");
  });
});
