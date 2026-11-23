// @ts-nocheck
// Alert rules (spec 0032, ticket #372; GLOSSARY: Alert): every kind at, just under and just over its edge, the code
// against the reference over generated cases, crossing and re-arming, Imports, which values count, and the limits.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ALERTS_PER_METRIC, ALERTS_PER_PERSON, ALERTS_PER_WORKSPACE, ALERT_MESSAGES_PER_PERSON_PER_DAY, ALERT_MESSAGES_PER_WORKSPACE_PER_DAY } from "./alert-limits";
import { ALERT_KINDS, alertHolds, alertStep, isPerPeriod, latestAndPrevious, targetAllowsShare, validCondition, valueCounts, type AlertCondition, type AlertInput, type AlertState } from "./alert-rules";
import { referenceHolds } from "./test/reference/alert";

const base = (over: Partial<AlertInput> = {}): AlertInput => ({ metric: { polarity: "higher", attainment_method: null }, workspaceMethod: "ratio", value: "50", previous: null, target: { min: 100, max: null }, ...over });
const holds = (c: AlertCondition, over: Partial<AlertInput> = {}) => alertHolds(c, base(over));

describe("Alert conditions", () => {
  it("reaches a share of target: at or above", () => {
    const c: AlertCondition = { kind: "share_of_target", share: "80" };
    expect(holds(c, { value: "79.99" })).toBe(false);
    expect(holds(c, { value: "80" })).toBe(true);
    expect(holds(c, { value: "80.01" })).toBe(true);
    expect(holds(c, { value: null })).toBe(false);
  });
  it("follows Polarity and the Attainment method", () => {
    const c: AlertCondition = { kind: "share_of_target", share: "100" };
    const lower = { metric: { polarity: "lower" as const, attainment_method: null }, target: { min: null, max: 10 } };
    expect(holds(c, { ...lower, value: "10" })).toBe(true);
    expect(holds(c, { ...lower, value: "10.1" })).toBe(false);
    expect(holds(c, { ...lower, value: "5" })).toBe(true);
    const half: AlertCondition = { kind: "share_of_target", share: "50" };
    // Distance: -5 against a target of -10 is 150 %, ratio has no percentage below 0.
    const neg = { target: { min: -10, max: null }, value: "-5" };
    expect(holds(half, { ...neg, workspaceMethod: "distance" })).toBe(true);
    expect(holds(half, { ...neg, workspaceMethod: "ratio" })).toBe(false);
    expect(holds(half, { ...neg, metric: { polarity: "higher", attainment_method: "distance" } })).toBe(true);
    const range = { metric: { polarity: "target" as const, attainment_method: null }, target: { min: 10, max: 20 } };
    expect(holds({ kind: "share_of_target", share: "100" }, { ...range, value: "15" })).toBe(true);
    expect(holds({ kind: "share_of_target", share: "100" }, { ...range, value: "25" })).toBe(false);
  });
  it("has no share for a target at or below zero", () => {
    const c: AlertCondition = { kind: "share_of_target", share: "1" };
    expect(holds(c, { target: { min: 0, max: null }, value: "5" })).toBe(false);
    expect(holds(c, { target: { min: -10, max: null }, value: "5" })).toBe(false);
    expect(holds(c, { target: { min: null, max: null }, value: "5" })).toBe(false);
  });
  it("reaches a value at or above, falls below strictly", () => {
    expect(holds({ kind: "at_or_above", value: "10" }, { value: "9.99" })).toBe(false);
    expect(holds({ kind: "at_or_above", value: "10" }, { value: "10" })).toBe(true);
    expect(holds({ kind: "at_or_above", value: "-3" }, { value: "-2.5" })).toBe(true);
    expect(holds({ kind: "below", value: "10" }, { value: "10" })).toBe(false);
    expect(holds({ kind: "below", value: "10" }, { value: "9.99" })).toBe(true);
    expect(holds({ kind: "below", value: "-3" }, { value: "-3.01" })).toBe(true);
    expect(holds({ kind: "at_or_above", value: "10" }, { value: null })).toBe(false);
    expect(holds({ kind: "below", value: "10" }, { value: null })).toBe(false);
  });
  it("compares exactly on the text, not on doubles", () => {
    expect(holds({ kind: "at_or_above", value: "0.3" }, { value: "0.300000000001" })).toBe(true);
    expect(holds({ kind: "below", value: "0.3" }, { value: "0.299999999999" })).toBe(true);
    expect(holds({ kind: "below", value: "0.3" }, { value: "0.300000000001" })).toBe(false);
    expect(holds({ kind: "at_or_above", value: "0.3" }, { value: "0.3" })).toBe(true);
  });
  it("changes more than a share: strictly, from the size of the earlier value", () => {
    const c: AlertCondition = { kind: "changed_more", share: "20" };
    expect(holds(c, { previous: "100", value: "120" })).toBe(false);
    expect(holds(c, { previous: "100", value: "120.01" })).toBe(true);
    expect(holds(c, { previous: "100", value: "79.99" })).toBe(true);
    expect(holds(c, { previous: "100", value: "80" })).toBe(false);
    expect(holds(c, { previous: "-100", value: "-120" })).toBe(false);
    expect(holds(c, { previous: "-100", value: "-121" })).toBe(true);
    expect(holds(c, { previous: "0.1", value: "0.12" })).toBe(false);
    expect(holds(c, { previous: null, value: "5" })).toBe(false);
    expect(holds(c, { previous: "100", value: null })).toBe(false);
  });
  it("treats a change from 0 as more than any share, and no change as none", () => {
    expect(holds({ kind: "changed_more", share: "1000" }, { previous: "0", value: "0.01" })).toBe(true);
    expect(holds({ kind: "changed_more", share: "1000" }, { previous: "0", value: "-1" })).toBe(true);
    expect(holds({ kind: "changed_more", share: "1" }, { previous: "0", value: "0" })).toBe(false);
  });
  it("is missing the day after the Due Date, and after, while there is no value", () => {
    const c: AlertCondition = { kind: "missing_after_due" };
    const due = { value: null, dueDate: "2026-11-06" }; // a Friday
    expect(holds(c, { ...due, today: "2026-11-06" })).toBe(false);
    expect(holds(c, { ...due, today: "2026-11-07" })).toBe(true); // Saturday: the calendar day after
    expect(holds(c, { ...due, today: "2026-11-09" })).toBe(true);
    expect(holds(c, { ...due, today: "2026-11-07", value: "5" })).toBe(false);
    expect(holds(c, { value: null, today: "2026-11-07" })).toBe(false);
    expect(holds(c, { value: null, dueDate: "2026-11-06" })).toBe(false);
  });
  it("is false for a value that is not plain text or a condition that is not well formed", () => {
    expect(holds({ kind: "at_or_above", value: "1" }, { value: "1e3" })).toBe(false);
    expect(holds({ kind: "at_or_above", value: "abc" }, { value: "1" })).toBe(false);
    expect(holds({ kind: "changed_more", share: "20" }, { previous: "x", value: "1" })).toBe(false);
    expect(holds({ kind: "nope" } as unknown as AlertCondition)).toBe(false);
  });
  it("agrees with the reference over generated cases", () => {
    const num = fc.integer({ min: -2000, max: 2000 }).map((n) => String(n / 100));
    const share = fc.integer({ min: 100, max: 100000 }).map((n) => String(n / 100));
    const bound = fc.option(fc.integer({ min: -50, max: 200 }), { nil: null });
    fc.assert(fc.property(
      fc.constantFrom(...ALERT_KINDS), num, share, fc.option(num, { nil: null }), fc.option(num, { nil: null }),
      fc.constantFrom("higher", "lower", "target"), fc.constantFrom("ratio", "distance"), bound, bound,
      (kind, level, sh, value, previous, polarity, method, min, max) => {
        const cond = (kind === "share_of_target" || kind === "changed_more" ? { kind, share: sh } : kind === "missing_after_due" ? { kind } : { kind, value: level }) as AlertCondition;
        const input: AlertInput = { metric: { polarity, attainment_method: method }, workspaceMethod: "ratio", value, previous, target: { min, max }, today: "2026-11-10", dueDate: "2026-11-09" };
        const levelText = kind === "share_of_target" || kind === "changed_more" ? sh : level;
        expect(alertHolds(cond, input), JSON.stringify([cond, input])).toBe(referenceHolds(kind, levelText, { polarity, method, value, previous, min, max, today: "2026-11-10", due: "2026-11-09" }));
      }), { numRuns: 3000 });
  });
});

