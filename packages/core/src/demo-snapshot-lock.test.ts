// One Snapshot at a time in the demo (GLOSSARY: Demo Mode, Snapshot; spec 0051, ticket 10), without a database: the turn is a
// lease in one row, taken before the work and given back after it, and a visit and a network address have a few Snapshots a
// window. Nothing here acts outside a demo visit.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ db: () => ({ rpc }) }));
// The counts the database answers, in the order they are asked: the visit's, then the address's.
const counts: number[] = [];

import { runAsVisit } from "./demo-visit-scope";
import { assertSnapshotTurn, DEMO_SNAPSHOT_BUSY, DEMO_SNAPSHOT_USED, withSnapshotTurn } from "./demo-snapshot-lock";
import { DemoSizeRefused } from "./demo-visitor-limits";
import { DEMO_BUSY } from "./demo-words";
import { DEMO_WORKSPACE_ID } from "./team";

const demo = { workspaceId: DEMO_WORKSPACE_ID };
const real = { workspaceId: "11111111-1111-4111-8111-111111111111" };
const SECRET = "s".repeat(40);
const who = { visitId: "0123456789abcdef0123456789abcdef", headers: new Headers({ "x-forwarded-for": "203.0.113.5" }) };
const visit = <T>(work: () => Promise<T>) => runAsVisit({ "x-ziffr-demo-visit": "1", "x-ziffr-demo-visit-key": "a".repeat(32) }, work);
const calls = (name: string) => rpc.mock.calls.filter((c) => c[0] === name);

beforeEach(() => {
  // One proxy in front, as the demo's Installation has: the address is the last one in the forwarded chain.
  vi.stubEnv("ZIFFR_PROXY_HOPS", "1");
  counts.length = 0;
  rpc.mockReset().mockImplementation(async (name: string) => (name === "demo_snapshot_lock_take" ? { data: true, error: null } : name === "demo_visit_bump" ? { data: counts.shift() ?? 1, error: null } : { data: null, error: null }));
});

describe("outside a demo visit", () => {
  it("runs the work as it was, with no turn and no lock", async () => {
    expect(await withSnapshotTurn(real, null, async (turn) => turn, SECRET)).toBeNull();
    expect(await withSnapshotTurn(demo, null, async (turn) => turn, SECRET)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(() => assertSnapshotTurn(demo, undefined)).not.toThrow();
    expect(() => assertSnapshotTurn(real, undefined)).not.toThrow();
  });
});

describe("in a demo visit", () => {
  it("takes the turn, runs the work with it, and gives it back", async () => {
    const answer = await visit(() => withSnapshotTurn(demo, who, async (turn) => {
      expect(turn).not.toBeNull();
      expect(() => assertSnapshotTurn(demo, turn ?? undefined)).not.toThrow();
      expect(calls("demo_snapshot_lock_release")).toHaveLength(0);
      return "taken";
    }, SECRET));
    expect(answer).toBe("taken");
    const take = calls("demo_snapshot_lock_take")[0][1] as { p_holder: string; p_seconds: number };
    expect(take.p_holder).toMatch(/^[0-9a-f]{32}$/);
    expect(take.p_seconds).toBe(90);
    expect(calls("demo_snapshot_lock_release")[0][1]).toEqual({ p_holder: take.p_holder });
  });

  it("gives the turn back when the work fails too", async () => {
    await expect(visit(() => withSnapshotTurn(demo, who, async () => { throw new Error("the Snapshot could not be taken"); }, SECRET))).rejects.toThrow("could not be taken");
    expect(calls("demo_snapshot_lock_release")).toHaveLength(1);
  });

  it("says another visitor is taking one when the turn is held, and does not run the work, count or release", async () => {
    rpc.mockImplementation(async (name: string) => ({ data: name === "demo_snapshot_lock_take" ? false : null, error: null }));
    const work = vi.fn(async () => "x");
    await expect(visit(() => withSnapshotTurn(demo, who, work, SECRET))).rejects.toThrow(DEMO_SNAPSHOT_BUSY);
    expect(work).not.toHaveBeenCalled();
    expect(calls("demo_visit_bump")).toHaveLength(0);
    expect(calls("demo_snapshot_lock_release")).toHaveLength(0);
  });

  it("is refused when the turn cannot be asked, and when the visitor's address is not known (closed, as the write budget is)", async () => {
    rpc.mockImplementation(async () => ({ data: null, error: { message: "down" } }));
    await expect(visit(() => withSnapshotTurn(demo, who, async () => "x", SECRET))).rejects.toThrow(DEMO_BUSY);
    rpc.mockClear();
    await expect(visit(() => withSnapshotTurn(demo, null, async () => "x", SECRET))).rejects.toThrow(DEMO_BUSY);
    await expect(visit(() => withSnapshotTurn(demo, who, async () => "x", undefined))).rejects.toThrow(DemoSizeRefused);
    await expect(visit(() => withSnapshotTurn(demo, { ...who, headers: new Headers() }, async () => "x", SECRET))).rejects.toThrow(DEMO_BUSY);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("counts the visit and the address, under keys of their own, and refuses past the share of either, giving the turn back", async () => {
    // The visit's count comes first (3 a window), then the address's (6).
    counts.push(4);
    await expect(visit(() => withSnapshotTurn(demo, who, async () => "x", SECRET))).rejects.toThrow(DEMO_SNAPSHOT_USED);
    expect(calls("demo_snapshot_lock_release")).toHaveLength(1);
    counts.length = 0;
    counts.push(3, 7);
    await expect(visit(() => withSnapshotTurn(demo, who, async () => "x", SECRET))).rejects.toThrow(DEMO_SNAPSHOT_USED);
    expect(calls("demo_snapshot_lock_release")).toHaveLength(2);
    const [visitCall, , addressCall] = calls("demo_visit_bump").map((c) => c[1] as { p_kind: string; p_key: string });
    expect(visitCall.p_kind).toBe("visit");
    expect(addressCall.p_kind).toBe("address");
    expect(addressCall.p_key).toMatch(/^[0-9a-f]{32}$/);
    // The network's share (12) as well: the third count of a Snapshot.
    counts.length = 0;
    counts.push(3, 1, 13);
    await expect(visit(() => withSnapshotTurn(demo, who, async () => "x", SECRET))).rejects.toThrow(DEMO_SNAPSHOT_USED);
    expect(calls("demo_snapshot_lock_release")).toHaveLength(3);
    counts.length = 0;
    counts.push(3, 6);
    expect(await visit(() => withSnapshotTurn(demo, who, async () => "ok", SECRET))).toBe("ok");
  });

  it("takes no Snapshot without the turn: the core asks for proof", async () => {
    await visit(async () => {
      expect(() => assertSnapshotTurn(demo, undefined)).toThrow(DEMO_BUSY);
      expect(() => assertSnapshotTurn(demo, { holder: "forged" })).toThrow(DEMO_BUSY);
    });
  });
});
