// The offer's "not yet" test keeps in step with the words of the rule (spec 0046): a refusal for the time is shown as a
// disabled button with its reason, every other refusal shows no button.
import { describe, expect, it } from "vitest";
import { NOT_YET } from "./fill-in-offer";
import { mayFillIn, type FillInFacts } from "./fill-in-rules";

const facts: FillInFacts = {
  by: { id: "ben", role: "member", viaKey: false }, submitterId: "sara", submitterIsFeed: false,
  metric: { ownerId: "ben", derived: false, archived: false, rule: "reject" }, workflow: { ownerId: "mia", dueDate: "2026-04-08" },
  isStandIn: false, standInAsked: false, bySeesMetric: true, today: "2026-04-01", submitterAway: false,
  periodHasValue: false, periodLocked: false, periodCondensed: false, demo: false,
};
const refusal = (f: FillInFacts) => { const v = mayFillIn(f); return v.ok ? null : v.refusal; };

describe("NOT_YET", () => {
  it("matches the refusals for the time, with and without a Workflow", () => {
    expect(refusal(facts)).toMatch(NOT_YET);
    expect(refusal({ ...facts, workflow: null })).toMatch(NOT_YET);
  });
  it("matches no other refusal", () => {
    for (const f of [{ ...facts, periodHasValue: true }, { ...facts, periodLocked: true }, { ...facts, by: { ...facts.by, id: "zed" } }, { ...facts, metric: { ...facts.metric, rule: "add" as const } }]) {
      expect(refusal(f)).not.toBeNull();
      expect(refusal(f)).not.toMatch(NOT_YET);
    }
  });
  it("is open after the Due Date", () => {
    expect(mayFillIn({ ...facts, today: "2026-04-09" })).toMatchObject({ ok: true });
  });
});
