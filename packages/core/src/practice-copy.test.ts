// The pure parts of filling a Practice Workspace from the demo (spec 0063; GLOSSARY: Practice Workspace, Made-up
// Person): a Workflow names nobody of the demo afterwards, and a made-up address can never be routed.
import { describe, expect, it } from "vitest";
import { neverRouted } from "./practice";
import { madeUpAddress, mappedWorkflow } from "./practice-copy";
import type { WorkflowConfig } from "./types";

const maps = { person: new Map([["sara", "me"], ["ben", "p-ben"]]), group: new Map([[1, 11]]), dashboard: new Map([[5, 55]]) };
const config: WorkflowConfig = {
  dueWorkingDays: 3,
  steps: [
    { type: "remind", daysBefore: 1 },
    { type: "approve", approvers: ["ben", "sara", "gone"] },
    { type: "tell", id: "t", condition: { kind: "below", value: "1" }, people: ["ben", "gone"], groups: [1, 2], webhooks: ["hook-of-the-demo"] },
    { type: "checklist", id: "a", text: "Look", kind: "info", day: 1, people: ["sara"], groups: [1], readGroup: 1 },
    { type: "checklist", id: "b", text: "Tick", kind: "tick", assignee: "ben", standIn: "gone", dueWorkingDays: 2 },
    { type: "checklist", id: "c", text: "Kept to a Group that is not there", kind: "tick", assignee: "ben", dueWorkingDays: 2, readGroup: 9 },
    { type: "send_snapshot", id: "s", dashboardId: 5, people: ["ben"], groups: [2] },
    { type: "publish", lock: true },
  ],
};

describe("a Workflow copied from the demo", () => {
  const steps = mappedWorkflow(config, maps).steps;
  it("names the copy's people, Groups and dashboard, and carries no Webhook", () => {
    expect(steps).toEqual([
      { type: "remind", daysBefore: 1 },
      { type: "approve", approvers: ["p-ben", "me"] },
      { type: "tell", id: "t", condition: { kind: "below", value: "1" }, people: ["p-ben"], groups: [11], webhooks: [] },
      { type: "checklist", id: "a", text: "Look", kind: "info", day: 1, people: ["me"], groups: [11], readGroup: 11 },
      { type: "checklist", id: "b", text: "Tick", kind: "tick", assignee: "p-ben", standIn: null, dueWorkingDays: 2 },
      { type: "send_snapshot", id: "s", dashboardId: 55, people: ["p-ben"], groups: [] },
      { type: "publish", lock: true },
    ]);
  });
  it("leaves out an Approve step nobody is left for", () => {
    expect(mappedWorkflow({ dueWorkingDays: 1, steps: [{ type: "approve", approvers: ["gone"] }] }, maps).steps).toEqual([]);
  });
});

describe("a made-up person's address", () => {
  it.each(["Sara Lindqvist", "Jörg Müller-Lüdenscheidt", "  ", "<script>@example.org", "x".repeat(200)])("is one plain address that is never routed, whatever the name %j", (name) => {
    const address = madeUpAddress(name, "0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(address).toMatch(/^[a-z0-9.]+\.0f8fad5b@practice\.invalid$/);
    expect(address.length).toBeLessThan(80);
    expect(neverRouted(address)).toBe(true);
  });
});
