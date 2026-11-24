// A visitor's share of what the demo holds (spec 0051, final review D2), without a database: the math of the shares, the one table
// that maps a creating server action to its capped kind, that no opened creating action is missing from it, and what is counted.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ db: () => ({ rpc }) }));

import { demoClassOf, demoOperations } from "./demo-changes";
import { chargeCreation, mayRecordAutoVersion } from "./demo-creation";
import { DEMO_CREATES, DEMO_CREATION_EXEMPT, DEMO_ROW_CAPS, demoCreationShare } from "./demo-limits";
import { runAsVisit } from "./demo-visit-scope";
import { DemoSizeRefused } from "./demo-visitor-limits";
import { demoShareWords } from "./demo-words";
import { DEMO_WORKSPACE_ID } from "./team";

const demo = { workspaceId: DEMO_WORKSPACE_ID };
const SECRET = "s".repeat(40);
const who = { visitId: "0123456789abcdef0123456789abcdef", headers: new Headers({ "x-forwarded-for": "203.0.113.5" }) };
const headers = { "x-ziffr-demo-visit": "1", "x-ziffr-demo-visit-key": "a".repeat(32) };
const visit = <T>(work: () => Promise<T>, w: typeof who | null = who) => runAsVisit(headers, work, w);
const counts: number[] = [];
const bumps = () => rpc.mock.calls.filter((c) => c[0] === "demo_visit_bump").map((c) => c[1] as { p_kind: string; p_key: string; p_by: number });

beforeEach(() => {
  vi.stubEnv("ZIFFR_PROXY_HOPS", "1");
  counts.length = 0;
  rpc.mockReset().mockImplementation(async () => ({ data: counts.shift() ?? 1, error: null }));
});

describe("the share of a kind", () => {
  it("is a quarter of the cap for an address and half for a network, at least 1", () => {
    expect(demoCreationShare(25)).toEqual({ address: 6, network: 12 });
    expect(demoCreationShare(15)).toEqual({ address: 3, network: 7 });
    expect(demoCreationShare(10)).toEqual({ address: 2, network: 5 });
    expect(demoCreationShare(5)).toEqual({ address: 1, network: 2 });
    expect(demoCreationShare(1)).toEqual({ address: 1, network: 1 });
    expect(demoCreationShare(0)).toEqual({ address: 1, network: 1 });
  });

  it("is under the whole cap for every kind that has more than one place, so one address never fills one", () => {
    for (const cap of Object.values(DEMO_ROW_CAPS)) {
      const s = demoCreationShare(cap);
      expect(s.address).toBeLessThanOrEqual(Math.max(1, Math.ceil(cap / 4)));
      expect(s.network).toBeLessThanOrEqual(Math.max(1, Math.ceil(cap / 2)));
    }
  });
});

describe("the table of creating actions", () => {
  it("maps only actions the demo limits, to the kind that action is limited by", () => {
    for (const [operation, kind] of Object.entries(DEMO_CREATES)) {
      expect(demoClassOf(operation), operation).toMatchObject({ class: "limited", limit: kind });
      expect(kind in DEMO_ROW_CAPS).toBe(true);
    }
  });

  it("has every limited action: one that makes rows of a kind with a cap is counted, unless its kind has a share of its own", () => {
    for (const operation of demoOperations()) {
      const c = demoClassOf(operation);
      if (c?.class !== "limited" || DEMO_CREATION_EXEMPT.includes(c.limit)) continue;
      expect(DEMO_CREATES[operation], `${operation} (${c.limit}) has no creation share`).toBe(c.limit);
    }
  });

  it("gives every capped kind a share, or says why not", () => {
    const mapped = new Set<string>(Object.values(DEMO_CREATES));
    for (const kind of Object.keys(DEMO_ROW_CAPS)) expect(mapped.has(kind) || DEMO_CREATION_EXEMPT.includes(kind), kind).toBe(true);
  });

  it("covers every opened action whose name says it makes something", () => {
    // An opened (not limited) action that makes rows would escape the table by being `open`: a verb of making must be mapped or named here.
    const MAKES = /:(create|make|add|duplicate|new|request|saveAs|saveTo)/;
    const NOT_A_NEW_ROW = ["canvas-actions:applyTemplate"]; // fills a widget that exists (a dashboard's widgets are capped per dashboard)
    for (const operation of demoOperations()) {
      if (demoClassOf(operation)?.class !== "open" || !MAKES.test(operation)) continue;
      expect(operation in DEMO_CREATES || NOT_A_NEW_ROW.includes(operation), `${operation} makes rows but has no share`).toBe(true);
    }
  });
});

