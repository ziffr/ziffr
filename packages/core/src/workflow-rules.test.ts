import { describe, expect, it } from "vitest";
import { addWorkingDays, dueDate, STEP_TITLE, stepLabel, unusualReasons, workingPeriod } from "./workflow-rules";
import { metric } from "./test/fixtures";
import { JANUARY, periodEnd } from "./periods";

describe("workflow rules", () => {
  it("skips weekends when counting working days", () => {
    // Friday 30 Oct 2026 + 3 working days = Wednesday 4 Nov.
    expect(addWorkingDays("2026-10-30", 3)).toBe("2026-11-04");
  });
  it("puts the due date after the end of the period", () => {
    expect(periodEnd("2026-10-01", "month")).toBe("2026-10-31");
    expect(dueDate("2026-10-01", "month", { dueWorkingDays: 3, steps: [] })).toBe("2026-11-04");
  });
  it("works on the last period that has ended", () => {
    expect(workingPeriod("2026-11-13", "month", JANUARY)).toBe("2026-10-01");
  });
  it("puts a quarter's or year's due date after its last day, of the workspace's fiscal year", () => {
    const cfg = { dueWorkingDays: 5, steps: [] };
    // Q3 2026 ends Wednesday 30 Sep; five working days later is Wednesday 7 Oct.
    expect(dueDate("2026-07-01", "quarter", cfg)).toBe("2026-10-07");
    // 2026 ends Thursday 31 Dec; five working days later is Thursday 7 Jan 2027.
    expect(dueDate("2026-01-01", "year", cfg)).toBe("2027-01-07");
    // With an April year start, FY 2025/26 ends Tuesday 31 Mar 2026.
    expect(dueDate("2025-04-01", "year", cfg)).toBe("2026-04-07");
  });
  it("works on the last quarter or year that has ended", () => {
    expect(workingPeriod("2026-11-13", "quarter", JANUARY)).toBe("2026-07-01");
    expect(workingPeriod("2026-11-13", "year", JANUARY)).toBe("2025-01-01");
    expect(workingPeriod("2026-11-13", "quarter", 4)).toBe("2026-07-01");
    expect(workingPeriod("2026-11-13", "quarter", 2)).toBe("2026-08-01");
    expect(workingPeriod("2026-11-13", "year", 4)).toBe("2025-04-01");
  });
  it("compares a quarter's value with the quarter before", () => {
    const step = { type: "check" as const, changePct: 30, outsideTarget: false };
    expect(unusualReasons(metric({ period: "quarter" }), 150, 100, "2026-04-01", step, JANUARY, "1,234.5")).toEqual(["up 50.0 % on Q2 2026"]);
    expect(unusualReasons(metric({ period: "year" }), 50, 100, "2025-04-01", step, 4, "1,234.5")).toEqual(["down 50.0 % on FY 2025/26"]);
  });
  it("calls a value unusual for a big change or a missed target, and says why", () => {
    const step = { type: "check" as const, changePct: 30, outsideTarget: true };
    expect(unusualReasons(metric(), 150, 100, "2026-09-01", step, JANUARY, "1,234.5", { min: 100, max: null })).toEqual(["up 50.0 % on September 2026"]);
    expect(unusualReasons(metric(), 90, 95, "2026-09-01", step, JANUARY, "1,234.5", { min: 100, max: null })).toEqual(["below target"]);
    expect(unusualReasons(metric(), 101, 100, "2026-09-01", step, JANUARY, "1,234.5", { min: 100, max: null })).toEqual([]);
  });
  it("calls any change from 0 unusual, and a change across zero by the size of the earlier value (spec 0022)", () => {
    const step = { type: "check" as const, changePct: 30, outsideTarget: false };
    expect(unusualReasons(metric(), 1000, 0, "2026-09-01", step, JANUARY, "1,234.5")).toEqual(["up from 0 on September 2026"]);
    expect(unusualReasons(metric(), -3, 0, "2026-09-01", step, JANUARY, "1,234.5")).toEqual(["down from 0 on September 2026"]);
    expect(unusualReasons(metric(), 0, 0, "2026-09-01", step, JANUARY, "1,234.5")).toEqual([]);
    expect(unusualReasons(metric(), 10, -10, "2026-09-01", step, JANUARY, "1,234.5")).toEqual(["up 200.0 % on September 2026"]);
    expect(unusualReasons(metric(), -11, -10, "2026-09-01", step, JANUARY, "1,234.5")).toEqual([]);
    expect(unusualReasons(metric(), 5, undefined, undefined, step, JANUARY, "1,234.5")).toEqual([]);
  });
});

