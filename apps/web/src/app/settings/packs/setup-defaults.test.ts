import { describe, expect, it } from "vitest";
import type { PackSetupOptions } from "@ziffr/core/pack-setup";
import { setupStart } from "./setup-defaults";

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
  it("chooses neither dashboard nor Workflow when there are several or none", () => {
    const s = setupStart(options({ dashboards: [{ key: "d" }, { key: "e" }], workflows: [] } as never), "me");
    expect(s.dashboard).toBe("");
    expect(s.workflow).toBe("");
    expect(s.approvers).toEqual([]);
  });
});