describe("chargeCreation", () => {
  it("counts the address and the network under a key of the kind, before the write", async () => {
    await visit(() => chargeCreation(demo, who, "canvas-actions:createDashboardNamed", SECRET));
    const [a, n] = bumps();
    expect([a.p_kind, n.p_kind, bumps().length]).toEqual(["address", "network", 2]);
    expect(a.p_key).not.toBe(n.p_key);
    // Another kind is counted under another key: filling one kind uses none of another's share.
    await visit(() => chargeCreation(demo, who, "theme-actions:duplicateTheme", SECRET));
    expect(bumps()[2].p_key).not.toBe(a.p_key);
  });

  it("refuses in plain words past the address's share, and past the network's", async () => {
    counts.push(demoCreationShare(DEMO_ROW_CAPS.dashboards).address + 1);
    await expect(visit(() => chargeCreation(demo, who, "home-actions:newDashboard", SECRET))).rejects.toThrow(demoShareWords("dashboards"));
    counts.push(1, demoCreationShare(DEMO_ROW_CAPS.decks).network + 1);
    await expect(visit(() => chargeCreation(demo, who, "deck-actions:createDeck", SECRET))).rejects.toThrow(DemoSizeRefused);
  });

  it("costs nothing for an action that makes nothing capped or outside a visit, and refuses closed without an address", async () => {
    await visit(() => chargeCreation(demo, who, "canvas-actions:updateWidget", SECRET));
    await chargeCreation(demo, who, "canvas-actions:createDashboardNamed", SECRET);
    expect(bumps()).toEqual([]);
    await expect(visit(() => chargeCreation(demo, { ...who, headers: new Headers() }, "canvas-actions:createDashboardNamed", SECRET))).rejects.toThrow(DemoSizeRefused);
  });

  it("says in the words of a kind what is used, and the general ones for an unknown kind", () => {
    expect(demoShareWords("versions")).toMatch(/Versions/);
    expect(demoShareWords("unknown")).toMatch(/Try again/);
  });
});

describe("an automatic Version", () => {
  beforeEach(() => { vi.stubEnv("ZIFFR_DEMO_ADDRESS_KEY", SECRET); });

  it("is counted against the address, the network and the demo's two thirds, and is never an error", async () => {
    await expect(visit(() => mayRecordAutoVersion(demo))).resolves.toBe(true);
    expect(bumps().length).toBe(3);
    counts.push(demoCreationShare(DEMO_ROW_CAPS.versions).address + 1);
    await expect(visit(() => mayRecordAutoVersion(demo))).resolves.toBe(false);
  });

  it("is left out when the demo's share of automatic Versions is used", async () => {
    counts.push(1, 1, Math.floor((DEMO_ROW_CAPS.versions * 2) / 3) + 1);
    await expect(visit(() => mayRecordAutoVersion(demo))).resolves.toBe(false);
  });

  it("is left out, not failed, when counting itself fails; and goes on where the scope has no requester", async () => {
    rpc.mockReset().mockRejectedValue(new Error("db down"));
    await expect(visit(() => mayRecordAutoVersion(demo))).resolves.toBe(false);
    rpc.mockReset();
    await expect(visit(() => mayRecordAutoVersion(demo), null)).resolves.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("the doors", () => {
  it("both charge the share inside the visit's scope, before the work (the shares act only in a visit), and pass who on", () => {
    for (const file of ["demo-visit-action.ts", "../../../apps/web/src/lib/demo-write.ts"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src, file).toMatch(/visitingDemo\([^\n]*async \(\) => \{ await chargeCreation\(/);
    }
  });

  it("let an automatic Version be left out by the share, never fail the edit (versions.ts asks before each insert)", () => {
    const src = readFileSync(new URL("versions.ts", import.meta.url), "utf8");
    expect(src.match(/mayRecordAutoVersion\(/g)?.length).toBe(2);
  });
});
