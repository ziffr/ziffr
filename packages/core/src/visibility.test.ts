import { describe, expect, it } from "vitest";
import { assertCan, assertSameWorkspace, can, Forbidden, type Actor } from "./actor";
import { canReadThread, expandGroupShares, objectRole, objectRoles, visibleMetricIdsFrom, withEveryone, type InWorkspace, type MetricFacts } from "./visibility";
import type { Group } from "./types";
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
    expect(canReadThread(A, "sara", inB({ asker_id: "sara", assignee_id: "ben", metric_id: 1, read_group_id: null }), "sara", [], true)).toBe(false);
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
    const seen = visibleMetricIdsFrom(A, "anna", facts({ sharedDashboardWidgets: [inA({ metric_ids: [1], settings: {} })], sharedDeckDocuments: [inA({ document: deck, made: false })] }));
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
  it("lets the people on a thread read it, and others only if they see its Metric and it is open or they are in its group", () => {
    const groups = [inA({ id: 1, name: "Management", members: ["sara", "zoe"] })];
    const limited = inA({ asker_id: "ben", assignee_id: "anna", metric_id: 1, read_group_id: 1 });
    // The people on it, and the Metric's owner, whether or not they see the Metric otherwise.
    expect(canReadThread(A, "anna", limited, "sara", groups, false)).toBe(true);
    expect(canReadThread(A, "ben", limited, "sara", groups, false)).toBe(true);
    expect(canReadThread(A, "sara", limited, "sara", groups, false)).toBe(true);
    expect(canReadThread(A, "sara", limited, "ben", groups, true)).toBe(true);
    expect(canReadThread(A, "eve", limited, "ben", groups, true)).toBe(false);
    expect(canReadThread(A, "eve", { ...limited, read_group_id: null }, "ben", groups, true)).toBe(true);
    // Ticket 323: neither an open Thread nor its Group lets in someone who does not see the Metric.
    expect(canReadThread(A, "eve", { ...limited, read_group_id: null }, "ben", groups, false)).toBe(false);
    expect(canReadThread(A, "zoe", limited, "ben", groups, false)).toBe(false);
    expect(canReadThread(A, "zoe", limited, "ben", groups, true)).toBe(true);
  });
});

describe("workspace roles", () => {
  it("lets guests create nothing and only owners handle billing", () => {
    const as = (role: Actor["role"]): Actor => ({ personId: "x", workspaceId: A, role });
    expect(can(as("member"), "create")).toBe(true);
    expect(can(as("guest"), "create")).toBe(false);
    expect(can(as("member"), "share")).toBe(true);
    expect(can(as("guest"), "share")).toBe(false);
    expect(can(as("admin"), "manage-members")).toBe(true);
    expect(can(as("admin"), "billing")).toBe(false);
    expect(() => assertCan(as("guest"), "create")).toThrow(Forbidden);
  });
});

describe("the Everyone group", () => {
  const groups: (Group & InWorkspace)[] = [inA({ id: 1, name: "Everyone in the workspace", members: [], everyone: true }), inA({ id: 2, name: "Sales", members: ["anna"] })];
  const members = [inA({ user_id: "sara", role: "owner" }), inA({ user_id: "ben", role: "member" }), inA({ user_id: "gus", role: "guest" }), inB({ user_id: "zoe", role: "owner" })];
  it("holds every member of the workspace except guests, and nobody from another workspace", () => {
    expect(withEveryone(A, groups, members).find((g) => g.everyone)?.members).toEqual(["sara", "ben"]);
  });
  it("leaves the other groups as they are, and drops groups of other workspaces", () => {
    const out = withEveryone(A, [...groups, inB({ id: 3, name: "Board", members: ["zoe"] })], members);
    expect(out.map((g) => g.id)).toEqual([1, 2]);
    expect(out.find((g) => g.id === 2)?.members).toEqual(["anna"]);
  });
  it("shares with everyone reach each member, including those who join later", () => {
    const share = inA({ id: 1, object_type: "dashboard" as const, object_id: 5, group_id: 1, user_id: null as unknown as string, role: "viewer" as const });
    const before = expandGroupShares(A, [share], withEveryone(A, groups, members));
    expect(before.map((s) => s.user_id)).toEqual(["sara", "ben"]);
    const after = expandGroupShares(A, [share], withEveryone(A, groups, [...members, inA({ user_id: "nia", role: "member" })]));
    expect(after.map((s) => s.user_id)).toEqual(["sara", "ben", "nia"]);
  });
});

describe("roles on many objects at once", () => {
  const groups = [inA({ id: 7, name: "Ops", members: ["ben", "anna"] }), inA({ id: 8, name: "Leads", members: ["anna"] }), inB({ id: 9, name: "Board", members: ["ben"] })];
  const byGroup = (id: number, objectId: number, role: "viewer" | "editor", gid: number) => inA({ id, object_type: "dashboard" as const, object_id: objectId, group_id: gid, user_id: null as unknown as string, role });
  const raw = [
    inA({ id: 1, object_type: "dashboard" as const, object_id: 1, user_id: "ben", role: "editor" as const }),
    byGroup(2, 1, "viewer", 7), byGroup(3, 2, "viewer", 7), byGroup(4, 2, "editor", 8), byGroup(5, 3, "editor", 9),
  ];
  const shares = expandGroupShares(A, raw, groups);
  const dashboards = [inA({ id: 1, owner_id: "sara" }), inA({ id: 2, owner_id: "sara" }), inA({ id: 3, owner_id: "sara" }), inB({ id: 4, owner_id: "ben" })];
  it("keep a stronger direct role, take the stronger of two Groups, and ignore another workspace's Group", () => {
    expect(objectRoles(A, "ben", "dashboard", dashboards, shares)).toEqual(new Map([[1, "editor"], [2, "viewer"]]));
    expect(objectRoles(A, "anna", "dashboard", dashboards, shares)).toEqual(new Map([[1, "viewer"], [2, "editor"]]));
    expect(objectRoles(A, "sara", "dashboard", dashboards, shares)).toEqual(new Map([[1, "owner"], [2, "owner"], [3, "owner"]]));
  });
  it("agree with objectRole for every person and object", () => {
    for (const person of ["sara", "ben", "anna", "zoe"]) {
      const many = objectRoles(A, person, "dashboard", dashboards, shares);
      for (const d of dashboards) expect(many.get(d.id) ?? null).toBe(objectRole(A, person, "dashboard", d, shares));
    }
  });
});
