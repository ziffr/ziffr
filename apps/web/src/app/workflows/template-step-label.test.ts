// A Workflow Template's steps in words (spec 0045, ticket #791; GLOSSARY: Workflow Template, Checklist Item).
import { describe, expect, it } from "vitest";
import { templateStepLabel } from "./template-step-label";

describe("a Workflow Template's steps in words", () => {
  it("leave the people, the Group and the dashboard to whoever uses the template", () => {
    expect(templateStepLabel({ type: "checklist", kind: "info", text: "Cut-off is Friday.", day: 1 })).toBe("1 working day after the period: tell the people you pick “Cut-off is Friday.”");
    expect(templateStepLabel({ type: "checklist", kind: "tick", text: "Reconcile the bank account.", dueWorkingDays: 3 })).toBe("3 working days after the period: the person you pick ticks off “Reconcile the bank account.”");
    expect(templateStepLabel({ type: "send_snapshot" })).toMatch(/dashboard you pick/);
    expect(templateStepLabel({ type: "approve", approvers: 2, values: "every" })).toBe("Approval by 2 people you pick, for every value");
    expect(templateStepLabel({ type: "remind", daysBefore: 2 })).toMatch(/2 days before/);
  });
});
