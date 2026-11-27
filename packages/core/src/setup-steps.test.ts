// The Setup Guide's steps from facts (spec 0052, spec 0067; GLOSSARY: Setup Guide): only a Member has steps, which are
// ticked, which is next and when the guide is finished.
import { describe, expect, it } from "vitest";
import { SETUP_STEPS, setupSteps, stepsFor, tickedStep, type SetupFacts } from "./setup-steps";

const NONE: SetupFacts = { preferenceReal: false, testMessageSent: false, businessFunctionSet: false };
const facts = (over: Partial<SetupFacts>): SetupFacts => ({ ...NONE, ...over });

describe("who sees which steps", () => {
  it("gives a Member two and an Owner, Admin or Guest none", () => {
    expect(stepsFor("member")).toEqual(["about", "ways"]);
    for (const role of ["owner", "admin", "guest"] as const) {
      expect(stepsFor(role)).toEqual([]);
      expect(setupSteps(NONE, role)).toMatchObject({ steps: [], next: null, finished: true, ticked: 0, total: 0 });
    }
  });
});

describe("the ticks, from state only", () => {
  it("About you is the Member's own function", () => {
    expect(tickedStep("about", NONE)).toBe(false);
    expect(tickedStep("about", facts({ businessFunctionSet: true }))).toBe(true);
  });

  it("Ways in and out is the viewer's real Delivery Preference or a sent Test Message", () => {
    expect(tickedStep("ways", NONE)).toBe(false);
    for (const over of [{ preferenceReal: true }, { testMessageSent: true }]) expect(tickedStep("ways", facts(over))).toBe(true);
  });
});

describe("the next step and when it is finished", () => {
  it("the next step is the first one neither ticked nor skipped", () => {
    expect(setupSteps(NONE, "member").next).toBe("about");
    expect(setupSteps(facts({ businessFunctionSet: true }), "member").next).toBe("ways");
    const r = setupSteps(NONE, "member", ["about"]);
    expect(r.next).toBe("ways");
    expect(r.steps.filter((s) => s.next).map((s) => s.id)).toEqual(["ways"]);
  });

  it("a skipped step counts as done for finished but is not ticked", () => {
    const r = setupSteps(NONE, "member", SETUP_STEPS);
    expect(r).toMatchObject({ finished: true, next: null, ticked: 0, total: 2 });
    expect(r.steps.every((s) => s.skipped && s.done && !s.ticked)).toBe(true);
  });

  it("is finished when every step is ticked", () => {
    expect(setupSteps(facts({ businessFunctionSet: true, preferenceReal: true }), "member")).toMatchObject({ finished: true, ticked: 2, total: 2 });
  });

  it("ignores a skip name that is not a step", () => {
    expect(setupSteps(NONE, "member", ["team", "start"]).steps.map((s) => s.skipped)).toEqual([false, false]);
  });
});
