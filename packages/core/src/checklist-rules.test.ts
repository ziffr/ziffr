// Checklist Items, the pure rules (spec 0045, ticket #791; GLOSSARY: Checklist Item, Workflow, Guest): a Workflow's
// period as its Metrics have it, and who may read an item's words.
import { describe, expect, it } from "vitest";
import { infoItems, mayReadItem, templateStepLabel, workflowPeriod } from "./checklist-rules";
import type { ChecklistItem } from "./types";

const info = (over: Partial<Extract<ChecklistItem, { kind: "info" }>> = {}): ChecklistItem => ({ type: "checklist", id: "item-one-aaaa", kind: "info", text: "Words.", day: 1, people: [], groups: [], ...over });
const tick = (over: Partial<Extract<ChecklistItem, { kind: "tick" }>> = {}): ChecklistItem => ({ type: "checklist", id: "item-two-aaaa", kind: "tick", text: "Words.", assignee: null, dueWorkingDays: 2, ...over });

describe("a Workflow's period", () => {
  it("is the last ended period of the one period its asked Metrics share", () => {
    expect(workflowPeriod([{ period: "month" }, { period: "month", archived_at: null }] as never, "2026-04-01", 1)).toEqual({ ok: true, period: "2026-03-01", span: "month" });
    expect(workflowPeriod([{ period: "quarter" }] as never, "2026-04-01", 1)).toEqual({ ok: true, period: "2026-01-01", span: "quarter" });
  });
  it("is none for a Workflow that asks for no Metric, and mixed for Metrics of different periods", () => {
    expect(workflowPeriod([], "2026-04-01", 1)).toEqual({ ok: false, why: "none" });
    expect(workflowPeriod([{ period: "month", formula: "{a}+{b}" }, { period: "week", archived_at: "2026-01-01" }] as never, "2026-04-01", 1)).toEqual({ ok: false, why: "none" });
    expect(workflowPeriod([{ period: "month" }, { period: "quarter" }] as never, "2026-04-01", 1)).toEqual({ ok: false, why: "mixed" });
    // A Derived or Archived Metric of another period does not disagree: it is not asked.
    expect(workflowPeriod([{ period: "month" }, { period: "quarter", formula: "{a}" }, { period: "week", archived_at: "2026-01-01" }] as never, "2026-04-01", 1).ok).toBe(true);
  });
});

describe("who may read an item's words", () => {
  const owner = "sara";
  const viewer = (id: string, role = "member", groupIds: number[] = []) => ({ id, role, groupIds });
  it("lets the owner and those it goes to read them, whatever Group it is kept to", () => {
    const kept = info({ people: ["ann"], groups: [3], readGroup: 9 });
    expect(mayReadItem(kept, viewer(owner), owner)).toBe(true);
    expect(mayReadItem(kept, viewer("ann"), owner)).toBe(true);
    expect(mayReadItem(kept, viewer("cora", "member", [3]), owner)).toBe(true);
    expect(mayReadItem(kept, viewer("hal", "guest", [3]), owner)).toBe(true);
    expect(mayReadItem(tick({ assignee: "ann", readGroup: 9 }), viewer("ann", "guest"), owner)).toBe(true);
    expect(mayReadItem(tick({ standIn: "bob", readGroup: 9 }), viewer("bob"), owner)).toBe(true);
  });
  it("gives everyone else the words unless they are a Guest or outside the Group it is kept to", () => {
    expect(mayReadItem(info(), viewer("dan"), owner)).toBe(true);
    expect(mayReadItem(info(), viewer("gus", "guest"), owner)).toBe(false);
    expect(mayReadItem(info({ readGroup: 9 }), viewer("dan"), owner)).toBe(false);
    expect(mayReadItem(info({ readGroup: 9 }), viewer("eve", "admin", [9]), owner)).toBe(true);
    expect(mayReadItem(info({ readGroup: 9 }), viewer("gus", "guest", [9]), owner)).toBe(false);
  });
  it("lists the items for information of a config, in order", () => {
    const a = info({ id: "item-a-aaaaa" }); const b = info({ id: "item-b-aaaaa" });
    expect(infoItems([{ type: "remind" }, a, tick(), b, { type: "tell" }]).map((i) => i.id)).toEqual(["item-a-aaaaa", "item-b-aaaaa"]);
  });
});

describe("a Workflow Template's steps in words", () => {
  it("leave the people, the Group and the dashboard to whoever uses the template", () => {
    expect(templateStepLabel({ type: "checklist", kind: "info", text: "Cut-off is Friday.", day: 1 })).toBe("1 working day after the period: tell the people you pick “Cut-off is Friday.”");
    expect(templateStepLabel({ type: "checklist", kind: "tick", text: "Reconcile the bank account.", dueWorkingDays: 3 })).toBe("3 working days after the period: the person you pick ticks off “Reconcile the bank account.”");
    expect(templateStepLabel({ type: "send_snapshot" })).toMatch(/dashboard you pick/);
    expect(templateStepLabel({ type: "approve", approvers: 2, values: "every" })).toBe("Approval by 2 people you pick, for every value");
    expect(templateStepLabel({ type: "remind", daysBefore: 2 })).toMatch(/2 days before/);
  });
});
