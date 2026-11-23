// The Setup Guide's steps from facts (spec 0052; GLOSSARY: Setup Guide): a table of facts against what an Owner, an
// Admin, a Member and a Guest see, which steps are ticked, which is next and when the guide is finished.
import { describe, expect, it } from "vitest";
import { MEMBER_STEPS, SETUP_STEPS, setupSteps, stepsFor, tickedStep, type SetupFacts } from "./setup-steps";

const NONE: SetupFacts = {
  profileAnswered: false, clockSet: false, packInstalled: false, metrics: 0, startedFromScratch: false, preferenceReal: false,
  testMessageSent: false, promptOut: false, valueIn: false, hasOtherMember: false, openInvitation: false, domainJoining: false,
  contactSubmits: false, businessFunctionSet: false,
};
const facts = (over: Partial<SetupFacts>): SetupFacts => ({ ...NONE, ...over });
const ticked = (f: SetupFacts, role: "owner" | "admin" | "member" | "guest", skips = { workspace: [] as string[], person: [] as string[] }) =>
  setupSteps(f, role, skips).steps.filter((s) => s.ticked).map((s) => s.id);

describe("who sees which steps", () => {
  it("gives Owners and Admins all five, a Member the two about themselves and a Guest none", () => {
    expect(stepsFor("owner")).toEqual(SETUP_STEPS);
    expect(stepsFor("admin")).toEqual(SETUP_STEPS);
    expect(stepsFor("member")).toEqual(MEMBER_STEPS);
    expect(stepsFor("guest")).toEqual([]);
    expect(setupSteps(NONE, "guest")).toMatchObject({ steps: [], next: null, finished: true, ticked: 0, total: 0 });
  });
});

describe("the ticks, from state only", () => {
  it("About you needs the industry, the country and a saved clock for an Owner; a Member's own function", () => {
    expect(tickedStep("about", facts({ profileAnswered: true }), "owner")).toBe(false);
    expect(tickedStep("about", facts({ clockSet: true }), "admin")).toBe(false);
    expect(tickedStep("about", facts({ profileAnswered: true, clockSet: true }), "owner")).toBe(true);
    expect(tickedStep("about", facts({ profileAnswered: true, clockSet: true }), "member")).toBe(false);
    expect(tickedStep("about", facts({ businessFunctionSet: true }), "member")).toBe(true);
  });

  it("Starting point is a Pack, a Metric or the choice to explore alone", () => {
    expect(tickedStep("start", NONE, "owner")).toBe(false);
    for (const over of [{ packInstalled: true }, { metrics: 1 }, { startedFromScratch: true }]) expect(tickedStep("start", facts(over), "owner")).toBe(true);
  });

  it("Ways in and out is the viewer's real Delivery Preference or a sent Test Message", () => {
    expect(tickedStep("ways", NONE, "member")).toBe(false);
    expect(tickedStep("ways", facts({ preferenceReal: true }), "member")).toBe(true);
    expect(tickedStep("ways", facts({ testMessageSent: true }), "owner")).toBe(true);
  });

  it("First Metric needs both the Prompt out and the value in", () => {
    expect(tickedStep("first_metric", facts({ promptOut: true }), "owner")).toBe(false);
    expect(tickedStep("first_metric", facts({ valueIn: true }), "owner")).toBe(false);
    expect(tickedStep("first_metric", facts({ promptOut: true, valueIn: true }), "owner")).toBe(true);
  });

  it("Team is another member, an open invitation, Domain Joining or a Contact who submits", () => {
    expect(tickedStep("team", NONE, "owner")).toBe(false);
    for (const over of [{ hasOtherMember: true }, { openInvitation: true }, { domainJoining: true }, { contactSubmits: true }]) expect(tickedStep("team", facts(over), "owner")).toBe(true);
  });

  it("a Member never sees or ticks the Owner's steps, whatever the Workspace has", () => {
    const all = facts({ profileAnswered: true, clockSet: true, packInstalled: true, metrics: 3, hasOtherMember: true, promptOut: true, valueIn: true });
    expect(ticked(all, "member")).toEqual([]);
    expect(ticked(facts({ ...all, preferenceReal: true, businessFunctionSet: true }), "member")).toEqual(["about", "ways"]);
  });
});

describe("the next step and when it is finished", () => {
  it("the next step is the first one neither ticked nor skipped", () => {
    expect(setupSteps(NONE, "owner").next).toBe("about");
    expect(setupSteps(facts({ profileAnswered: true, clockSet: true }), "owner").next).toBe("start");
    const r = setupSteps(NONE, "owner", { workspace: ["about", "start"], person: [] });
    expect(r.next).toBe("ways");
    expect(r.steps.filter((s) => s.next).map((s) => s.id)).toEqual(["ways"]);
  });

  it("a skipped step counts as done for finished but is not ticked", () => {
    const r = setupSteps(NONE, "owner", { workspace: [...SETUP_STEPS], person: [] });
    expect(r).toMatchObject({ finished: true, next: null, ticked: 0, total: 5 });
    expect(r.steps.every((s) => s.skipped && s.done && !s.ticked)).toBe(true);
  });

  it("is finished when every step is ticked", () => {
    const all = facts({ profileAnswered: true, clockSet: true, metrics: 1, preferenceReal: true, promptOut: true, valueIn: true, openInvitation: true });
    expect(setupSteps(all, "admin")).toMatchObject({ finished: true, ticked: 5, total: 5 });
  });

  it("uses the Workspace's skips for Owners and Admins and the person's own for a Member", () => {
    const skips = { workspace: ["about", "ways"], person: [] as string[] };
    expect(setupSteps(NONE, "member", skips).finished).toBe(false);
    expect(setupSteps(NONE, "member", { workspace: [], person: ["about", "ways"] }).finished).toBe(true);
    expect(setupSteps(NONE, "admin", { workspace: [], person: ["about", "ways"] }).finished).toBe(false);
  });

  it("the Workspace's UTC case ticks by saving the clock, not by the zone's name", () => {
    // Nothing here looks at the time zone: a saved clock is the whole fact.
    expect(tickedStep("about", facts({ profileAnswered: true, clockSet: true }), "owner")).toBe(true);
  });

  it("a step that unticks later is not ticked now (the loader decides about a finished guide)", () => {
    expect(ticked(facts({ packInstalled: true }), "owner")).toEqual(["start"]);
    expect(ticked(NONE, "owner")).toEqual([]);
  });

  it("ignores a skip name that is not the viewer's step", () => {
    const r = setupSteps(NONE, "member", { workspace: [], person: ["team", "start"] });
    expect(r.steps.map((s) => s.skipped)).toEqual([false, false]);
  });
});