describe("a Workflow step in words", () => {
  const people = [{ id: "sara", name: "Sara Lind" }, { id: "ben", name: "Ben Ito" }] as Parameters<typeof stepLabel>[1];
  it("names each kind of step as the editor shows it", () => {
    expect(stepLabel({ type: "remind", daysBefore: 1 }, people)).toBe("Remind the submitter 1 day before the due date");
    expect(stepLabel({ type: "remind", daysBefore: 3 }, people)).toBe("Remind the submitter 3 days before the due date");
    expect(stepLabel({ type: "escalate", to: "stand-in", daysAfter: 0 }, people)).toBe("On the due date, if still missing: ask the stand-in");
    expect(stepLabel({ type: "escalate", to: "owner", daysAfter: 1 }, people)).toBe("1 day after the due date, if still missing: tell the metric owner");
    expect(stepLabel({ type: "escalate", to: "owner", daysAfter: 2 }, people)).toBe("2 days after the due date, if still missing: tell the metric owner");
    expect(stepLabel({ type: "check", changePct: 20, outsideTarget: true }, people)).toBe("Unusual if it changes more than 20 % or falls outside the target");
    expect(stepLabel({ type: "check", changePct: 20, outsideTarget: false }, people)).toBe("Unusual if it changes more than 20 %");
    expect(stepLabel({ type: "approve", approvers: ["sara", "ben", "gone"] }, people)).toBe("Unusual values approved by Sara, then Ben, then gone; when nobody else can, the submitter checks it");
    expect(stepLabel({ type: "approve", approvers: ["sara", "ben"], values: "unusual" }, people)).toBe("Unusual values approved by Sara, then Ben; when nobody else can, the submitter checks it");
    expect(stepLabel({ type: "approve", approvers: ["sara", "ben"], values: "every" }, people)).toBe("Every value approved by Sara, then Ben; when nobody else can, the submitter checks it");
    expect(stepLabel({ type: "approve", approvers: ["sara"], values: "every", nobodyElse: "count" }, people)).toBe("Every value approved by Sara; when nobody else can, it counts without approval");
    expect(stepLabel({ type: "approve", approvers: [] }, people)).toBe("Approval, nobody chosen yet");
    expect(stepLabel({ type: "tell", id: "a", condition: { kind: "share_of_target", share: "80" }, people: ["sara"], groups: [3] }, people, [{ id: 3, name: "Finance" }])).toBe("Tell Sara, Finance when a value reaches 80 % of its target");
    expect(stepLabel({ type: "tell", id: "a", condition: { kind: "below", value: "10000" }, people: [], groups: [] }, people)).toBe("Tell nobody yet when a value falls below 10000");
    expect(stepLabel({ type: "tell", id: "a", condition: { kind: "at_or_above", value: "5" }, people: ["sara"], groups: [9] }, people)).toBe("Tell Sara, a Group when a value reaches 5");
    expect(stepLabel({ type: "tell", id: "a", condition: { kind: "changed_more", share: "20" }, people: ["sara"], groups: [] }, people)).toBe("Tell Sara when a value changes more than 20 % on the period before");
    expect(stepLabel({ type: "publish", lock: true }, people)).toBe("Publish and lock the period");
    expect(stepLabel({ type: "publish", lock: false }, people)).toBe("Publish");
    expect(Object.keys(STEP_TITLE)).toEqual(["remind", "escalate", "check", "approve", "tell", "publish"]);
  });
  it("adds no working days for none", () => {
    expect(addWorkingDays("2026-10-30", 0)).toBe("2026-10-30");
    expect(dueDate("2026-10-01", "month", { dueWorkingDays: -2, steps: [] })).toBe("2026-10-31");
  });
  it("says why a value is unusual, from 0 and against the target", () => {
    const check = { type: "check" as const, changePct: 10, outsideTarget: true };
    expect(unusualReasons(metric(), -3, 0, "2026-01-01", check, JANUARY, "1,234.5", { min: 0, max: 10 })).toEqual(["down from 0 on January 2026", "below target"]);
    expect(unusualReasons(metric(), 0, 0, "2026-01-01", check, JANUARY, "1,234.5", { min: null, max: -1 })).toEqual(["above target"]);
    expect(unusualReasons(metric(), 5, 0, "2026-01-01", { ...check, outsideTarget: false }, JANUARY, "1,234.5", { min: 10, max: null })).toEqual(["up from 0 on January 2026"]);
  });
  it("calls a value on the target's bound within it", () => {
    const check = { type: "check" as const, changePct: 10, outsideTarget: true };
    expect(unusualReasons(metric(), 10, 10, "2026-01-01", check, JANUARY, "1,234.5", { min: 10, max: 10 })).toEqual([]);
    expect(unusualReasons(metric(), 10, 10, "2026-01-01", check, JANUARY, "1,234.5", { min: null, max: 9 })).toEqual(["above target"]);
  });
});
