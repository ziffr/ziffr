// How many Metrics may be made one after another (spec 0030 "Set up fits the Size"; GLOSSARY: Workspace Limit): the
// pure rule applied to each in turn, the first one over the limit starting the grace as the database does.
import { describe, expect, it } from "vitest";
import { GRACE_DAYS, GRACE_EVERY_DAYS, limitRule, metricsAllowed } from "./workspace-limits";

const now = new Date("2026-11-22T10:00:00Z");
const grace = { days: GRACE_DAYS, every: GRACE_EVERY_DAYS };
const days = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("metricsAllowed", () => {
  it("is the cap with no limit", () => expect(metricsAllowed(500, null, null, now, null, grace, 50)).toBe(50));
  it("is what the Size holds plus its room, when no grace has run", () => {
    expect(metricsAllowed(38, 50, null, now, null, grace, 50)).toBe(12 + 5); // 50 + 10 % = 55
    expect(metricsAllowed(0, 50, null, now, null, grace, 50)).toBe(50);
    expect(metricsAllowed(1, 1, null, now, null, grace, 50)).toBe(1); // a limit of 1 has room for 2
  });
  it("is nothing at or past the room, and in a grace that has run out", () => {
    expect(metricsAllowed(55, 50, null, now, null, grace, 50)).toBe(0);
    expect(metricsAllowed(52, 50, days(15), now, null, grace, 50)).toBe(0);
  });
  it("is the room left while a grace runs, and nothing over within 90 days of the last one", () => {
    expect(metricsAllowed(52, 50, days(3), now, null, grace, 50)).toBe(3);
    expect(metricsAllowed(48, 50, null, now, days(10), grace, 50)).toBe(7); // the last grace still runs: what is left of it
    expect(metricsAllowed(48, 50, null, now, days(40), grace, 50)).toBe(2); // over again within 90 days of one: refused past the limit
  });
  it("agrees with limitRule one Metric at a time, for every count and every n", () => {
    for (const since of [null, days(3), days(20)]) for (const last of [null, days(30), days(120)]) for (let count = 0; count <= 8; count++) {
      const allowed = metricsAllowed(count, 5, since, now, last, grace, 12);
      let at = since, expected = 0;
      for (let i = 0; i < 12; i++) {
        const rule = limitRule(count + i, 5, at, now, last, grace);
        if (rule === "refuse") break;
        if (rule === "over" && !at) at = last && now.getTime() < last.getTime() + grace.days * 86_400_000 ? last : now;
        expected++;
      }
      expect(allowed).toBe(expected);
    }
  });
});