describe("Alert conditions as data", () => {
  it("accepts well formed conditions and refuses the rest", () => {
    expect(validCondition({ kind: "missing_after_due" })).toBe(true);
    expect(validCondition({ kind: "at_or_above", value: "-0.5" })).toBe(true);
    expect(validCondition({ kind: "below", value: "10" })).toBe(true);
    for (const share of ["1", "1000", "80.5"]) expect(validCondition({ kind: "share_of_target", share })).toBe(true);
    for (const share of ["0.99", "1000.01", "0", "-5", "1e2", "", "abc"]) expect(validCondition({ kind: "changed_more", share })).toBe(false);
    for (const value of ["", " 1", "1e3", "NaN", "Infinity", "1,5", "1".repeat(16), "0.1234567890123"]) expect(validCondition({ kind: "below", value })).toBe(false);
    expect(validCondition({ kind: "below", value: 5 })).toBe(false);
    expect(validCondition({ kind: "other" })).toBe(false);
    expect(validCondition(null)).toBe(false);
    expect(validCondition("below")).toBe(false);
  });
  it("knows which kinds belong to a period", () => {
    expect(ALERT_KINDS.filter(isPerPeriod)).toEqual(["changed_more", "missing_after_due"]);
  });
  it("offers a share only against a target with a percentage", () => {
    const higher = { polarity: "higher" as const, attainment_method: null };
    expect(targetAllowsShare(higher, { min: 10, max: null }, "ratio")).toBe(true);
    expect(targetAllowsShare(higher, { min: 0, max: null }, "ratio")).toBe(false);
    expect(targetAllowsShare(higher, { min: -10, max: null }, "ratio")).toBe(false);
    expect(targetAllowsShare(higher, { min: -10, max: null }, "distance")).toBe(true);
    expect(targetAllowsShare(higher, { min: 0, max: null }, "distance")).toBe(false);
    expect(targetAllowsShare(higher, { min: null, max: 5 }, "ratio")).toBe(false);
    expect(targetAllowsShare({ polarity: "lower", attainment_method: null }, { min: null, max: 5 }, "ratio")).toBe(true);
    expect(targetAllowsShare({ polarity: "lower", attainment_method: null }, { min: 5, max: null }, "ratio")).toBe(false);
    expect(targetAllowsShare({ polarity: "target", attainment_method: null }, { min: 1, max: 2 }, "ratio")).toBe(true);
    expect(targetAllowsShare({ polarity: "target", attainment_method: null }, { min: null, max: null }, "ratio")).toBe(false);
    expect(targetAllowsShare({ polarity: "target", attainment_method: null }, { min: 1, max: null }, "ratio")).toBe(true);
    expect(targetAllowsShare({ polarity: "target", attainment_method: null }, { min: null, max: 2 }, "ratio")).toBe(true);
    expect(targetAllowsShare(higher, { min: null, max: null }, "distance")).toBe(false);
    expect(targetAllowsShare({ polarity: "higher", attainment_method: "distance" }, { min: -10, max: null }, "ratio")).toBe(true);
  });
});

