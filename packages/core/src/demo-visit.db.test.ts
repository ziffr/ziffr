// The demo's visit counts against the database (spec 0051, ticket 2): counted per kind and window, only for the demo,
// emptied by clearDemoVisitCounts (which every Demo Reset calls).
import { beforeEach, describe, expect, it } from "vitest";
import { bumpDemoVisitCount, clearDemoVisitCounts, demoVisitCount, visitKey } from "./demo-visit";
import { DEMO_WORKSPACE_ID } from "./team";
import type { Actor } from "./actor";

const demo: Actor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
const real: Actor = { personId: "someone", workspaceId: "11111111-1111-4111-8111-111111111111", role: "owner" };
const w1 = new Date("2026-11-23T14:25:00Z");
const w2 = new Date("2026-11-23T14:40:00Z");
const key = visitKey("0123456789abcdef0123456789abcdef");

beforeEach(async () => { await clearDemoVisitCounts(); });

describe("demo visit counts", () => {
  it("count up per kind, key and window, starting at zero", async () => {
    expect(await demoVisitCount(demo, "visit", key, w1)).toBe(0);
    expect(await bumpDemoVisitCount(demo, "visit", key, w1)).toBe(1);
    expect(await bumpDemoVisitCount(demo, "visit", key, w1, 4)).toBe(5);
    expect(await demoVisitCount(demo, "visit", key, w1)).toBe(5);
    expect(await demoVisitCount(demo, "visit", key, w2)).toBe(0);
    expect(await demoVisitCount(demo, "address", key, w1)).toBe(0);
  });

  it("keep the whole demo's count under no key", async () => {
    expect(await bumpDemoVisitCount(demo, "demo", "", w1)).toBe(1);
    expect(await bumpDemoVisitCount(demo, "demo", "ignored", w1)).toBe(2);
  });

  it("do not lose an add when two come at once", async () => {
    await Promise.all(Array.from({ length: 10 }, () => bumpDemoVisitCount(demo, "visit", key, w1)));
    expect(await demoVisitCount(demo, "visit", key, w1)).toBe(10);
  });

  it("refuse a key that is not a hash, and a step that is not 1 to 1000", async () => {
    await expect(bumpDemoVisitCount(demo, "visit", "0123456789abcdef0123456789abcdef-raw", w1)).rejects.toThrow();
    await expect(bumpDemoVisitCount(demo, "visit", key, w1, 0)).rejects.toThrow();
    await expect(bumpDemoVisitCount(demo, "visit", key, w1, 1001)).rejects.toThrow();
  });

  it("are never made for a real Workspace", async () => {
    await expect(bumpDemoVisitCount(real, "visit", key, w1)).rejects.toThrow();
    await expect(demoVisitCount(real, "visit", key, w1)).rejects.toThrow();
  });

  it("are emptied by a clear", async () => {
    await bumpDemoVisitCount(demo, "visit", key, w1);
    await bumpDemoVisitCount(demo, "demo", "", w2);
    await clearDemoVisitCounts();
    expect(await demoVisitCount(demo, "visit", key, w1)).toBe(0);
    expect(await demoVisitCount(demo, "demo", "", w2)).toBe(0);
  });
});
