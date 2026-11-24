// A visitor's share of an expensive resource (GLOSSARY: Demo Mode; spec 0051, ticket 10), without a database: the bytes of a deck's
// saves and the Snapshots, counted per address, per network and for the demo, in steps a count can take.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ db: () => ({ rpc }) }));

import { runAsVisit } from "./demo-visit-scope";
import { chargeDeckSave, chargeShares } from "./demo-shares";
import { DemoSizeRefused } from "./demo-visitor-limits";
import { DEMO_DECK_BYTES } from "./demo-limits";
import { DEMO_WORKSPACE_ID } from "./team";

const demo = { workspaceId: DEMO_WORKSPACE_ID };
const SECRET = "s".repeat(40);
const who = { visitId: "0123456789abcdef0123456789abcdef", headers: new Headers({ "x-forwarded-for": "203.0.113.5" }) };
const visit = <T>(work: () => Promise<T>) => runAsVisit({ "x-ziffr-demo-visit": "1", "x-ziffr-demo-visit-key": "a".repeat(32) }, work);
const counts: number[] = [];
const bumps = () => rpc.mock.calls.filter((c) => c[0] === "demo_visit_bump").map((c) => c[1] as { p_kind: string; p_key: string; p_by: number });

beforeEach(() => {
  vi.stubEnv("ZIFFR_PROXY_HOPS", "1");
  counts.length = 0;
  rpc.mockReset().mockImplementation(async () => ({ data: counts.shift() ?? 1, error: null }));
});

describe("chargeShares", () => {
  it("counts the address, the network and the demo under keys of their own, and refuses past any", async () => {
    await visit(() => chargeShares(demo, who, "x", 1, { address: 5, network: 9, demo: 20 }, "words", SECRET));
    const [a, n, d] = bumps();
    expect([a.p_kind, n.p_kind, d.p_kind]).toEqual(["address", "network", "network"]);
    expect(new Set([a.p_key, n.p_key, d.p_key]).size).toBe(3);
    counts.push(6);
    await expect(visit(() => chargeShares(demo, who, "x", 1, { address: 5, network: 9 }, "address words", SECRET))).rejects.toThrow("address words");
    counts.push(1, 10);
    await expect(visit(() => chargeShares(demo, who, "x", 1, { address: 5, network: 9 }, "network words", SECRET))).rejects.toThrow("network words");
  });

  it("splits a large charge into steps of at most 1000 and refuses when the address is not known", async () => {
    await visit(() => chargeShares(demo, who, "x", 2500, { address: 99999, network: 99999 }, "w", SECRET));
    expect(bumps().filter((b) => b.p_kind === "address").map((b) => b.p_by)).toEqual([1000, 1000, 500]);
    rpc.mockClear();
    await expect(visit(() => chargeShares(demo, null, "x", 1, { address: 5, network: 9 }, "w", SECRET))).rejects.toBeInstanceOf(DemoSizeRefused);
    await expect(visit(() => chargeShares(demo, who, "x", 1, { address: 5, network: 9 }, "w", undefined))).rejects.toBeInstanceOf(DemoSizeRefused);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does nothing outside a demo visit", async () => {
    await chargeShares(demo, who, "x", 1, { address: 0, network: 0 }, "w", SECRET);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("chargeDeckSave", () => {
  it("counts the kilobytes of a save above the threshold, at most the cap, and nothing below it", async () => {
    await visit(() => chargeDeckSave(demo, who, { pad: "x".repeat(DEMO_DECK_BYTES.thresholdBytes - 100) }, "w", SECRET));
    expect(rpc).not.toHaveBeenCalled();
    await visit(() => chargeDeckSave(demo, who, { pad: "x".repeat(100 * 1024) }, "w", SECRET));
    expect(bumps().filter((b) => b.p_kind === "address").map((b) => b.p_by)).toEqual([101]);
    rpc.mockClear();
    await visit(() => chargeDeckSave(demo, who, { pad: "x".repeat(5 * 1024 * 1024) }, "w", SECRET));
    expect(bumps().filter((b) => b.p_kind === "address").reduce((n, b) => n + b.p_by, 0)).toBe(600);
  });

  it("refuses a save past the address's share of the window, in the words it is given", async () => {
    counts.push(DEMO_DECK_BYTES.perAddressKb + 1);
    await expect(visit(() => chargeDeckSave(demo, who, { pad: "x".repeat(50 * 1024) }, "used up", SECRET))).rejects.toThrow("used up");
  });
});
