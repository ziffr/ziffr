// The one door of a visitor's change (spec 0051, ticket 8), tried without a database: what it counts, what it refuses before any
// work, and that only an opened operation with the setting in effect becomes a visit.
import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({ value: {} as Record<string, string | undefined> }));
const calls = vi.hoisted(() => ({ budget: [] as unknown[], run: 0, visits: [] as unknown[], refuse: null as Error | null }));

vi.mock("./settings-in-effect", () => ({ settingsInEffect: async () => settings.value, settingsInEffectNow: () => settings.value }));
vi.mock("./demo-budget", async () => {
  const real = await vi.importActual<typeof import("./demo-budget")>("./demo-budget");
  return {
    ...real,
    checkDemoBudget: async (...args: unknown[]) => { calls.budget.push(args); if (calls.refuse) throw calls.refuse; },
    takeDemoWorkflowRun: async () => { calls.run += 1; },
  };
});
vi.mock("./demo-visiting", () => ({ visitingDemo: async (visit: unknown, work: () => Promise<unknown>) => { calls.visits.push(visit); return work(); } }));

import { demoVisitRefusal, runDemoVisit, type DemoRequest } from "./demo-visit-action";
import { DemoBudgetUsed } from "./demo-budget";
import { DemoLimit, DemoReadOnly, DemoSeededWords, DemoShowcase, DemoStale } from "./demo";
import { DemoTextRefused } from "./demo-text";
import { DEMO_WORKSPACE_ID } from "./team";

const visitId = "0123456789abcdef0123456789abcdef";
const who: DemoRequest = { visitId, generation: 7, headers: new Headers({ "x-forwarded-for": "203.0.113.7" }) };
const on = { ZIFFR_DEMO_ONLY: "1", ZIFFR_DEMO_CHANGES: "1" };
const seen = (visiting: boolean) => Promise.resolve(visiting);

beforeEach(() => {
  settings.value = {};
  calls.budget = [];
  calls.run = 0;
  calls.visits = [];
  calls.refuse = null;
});

describe("runDemoVisit", () => {
  it("runs the work as an ordinary, refused one while the setting is off: no count, no visit", async () => {
    await expect(runDemoVisit("series-actions:recordValue", who, seen)).resolves.toBe(false);
    expect(calls.budget).toEqual([]);
    expect(calls.visits).toEqual([]);
  });

  it("does the same for an operation that is blocked or unknown, even with the setting in effect", async () => {
    settings.value = on;
    await expect(runDemoVisit("canvas-actions:placeWidget", who, seen)).resolves.toBe(false);
    await expect(runDemoVisit("made-up-actions:doSomething", who, seen)).resolves.toBe(false);
    expect(calls.budget).toEqual([]);
    expect(calls.visits).toEqual([]);
  });

  it("counts an opened operation once against the budget, then runs it as the visit of this Generation", async () => {
    settings.value = on;
    await expect(runDemoVisit("series-actions:recordValue", who, seen)).resolves.toBe(true);
    expect(calls.budget).toHaveLength(1);
    expect((calls.budget[0] as unknown[]).slice(0, 2)).toEqual([{ workspaceId: DEMO_WORKSPACE_ID }, { visitId, headers: who.headers }]);
    expect((calls.budget[0] as unknown[])[4]).toMatchObject({ values: true });
    expect(calls.visits).toEqual([{ generation: 7, visit: visitId }]);
    expect(calls.run).toBe(0);
  });

  it("takes the one Workflow run a minute only where the operation runs the Workflows", async () => {
    settings.value = on;
    await runDemoVisit("workflow-actions:runWorkflowsNow", who, seen, { workflowRun: true });
    expect(calls.run).toBe(1);
    await runDemoVisit("workflow-actions:approveValue", who, seen);
    expect(calls.run).toBe(1);
  });

  it("refuses before any work a visit with no id (as a change the demo does not take) and a page with no Generation (stale)", async () => {
    settings.value = on;
    const work = vi.fn(seen);
    await expect(runDemoVisit("series-actions:recordValue", { ...who, visitId: null }, work)).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(runDemoVisit("series-actions:recordValue", { ...who, generation: null }, work)).rejects.toBeInstanceOf(DemoStale);
    expect(work).not.toHaveBeenCalled();
    expect(calls.budget).toEqual([]);
  });

  it("does not run the work when the budget refuses", async () => {
    settings.value = on;
    calls.refuse = new DemoBudgetUsed("busy");
    const work = vi.fn(seen);
    await expect(runDemoVisit("series-actions:recordValue", who, work, { workflowRun: true })).rejects.toBe(calls.refuse);
    expect(work).not.toHaveBeenCalled();
    expect(calls.run).toBe(0);
    expect(calls.visits).toEqual([]);
  });
});

describe("demoVisitRefusal", () => {
  it("gives the words of what a visit's change is refused with, and nothing else", () => {
    for (const e of [new DemoBudgetUsed("a"), new DemoTextRefused("b"), new DemoStale(), new DemoLimit("values"), new DemoShowcase(), new DemoSeededWords()]) {
      expect(demoVisitRefusal(e)).toBe(e.message);
    }
    for (const e of [new DemoReadOnly({}), new Error("boom"), null, undefined, "text", { message: "x" }]) expect(demoVisitRefusal(e)).toBeNull();
  });
});
