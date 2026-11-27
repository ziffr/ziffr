import { describe, expect, it } from "vitest";
import type { PackSetupOptions } from "@ziffr/core/pack-setup";
import { addedLines, lineSetupStart, openSlots, setupStart } from "./setup-defaults";

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
  it("chooses the one dashboard and Workflow of the whole set and of each Repeat", () => {
    const s = setupStart(options({ repeats: [{ key: "site" }, { key: "client" }], entries: [{ key: "a" }, { key: "b", repeat: "site" }], dashboards: [{ key: "d", repeat: null }, { key: "e", repeat: "site" }], workflows: [{ key: "w", repeat: "site", approvers: 0 }] } as never), "me");
    expect([[...s.picked], s.dashboard, s.workflow]).toEqual([["a", "b"], "d", ""]);
    expect([s.lineDashboards, s.lineWorkflows]).toEqual([{ site: "e", client: "" }, { site: "w", client: "" }]);
  });
  it("chooses neither dashboard nor Workflow when there are several or none", () => {
    const s = setupStart(options({ dashboards: [{ key: "d" }, { key: "e" }], workflows: [] } as never), "me");
    expect(s.dashboard).toBe("");
    expect(s.workflow).toBe("");
    expect(s.approvers).toEqual([]);
  });
});

describe("the lines of a Repeat", () => {
  it("adds one line for each pasted name, up to the Repeat's most", () => {
    const rows = addedLines([{ id: 4, name: "Anna", fills: {} }], "Ben\r\n\n  Cara   Lee \nDan", 3);
    expect(rows.map((r) => [r.id, r.name])).toEqual([[4, "Anna"], [5, "Ben"], [6, "Cara Lee"]]);
  });
  it("asks for a Metric only for the Slots nothing made here fills", () => {
    const o = { entries: [{ key: "own", repeat: null }, { key: "line", repeat: "rep" }] } as unknown as PackSetupOptions;
    const slots = [{ label: "a", multiple: false, suggests: "own" }, { label: "all", multiple: true, suggests: "line" }, { label: "one", multiple: false, suggests: "line" }, { label: "?", multiple: false }];
    const open = (repeat: string | null) => openSlots(o, { key: "d", name: "d", slots, repeat }, new Set(["own", "line"])).map((x) => x.slot.label);
    expect(open(null)).toEqual(["one", "?"]);
    expect(open("rep")).toEqual(["?"]);
    expect(openSlots(o, { key: "d", name: "d", slots, repeat: null }, new Set()).length).toBe(4);
  });
});

describe("adding a line", () => {
  it("starts with what the lines so far got, and nothing for the whole set", () => {
    const s = lineSetupStart("rep", { metrics: ["commit"], dashboard: "mine", workflow: "" });
    expect([[...s.picked], s.dashboard, s.workflow, s.lineDashboards, s.lineWorkflows]).toEqual([["commit"], "", "", { rep: "mine" }, { rep: "" }]);
  });
});
