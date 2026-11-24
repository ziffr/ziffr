// A visitor's change to the demo (GLOSSARY: Demo Mode; spec 0051, ticket 9): `asVisitor` counts the change against the
// budget once and runs it under the visit's scope, only for the demo, only for an action the demo opens, and only with a
// visit's cookie and the Generation of its page. Everywhere else the work runs as it always did. No database.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined) }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.5" }),
}));
const actor = vi.hoisted(() => ({ workspaceId: "d3e00000-0000-4000-8000-000000000001", personId: "sara", role: "owner" }));
vi.mock("./viewer", () => ({ currentActor: async () => actor }));
const allows = vi.hoisted(() => vi.fn());
vi.mock("@ziffr/core/demo-changes", () => ({ demoAllows: allows }));
const budget = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@ziffr/core/demo-budget", () => ({ checkDemoBudget: budget }));
const visiting = vi.hoisted(() => vi.fn(async (_v: unknown, work: () => Promise<unknown>) => work()));
vi.mock("@ziffr/core/demo-visiting", () => ({ visitingDemo: visiting }));

import { asVisitor, attemptAsVisitor } from "./demo-write";

const VISIT = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  jar.clear();
  jar.set("ziffr-demo", VISIT);
  jar.set("ziffr-demo-gen", "7");
  actor.workspaceId = "d3e00000-0000-4000-8000-000000000001";
  allows.mockReset().mockReturnValue(true);
  budget.mockClear();
  visiting.mockClear();
});

describe("asVisitor", () => {
  it("counts the change once and runs it under the visit's Generation and id", async () => {
    const work = vi.fn(async () => "done");
    expect(await asVisitor("canvas-actions:placeWidget", work)).toBe("done");
    expect(budget).toHaveBeenCalledTimes(1);
    expect(visiting).toHaveBeenCalledWith({ generation: 7, visit: VISIT }, work);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("runs the work as it was, with no budget and no visit, for any other Workspace", async () => {
    actor.workspaceId = "11111111-1111-4111-8111-111111111111";
    expect(await asVisitor("canvas-actions:placeWidget", async () => "real")).toBe("real");
    expect(budget).not.toHaveBeenCalled();
    expect(visiting).not.toHaveBeenCalled();
  });

  it("runs the work as it was where the demo does not open the action (the database then refuses it)", async () => {
    allows.mockReturnValue(false);
    expect(await asVisitor("theme-actions:setDefaultTheme", async () => "as before")).toBe("as before");
    expect(budget).not.toHaveBeenCalled();
    expect(visiting).not.toHaveBeenCalled();
  });

  it("refuses without a visit's id: a made-up cookie is no visit", async () => {
    jar.set("ziffr-demo", "1");
    await expect(asVisitor("canvas-actions:placeWidget", async () => "x")).rejects.toThrow("The demo can't be changed.");
    expect(budget).not.toHaveBeenCalled();
  });

  it("refuses without the Generation of the page, as stale, before anything is counted or written", async () => {
    jar.delete("ziffr-demo-gen");
    await expect(asVisitor("canvas-actions:placeWidget", async () => "x")).rejects.toThrow("The demo was reset; reload.");
    jar.set("ziffr-demo-gen", "seven");
    await expect(asVisitor("canvas-actions:placeWidget", async () => "x")).rejects.toThrow("The demo was reset; reload.");
    expect(budget).not.toHaveBeenCalled();
    expect(visiting).not.toHaveBeenCalled();
  });

  it("does not run the work when the budget is used up, and says why", async () => {
    budget.mockRejectedValueOnce(new Error("You have made a lot of changes. Try again when the demo starts fresh."));
    const work = vi.fn(async () => "x");
    await expect(asVisitor("canvas-actions:placeWidget", work)).rejects.toThrow("a lot of changes");
    expect(work).not.toHaveBeenCalled();
  });
});

describe("attemptAsVisitor", () => {
  it("answers a refusal of the demo as words, as every action does", async () => {
    jar.delete("ziffr-demo-gen");
    expect(await attemptAsVisitor("canvas-actions:placeWidget", async () => "x")).toEqual({ error: "The demo was reset; reload." });
  });
});