describe("which values an Alert sees", () => {
  it("published and approved always, the rest only by the option", () => {
    expect(valueCounts("published", false)).toBe(true);
    expect(valueCounts("approved", false)).toBe(true);
    expect(valueCounts("pending", false)).toBe(false);
    expect(valueCounts("pending", true)).toBe(true);
  });
  it("looks at the latest period with a value, whatever order the points come in", () => {
    const pts = [{ period: "2026-09-01", value: "3" }, { period: "2026-11-01", value: null }, { period: "2026-10-01", value: "2" }, { period: "2026-08-01", value: "1" }];
    expect(latestAndPrevious(pts)).toEqual({ latest: pts[2], previous: pts[0] });
    expect(latestAndPrevious([pts[0]])).toEqual({ latest: pts[0], previous: null });
    expect(latestAndPrevious([pts[1]])).toBeNull();
    expect(latestAndPrevious([])).toBeNull();
    expect(latestAndPrevious([{ period: "a", value: "1" }, { period: "a", value: "2" }])?.latest.period).toBe("a");
    expect(latestAndPrevious([{ period: "b", value: "1" }, { period: "a", value: "2" }])?.latest.period).toBe("b");
  });
});

describe("once per crossing", () => {
  const armed: AlertState = { state: "armed", firedPeriod: null };
  /** Runs a level Alert over truth values, returning how many messages it sends. */
  const run = (kind: (typeof ALERT_KINDS)[number], steps: [boolean, string][], start = armed) => {
    let s = start, sent = 0;
    for (const [h, p] of steps) { const r = alertStep(kind, s, h, p); if (r.fire) sent++; s = r.next; }
    return { sent, s };
  };
  it("sends when the condition becomes true and is quiet while it stays", () => {
    expect(run("at_or_above", [[true, "1"], [true, "2"], [true, "3"]]).sent).toBe(1);
  });
  it("sends again only after it has been false: above, above, below, above is two", () => {
    expect(run("at_or_above", [[true, "1"], [true, "2"], [false, "3"], [true, "4"]]).sent).toBe(2);
  });
  it("re-arms silently when false, with no message", () => {
    const r = alertStep("below", { state: "fired", firedPeriod: "1" }, false, "2");
    expect(r).toEqual({ fire: false, next: { state: "armed", firedPeriod: null } });
  });
  it("sends two values at once as one: the second sees fired", () => {
    const first = alertStep("at_or_above", armed, true, "1");
    expect(first.fire).toBe(true);
    expect(alertStep("at_or_above", first.next, true, "1").fire).toBe(false);
  });
  it("fires a per-period kind once per period, and again for the next", () => {
    expect(run("changed_more", [[true, "1"], [true, "1"], [true, "2"], [true, "2"]]).sent).toBe(2);
  });
  it("keeps a per-period kind fired through a Correction down and up in the same period", () => {
    expect(run("changed_more", [[true, "1"], [false, "1"], [true, "1"]]).sent).toBe(1);
  });
  it("arms a per-period kind again when a new period is the latest, even if the old one was false", () => {
    expect(run("missing_after_due", [[true, "1"], [false, "2"], [true, "2"]]).sent).toBe(2);
    const r = alertStep("changed_more", { state: "fired", firedPeriod: "1" }, false, "2");
    expect(r.next).toEqual({ state: "armed", firedPeriod: "1" });
  });
  it("a Correction up fires an armed Alert, a Correction down re-arms it", () => {
    expect(alertStep("at_or_above", armed, true, "5")).toEqual({ fire: true, next: { state: "fired", firedPeriod: "5" } });
    expect(alertStep("at_or_above", { state: "fired", firedPeriod: "5" }, false, "5").next.state).toBe("armed");
  });
  it("stays armed while false", () => {
    expect(alertStep("below", armed, false, "1")).toEqual({ fire: false, next: { state: "armed", firedPeriod: null } });
  });
  it("is silent for an Import and only brings the state up to date", () => {
    expect(alertStep("at_or_above", armed, true, "9", true)).toEqual({ fire: false, next: { state: "fired", firedPeriod: "9" } });
    expect(alertStep("at_or_above", { state: "fired", firedPeriod: "1" }, true, "9", true)).toEqual({ fire: false, next: { state: "fired", firedPeriod: "1" } });
    expect(alertStep("at_or_above", { state: "fired", firedPeriod: "1" }, false, "9", true).next.state).toBe("armed");
    // After an Import left it fired, the first real value that is still true says nothing; after a false one it does.
    const afterImport = alertStep("at_or_above", armed, true, "9", true).next;
    expect(alertStep("at_or_above", afterImport, true, "10").fire).toBe(false);
    expect(run("at_or_above", [[false, "10"], [true, "11"]], afterImport).sent).toBe(1);
    expect(alertStep("changed_more", armed, true, "9", true).next).toEqual({ state: "fired", firedPeriod: "9" });
  });
});

describe("the limits", () => {
  it("are the numbers of spec 0032", () => {
    expect([ALERTS_PER_PERSON, ALERTS_PER_METRIC, ALERTS_PER_WORKSPACE, ALERT_MESSAGES_PER_PERSON_PER_DAY, ALERT_MESSAGES_PER_WORKSPACE_PER_DAY]).toEqual([20, 5, 500, 20, 2000]);
  });
});
