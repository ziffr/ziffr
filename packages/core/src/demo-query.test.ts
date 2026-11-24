// The demo's gates fail closed (GLOSSARY: Demo Mode; spec 0051): a database read that failed is a refusal, never "nothing in the way".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Every query answers with an error; every method of a query returns the query, and awaiting it gives the failed answer.
vi.mock("./db", () => {
  const failed = { data: null, error: { message: "boom", code: "XX000" }, count: null };
  const query: object = new Proxy(function () {}, {
    get: (_t, prop) => (prop === "then" ? (done: (v: unknown) => unknown) => Promise.resolve(failed).then(done) : query),
    apply: () => query,
  });
  return { db: () => query, seedingDemo: async <T>(w: () => Promise<T>) => w() };
});
vi.mock("./workspace-data", () => ({ getMetrics: async () => [], allRows: async () => [] }));

const { DemoCheckFailed, demoCount, demoData } = await import("./demo-query");
const { runAsVisit } = await import("./demo-visit-scope");
const { DEMO_WORKSPACE_ID } = await import("./team");
const sharing = await import("./demo-visitor-sharing");
const metrics = await import("./demo-visitor-metrics");
const { madeBySeed, refuseSeeded } = await import("./demo-seeded-rows");

const demo = { workspaceId: DEMO_WORKSPACE_ID };
const visit = <T>(work: () => Promise<T>) => runAsVisit({ "x-ziffr-demo-visit": "1" }, work);

describe("demoData and demoCount", () => {
  it("answer the data, and refuse when the query failed", () => {
    expect(demoData({ data: [1], error: null })).toEqual([1]);
    expect(demoData({ data: null, error: null })).toBeNull();
    expect(() => demoData({ data: null, error: { message: "x" } })).toThrow(DemoCheckFailed);
    expect(demoCount({ count: 0, error: null })).toBe(0);
    expect(() => demoCount({ count: null, error: null })).toThrow(DemoCheckFailed);
    expect(() => demoCount({ count: 3, error: { message: "x" } })).toThrow(DemoCheckFailed);
  });
});

describe("a gate that reads the database, fed a failed read, refuses", () => {
  it.each([
    ["visitorMetricUnused", () => sharing.visitorMetricUnused(demo, 1, "a")],
    ["visitorShowsOnlySeen (dashboard)", () => sharing.visitorShowsOnlySeen(demo, "dashboard", 1, ["ben"])],
    ["visitorShowsOnlySeen (deck)", () => sharing.visitorShowsOnlySeen(demo, "deck", 1, ["ben"])],
    ["visitorGroupPeople", () => sharing.visitorGroupPeople(demo, 1)],
    ["visitorJoinShowsOnlySeen", () => sharing.visitorJoinShowsOnlySeen(demo, 1, "ben")],
    ["visitorSharedStaysSeen", () => sharing.visitorSharedStaysSeen(demo, "dashboard", 1, [1])],
    ["visitorDerivedRoom", () => metrics.visitorDerivedRoom(demo)],
    ["visitorMembersOnly", () => metrics.visitorMembersOnly(demo, ["ben"])],
    ["madeBySeed", () => madeBySeed("metrics", 1)],
    ["refuseSeeded", () => refuseSeeded(demo, "dashboards", 1)],
    ["refuseSeededOne", () => metrics.refuseSeededOne(demo, "metrics", 1)],
  ])("%s", async (_name, gate) => {
    await expect(visit(gate as () => Promise<unknown>)).rejects.toThrow(DemoCheckFailed);
  });
});

describe("the demo's gate files read a query's error", () => {
  // A line that takes `data` or `count` out of a database read in one of these files must go through demoData or demoCount.
  const FILES = ["demo-visitor-sharing.ts", "demo-visitor-metrics.ts", "demo-seeded-rows.ts", "demo-visitor-limits.ts", "demo-visitor-words.ts", "demo-visitor-deck.ts", "demo-shares.ts"];
  it("never destructures data or count from a read without handling its error", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      let text = "";
      try { text = readFileSync(join(__dirname, f), "utf8"); } catch { continue; }
      text.split("\n").forEach((line, i) => {
        if (/const \{[^}]*\b(data|count)\b[^}]*\} = await db\(\)/.test(line) && !/\berror\b/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`);
        if (/\.\s*(data|count)\b/.test(line) && /await db\(\)/.test(line) && !/demo(Data|Count)\(/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`);
      });
    }
    expect(bad, "read through demoData/demoCount (demo-query.ts) so a failed query refuses").toEqual([]);
  });
});
