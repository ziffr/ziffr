import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async (name: string) => ({ data: name === "demo_reset" ? true : null, error: null }));
vi.mock("./db", () => ({ db: () => ({ rpc }), seedingDemo: async (f: () => unknown) => f() }));
vi.mock("./demo-snapshots", () => ({ seedDemoSnapshots: vi.fn(async () => {}) }));
vi.mock("./questions", () => ({ askForMissingValues: vi.fn(async () => {}), sendDueReminders: vi.fn(async () => {}) }));
vi.mock("./demo-visit", () => ({ clearDemoVisitCounts: vi.fn(async () => { throw new Error("boom"); }) }));

import { resetDemoWorkspace } from "./demo-reset";

describe("resetDemoWorkspace", () => {
  it("carries on with the other steps when the visit counts cannot be emptied", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resetDemoWorkspace()).toBe(true);
    expect(rpc).toHaveBeenCalledWith("prototype_seed_pins");
    expect(rpc).toHaveBeenCalledWith("prototype_seed_fill_in");
    expect(log).toHaveBeenCalledWith("Demo: visit counts not emptied", "boom");
  });
});
