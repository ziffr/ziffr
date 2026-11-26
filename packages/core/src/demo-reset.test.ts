import { beforeEach, describe, expect, it, vi } from "vitest";

// A small stand-in for the database: which rpc fail, which other Workspaces exist, what the demo's state says.
const h = vi.hoisted(() => ({
  failing: new Set<string>(),
  otherWorkspaces: [] as string[],
  state: { generation: 5, changed_since_reset: false, last_change_at: null, reset_at: "2026-11-23T10:25:00Z", showcase_ready: true, seed_done_at: "2026-11-23T10:25:20Z" } as Record<string, unknown>,
  open: [] as boolean[],
  rpc: vi.fn(),
  snapshots: vi.fn(async () => {}),
  visitCounts: vi.fn(async (): Promise<void> => {}),
}));

h.rpc.mockImplementation(async (name: string) => (h.failing.has(name) ? { data: null, error: { message: `${name} failed` } } : { data: name === "demo_reset" ? true : null, error: null }));

vi.mock("./db", () => ({
  seedingDemo: async (f: () => unknown) => f(),
  db: () => ({
    rpc: h.rpc,
    from: (table: string) => ({
      select: () => ({
        maybeSingle: async () => ({ data: h.state, error: null }),
        neq: () => ({ limit: async () => ({ data: h.otherWorkspaces.map((id) => ({ id })), error: null }) }),
        eq: async () => ({ data: [], error: null }),
      }),
      update: (v: { open_to_visitors?: boolean }) => ({ eq: async () => { if (table === "demo_state" && "open_to_visitors" in v) h.open.push(Boolean(v.open_to_visitors)); return { error: null }; } }),
      delete: () => ({ in: async () => ({ error: null }) }),
    }),
  }),
}));
vi.mock("./demo-snapshots", () => ({ seedDemoSnapshots: h.snapshots }));
vi.mock("./heads-ups", () => ({ scanWorkspace: vi.fn(async () => {}) }));
vi.mock("./questions", () => ({ askForMissingValues: vi.fn(async () => {}), sendDueReminders: vi.fn(async () => {}) }));
vi.mock("./demo-visit", () => ({ clearDemoVisitCounts: h.visitCounts }));

import { resetDemoWorkspace } from "./demo-reset";

const seedDone = () => h.rpc.mock.calls.filter((c) => c[0] === "demo_seed_done");

beforeEach(() => {
  h.failing.clear();
  h.otherWorkspaces = [];
  h.open.length = 0;
  h.rpc.mockClear();
  h.snapshots.mockReset();
  h.snapshots.mockImplementation(async () => {});
  h.visitCounts.mockImplementation(async () => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("resetDemoWorkspace", () => {
  it("carries on with the other steps when the visit counts cannot be emptied, and does not mark the seed done", async () => {
    h.visitCounts.mockImplementation(async () => { throw new Error("boom"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resetDemoWorkspace()).toBe(true);
    expect(h.rpc).toHaveBeenCalledWith("prototype_seed_pins");
    expect(h.rpc).toHaveBeenCalledWith("prototype_seed_fill_in");
    expect(h.rpc).toHaveBeenCalledWith("prototype_seed_calculation_notes");
    expect(h.rpc).toHaveBeenCalledWith("prototype_seed_showcase");
    expect(log).toHaveBeenCalledWith("Demo: visit counts not emptied", "boom");
    expect(seedDone()).toHaveLength(0);
  });

  it("marks the seed done for the Generation the reset made when every step worked", async () => {
    expect(await resetDemoWorkspace()).toBe(true);
    expect(seedDone()).toEqual([["demo_seed_done", { p_generation: 5 }]]);
  });

  it("an uncaught throw in the Snapshots step does not skip the later steps, and the seed stays open", async () => {
    h.snapshots.mockImplementation(async () => { throw new Error("no snapshots"); });
    expect(await resetDemoWorkspace()).toBe(true);
    for (const fn of ["prototype_seed_close", "prototype_seed_fill_in", "prototype_seed_showcase"]) expect(h.rpc).toHaveBeenCalledWith(fn);
    expect(seedDone()).toHaveLength(0);
  });

  it("a failed showcase leaves the seed unmarked (fail closed)", async () => {
    h.failing.add("prototype_seed_showcase");
    expect(await resetDemoWorkspace()).toBe(true);
    expect(seedDone()).toHaveLength(0);
  });

  it("opens the demo to visitors only when it is the only Workspace", async () => {
    await resetDemoWorkspace({ openToVisitors: true });
    expect(h.open).toEqual([true]);
  });

  it("refuses to open the demo, and says so, when a Workspace other than the demo exists", async () => {
    h.otherWorkspaces = ["a-real-one"];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await resetDemoWorkspace({ openToVisitors: true });
    expect(h.open).toEqual([false]);
    expect(log).toHaveBeenCalledWith("demo: not demo-only: a Workspace other than the demo exists; visitors may not change the demo");
  });
});
