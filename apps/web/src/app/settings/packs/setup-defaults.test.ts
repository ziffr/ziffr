import { describe, expect, it } from "vitest";
import type { PackSetupOptions } from "@ziffr/core/pack-setup";
import { dashboardNeeds, guideStart, setupStart } from "./setup-defaults";

const options = (over: Partial<PackSetupOptions> = {}) => ({
  entries: [{ key: "a" }, { key: "b" }],
  dashboards: [{ key: "d" }],
  workflows: [{ key: "w", approvers: 2 }],
  people: [{ id: "me", name: "Me" }],
  ...over,
}) as unknown as PackSetupOptions;

describe("setupStart", () => {
  it("chooses every Metric, the one dashboard and the one Workflow", () => {
    const s = setupStart(options(), "me");
    expect([...s.picked]).toEqual(["a", "b"]);
    expect(s.dashboard).toBe("d");
    expect(s.workflow).toBe("w");
  });
  it("makes the viewer the Approver when they are the only person and one is asked for", () => {
    expect(setupStart(options({ workflows: [{ key: "w", approvers: 1 }] } as never), "me").approvers).toEqual(["me"]);
  });
  it("leaves Approvers empty when several are asked for, since each person may approve once", () => {
    expect(setupStart(options(), "me").approvers).toEqual(["", ""]);
  });
  it("leaves Approvers empty when others could approve or the only person is someone else", () => {
    expect(setupStart(options({ people: [{ id: "me", name: "Me" }, { id: "x", name: "X" }] }), "me").approvers).toEqual(["", ""]);
    expect(setupStart(options({ people: [{ id: "x", name: "X" }] }), "me").approvers).toEqual(["", ""]);
  });
  it("leaves out what is made once for each line of a Repeat", () => {
    const s = setupStart(options({ entries: [{ key: "a" }, { key: "b", repeat: "site" }], dashboards: [{ key: "d" }, { key: "e", repeat: "site" }], workflows: [{ key: "w", repeat: "site", approvers: 0 }] } as never), "me");
    expect([[...s.picked], s.dashboard, s.workflow]).toEqual([["a"], "d", ""]);
  });
  it("chooses neither dashboard nor Workflow when there are several or none", () => {
    const s = setupStart(options({ dashboards: [{ key: "d" }, { key: "e" }], workflows: [] } as never), "me");
    expect(s.dashboard).toBe("");
    expect(s.workflow).toBe("");
    expect(s.approvers).toEqual([]);
  });
});

describe("guideStart, what the Setup Guide ticks", () => {
  const entry = (key: string, derived = false) => ({ key, derived, inputs: [] });
  const opts = (over: Record<string, unknown> = {}) => ({
    entries: [entry("a"), entry("agg", true), entry("b"), entry("c"), entry("d")],
    dashboards: [{ key: "d1", slots: [{ label: "A", multiple: false, suggests: "a" }, { label: "B", multiple: false, suggests: "b" }] }],
    workflows: [{ key: "w", approvers: 1 }],
    people: [{ id: "me", name: "Me" }, { id: "x", name: "X" }],
    ...over,
  }) as unknown as PackSetupOptions;
  it("ticks the first three Metrics that take values, never a Derived one", () => {
    expect([...guideStart(opts(), "me").picked]).toEqual(["a", "b", "c"]);
  });
  it("ticks the first dashboard only when those Metrics fill all its Slots", () => {
    expect(guideStart(opts(), "me").dashboard).toBe("d1");
    const far = opts({ dashboards: [{ key: "d1", slots: [{ label: "D", multiple: false, suggests: "d" }] }] });
    expect(guideStart(far, "me").dashboard).toBe("");
    expect(dashboardNeeds(far, "d1")).toEqual(["d"]);
    expect(dashboardNeeds(opts({ dashboards: [{ key: "d1", slots: [{ label: "?", multiple: false }] }] }), "d1")).toBeNull();
    expect(dashboardNeeds(opts(), "nope")).toBeNull();
  });
  it("ticks the first Workflow with the person as its one Approver, and none that asks for several", () => {
    const g = guideStart(opts(), "me");
    expect([g.workflow, g.approvers]).toEqual(["w", ["me"]]);
    expect(guideStart(opts({ workflows: [{ key: "w", approvers: 0 }] }), "me")).toMatchObject({ workflow: "w", approvers: [] });
    expect(guideStart(opts({ workflows: [{ key: "w", approvers: 2 }] }), "me")).toMatchObject({ workflow: "", approvers: [] });
    expect(guideStart(opts({ workflows: [], dashboards: [] }), "me")).toMatchObject({ workflow: "", dashboard: "" });
  });
});
