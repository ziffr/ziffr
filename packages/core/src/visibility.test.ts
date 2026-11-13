import { describe, expect, it } from "vitest";
import { assertCan, assertSameWorkspace, can, Forbidden, type Actor } from "./actor";
import { canReadThread, expandGroupShares, objectRole, visibleMetricIdsFrom, type MetricFacts } from "./visibility";
import { metric } from "./test/fixtures";

const A = "ws-a";
const B = "ws-b";
const inA = <T extends object>(o: T) => ({ ...o, workspace_id: A });
const inB = <T extends object>(o: T) => ({ ...o, workspace_id: B });

const revenue = inA(metric({ id: 1, slug: "revenue", owner_id: "sara" }));
const cost = inA(metric({ id: 2, slug: "cost", name: "Cost", owner_id: "ben" }));
const margin = inA(metric({ id: 3, slug: "margin", name: "Margin", owner_id: "anna", formula: "({revenue} - {cost}) / {revenue}" }));
const foreign = inB(metric({ id: 9, slug: "secret", name: "Secret", owner_id: "zoe" }));

const facts = (over: Partial<MetricFacts> = {}): MetricFacts => ({
  metrics: [revenue, cost, margin, foreign], tokens: [], shares: [], sharedDashboardWidgets: [], sharedDeckDocuments: [], ...over,
});

describe("workspace isolation", () => {
  it("never grants a metric of another workspace, whatever the facts claim", () => {
    const f = facts({
      shares: [inB({ id: 1, object_type: "metric", object_id: 9, user_id: "anna", role: "viewer" }), inA({ id: 2, object_type: "metric", object_id: 9, user_id: "anna", role: "viewer" })],
      tokens: [inB({ metric_id: 9, submitter_id: "anna" })],
      sharedDashboardWidgets: [inA({ metric_ids: [9], settings: {} })],
    });
    expect(visibleMetricIdsFrom(A, "anna", f).has(9)).toBe(false);
  });
  it("ignores shares, groups and objects from another workspace", () => {
    const groups = [inB({ id: 7, name: "Board", members: ["anna"] })];
    const shares = expandGroupShares(A, [inA({ id: 1, object_type: "dashboard", object_id: 1, group_id: 7, user_id: null as unknown as string, role: "viewer" })], groups);
    expect(shares).toEqual([]);
    expect(objectRole(A, "sara", "dashboard", inB({ id: 1, owner_id: "sara" }), [])).toBeNull();
    expect(canReadThread(A, "sara", inB({ asker_id: "sara", assignee_id: "ben", metric_id: 1, read_group_id: null }), "sara", [])).toBe(false);
  });
  it("refuses rows from another workspace, and missing rows", () => {
    const actor: Actor = { personId: "sara", workspaceId: A, role: "owner" };
    expect(() => assertSameWorkspace(actor, inA({}), inA({}))).not.toThrow();
    expect(() => assertSameWorkspace(actor, inA({}), inB({}))).toThrow(Forbidden);
    expect(() => assertSameWorkspace(actor, null)).toThrow(Forbidden);
  });
});

describe("visibility inside a workspace", () => {
  it("shows a person what they own, submit to, or was shared with them", () => {
    expect([...visibleMetricIdsFrom(A, "sara", facts())]).toEqual([1]);
    expect(visibleMetricIdsFrom(A, "anna", facts({ tokens: [inA({ metric_id: 2, submitter_id: "anna" })] })).has(2)).toBe(true);
    expect(visibleMetricIdsFrom(A, "anna", facts({ shares: [inA({ id: 1, object_type: "metric", object_id: 1, user_id: "anna", role: "viewer" })] })).has(1)).toBe(true);
  });
  it("shows what a shared dashboard or deck draws", () => {
    const deck = { store: { "shape:x": { type: "ziffr-widget", props: { metricIds: [2], settings: "{}" } } } };
    const seen = visibleMetricIdsFrom(A, "anna", facts({ sharedDashboardWidgets: [inA({ metric_ids: [1], settings: {} })], sharedDeckDocuments: [inA({ document: deck })] }));
    expect([...seen].sort()).toEqual([1, 2, 3]); // and Margin, which Anna owns and whose inputs she now sees
  });
  it("shows a derived metric to its owner, but not to others who see its inputs", () => {
    expect(visibleMetricIdsFrom(A, "anna", facts()).has(3)).toBe(true);
    const sharedInputs = facts({ shares: [1, 2].map((id) => inA({ id, object_type: "metric" as const, object_id: id, user_id: "zoe", role: "viewer" as const })) });
    expect(visibleMetricIdsFrom(A, "zoe", sharedInputs).has(3)).toBe(false);
  });
  it("counts a group share for every member, the stronger role winning", () => {
    const groups = [inA({ id: 7, name: "Ops", members: ["ben", "anna"] })];
    const shares = expandGroupShares(A, [
      inA({ id: 1, object_type: "dashboard", object_id: 1, group_id: 7, user_id: null as unknown as string, role: "editor" }),
      inA({ id: 2, object_type: "dashboard", object_id: 1, user_id: "ben", role: "viewer" }),
    ], groups);
    expect(objectRole(A, "ben", "dashboard", inA({ id: 1, owner_id: "sara" }), shares)).toBe("editor");
    expect(objectRole(A, "anna", "dashboard", inA({ id: 1, owner_id: "sara" }), shares)).toBe("editor");
    expect(objectRole(A, "zoe", "dashboard", inA({ id: 1, owner_id: "sara" }), shares)).toBeNull();
  });
  it("lets the people on a thread read it, and others only if it is open or they are in its group", () => {
    const groups = [inA({ id: 1, name: "Management", members: ["sara"] })];
    const limited = inA({ asker_id: "ben", assignee_id: "anna", metric_id: 1, read_group_id: 1 });
    expect(canReadThread(A, "anna", limited, "sara", groups)).toBe(true);
    expect(canReadThread(A, "sara", limited, "ben", groups)).toBe(true);
    expect(canReadThread(A, "zoe", limited, "ben", groups)).toBe(false);
    expect(canReadThread(A, "zoe", { ...limited, read_group_id: null }, "ben", groups)).toBe(true);
  });
});

describe("workspace roles", () => {
  it("lets guests create nothing and only owners handle billing", () => {
    const as = (role: Actor["role"]): Actor => ({ personId: "x", workspaceId: A, role });
    expect(can(as("member"), "create")).toBe(true);
    expect(can(as("guest"), "create")).toBe(false);
    expect(can(as("admin"), "manage-members")).toBe(true);
    expect(can(as("admin"), "billing")).toBe(false);
    expect(() => assertCan(as("guest"), "create")).toThrow(Forbidden);
  });
});
