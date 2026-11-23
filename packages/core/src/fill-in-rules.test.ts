// Who may fill in a value for someone else, and when (spec 0046): the rules as a table, pure.
import { describe, expect, it } from "vitest";
import { mayFillIn, type FillInFacts } from "./fill-in-rules";

/** Ben owns the Metric Sara submits; Mia owns the Workflow; the Due Date has passed; the period is open and empty. */
const base: FillInFacts = {
  by: { id: "ben", role: "member", viaKey: false },
  submitterId: "sara",
  submitterIsFeed: false,
  metric: { ownerId: "ben", derived: false, archived: false, rule: "overwrite" },
  workflow: { ownerId: "mia", dueDate: "2026-11-05" },
  isStandIn: false,
  standInAsked: false,
  bySeesMetric: true,
  today: "2026-11-10",
  submitterAway: false,
  periodHasValue: false,
  periodLocked: false,
  periodCondensed: false,
  demo: false,
};
const facts = (over: Partial<FillInFacts>): FillInFacts => ({ ...base, ...over });
const refusal = (f: FillInFacts) => { const v = mayFillIn(f); return v.ok ? null : v.refusal; };

describe("mayFillIn: who", () => {
  it("lets the Metric's owner fill in after the Due Date", () => {
    expect(mayFillIn(base)).toMatchObject({ ok: true, as: "metric_owner" });
  });
  it("lets the Workflow's owner fill in, when they see the Metric", () => {
    const mia = facts({ by: { id: "mia", role: "member", viaKey: false } });
    expect(mayFillIn(mia)).toMatchObject({ ok: true, as: "workflow_owner" });
    expect(refusal({ ...mia, bySeesMetric: false })).toMatch(/do not see this Metric/);
  });
  it("lets the Stand-in fill in only for a period they were asked about", () => {
    const stand = facts({ by: { id: "mia2", role: "member", viaKey: false }, isStandIn: true, standInAsked: true });
    expect(mayFillIn(stand)).toMatchObject({ ok: true, as: "stand_in" });
    expect(refusal({ ...stand, standInAsked: false })).toMatch(/only for the periods you were asked about/);
  });
  it("lets a Contact stand in", () => {
    expect(mayFillIn(facts({ by: { id: "c", role: "contact", viaKey: false }, isStandIn: true, standInAsked: true }))).toMatchObject({ ok: true, as: "stand_in" });
  });
  it("refuses an Owner or Admin who is none of the three", () => {
    for (const role of ["owner", "admin"] as const) expect(refusal(facts({ by: { id: "zed", role, viaKey: false } }))).toMatch(/Only the Metric's owner/);
  });
  it("refuses a member who is none of the three", () => {
    expect(refusal(facts({ by: { id: "zed", role: "member", viaKey: false } }))).toMatch(/Only the Metric's owner/);
  });
  it("never a Guest, even as the Metric's owner or a Stand-in", () => {
    expect(refusal(facts({ by: { id: "ben", role: "guest", viaKey: false } }))).toMatch(/Guest/);
    expect(refusal(facts({ by: { id: "g", role: "guest", viaKey: false }, isStandIn: true, standInAsked: true }))).toMatch(/Guest/);
  });
  it("never an Access Key", () => {
    expect(refusal(facts({ by: { id: "ben", role: "owner", viaKey: true } }))).toMatch(/in the app or by answering the Prompt/);
  });
  it("never for oneself", () => {
    expect(refusal(facts({ submitterId: "ben" }))).toMatch(/own value/);
  });
  it("never for a Feed", () => {
    expect(refusal(facts({ submitterIsFeed: true }))).toMatch(/Feed/);
  });
  it("never in the demo", () => {
    expect(refusal(facts({ demo: true }))).toMatch(/demo/);
  });
});

describe("mayFillIn: when", () => {
  it("waits for the Due Date to pass, and counts the Due Date itself as not passed", () => {
    expect(refusal(facts({ today: "2026-11-05" }))).toMatch(/after the Due Date, 2026-11-05/);
    expect(refusal(facts({ today: "2026-11-04" }))).toMatch(/after the Due Date/);
    expect(mayFillIn(facts({ today: "2026-11-06" })).ok).toBe(true);
  });
  it("opens at any time while the submitter is Away", () => {
    expect(mayFillIn(facts({ today: "2026-10-20", submitterAway: true })).ok).toBe(true);
  });
  it("lets the Stand-in's Prompt answer only when one of the two holds", () => {
    const stand = facts({ by: { id: "m", role: "member", viaKey: false }, isStandIn: true, standInAsked: true, today: "2026-10-20" });
    expect(refusal(stand)).toMatch(/Due Date/);
    expect(mayFillIn({ ...stand, submitterAway: true })).toMatchObject({ ok: true, as: "stand_in" });
  });
  it("has no Due Date without a Workflow: only while Away", () => {
    expect(refusal(facts({ workflow: null }))).toMatch(/Without a Workflow/);
    expect(mayFillIn(facts({ workflow: null, submitterAway: true })).ok).toBe(true);
  });
});

describe("mayFillIn: what", () => {
  it("refuses a period that has a value", () => expect(refusal(facts({ periodHasValue: true }))).toMatch(/already has a value/));
  it("refuses a locked period: that is a Correction", () => expect(refusal(facts({ periodLocked: true }))).toMatch(/locked/));
  it("refuses a condensed period", () => expect(refusal(facts({ periodCondensed: true }))).toMatch(/condensed/));
  it("refuses a Derived Metric", () => expect(refusal(facts({ metric: { ...base.metric, derived: true } }))).toMatch(/Derived/));
  it("refuses an Archived Metric", () => expect(refusal(facts({ metric: { ...base.metric, archived: true } }))).toMatch(/Archived/));
  it("takes 'reject' and 'overwrite' and refuses 'add up' and 'keep both'", () => {
    expect(mayFillIn(facts({ metric: { ...base.metric, rule: "reject" } })).ok).toBe(true);
    expect(mayFillIn(facts({ metric: { ...base.metric, rule: "overwrite" } })).ok).toBe(true);
    expect(refusal(facts({ metric: { ...base.metric, rule: "add" } }))).toMatch(/several people/);
    expect(refusal(facts({ metric: { ...base.metric, rule: "keep_both" } }))).toMatch(/several people/);
  });
  it("picks the Stand-in's role before the owners'", () => {
    expect(mayFillIn(facts({ isStandIn: true, standInAsked: true }))).toMatchObject({ ok: true, as: "stand_in" });
  });
});
