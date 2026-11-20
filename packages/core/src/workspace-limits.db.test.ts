// Workspace Limits against the real database (spec 0029, ticket #265; GLOSSARY: Workspace Limit, Archived Metric):
// the rule over the limit gives the same answer in the core and in the trigger, every way a Metric is made is held
// to it, parallel creations never pass the room, nothing else stops over the limit, and only Installation Admins set
// a limit, which the Installation Admin's list shows with nothing but names and numbers.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { createMetricWithKey } from "./api-metrics";
import { archiveMetric, restoreMetric } from "./archived-metrics";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { createMetric, metricEffects, type MetricEffects } from "./metrics";
import { forgetStoredSettings } from "./settings-in-effect";
import { submitValue } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { GRACE_DAYS, LimitReached, limitOf, limitRule, metricCount, syncDefaultLimit } from "./workspace-limits";
import { setWorkspaceLimit, workspaceLimitRows } from "./workspace-limits-admin";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const quiet = (): MetricEffects => ({ ...metricEffects, promptSubmitter: vi.fn(async () => {}) });
const days = (n: number) => new Date(Date.now() - n * 86_400_000);

// The Installation Admins and default as they were, put back after.
let admins: Record<string, unknown>[] = [];
beforeAll(async () => { admins = ((await db().from("installation_admins").select("*")).data ?? []) as Record<string, unknown>[]; });
afterAll(async () => {
  delete process.env.ZIFFR_DEFAULT_METRICS_LIMIT; delete process.env.ZIFFR_DEFAULT_LIMIT_LABEL;
  forgetStoredSettings(); await syncDefaultLimit(true);
  await db().from("installation_admins").delete().neq("person_id", "");
  if (admins.length) await db().from("installation_admins").insert(admins);
});

/** A workspace with an Owner and `n` Metrics, and its own limit when given. */
async function withMetrics(n: number, limit?: number | null, label: string | null = null) {
  const w = await ws(); const sara = await w.person("owner");
  for (let i = 0; i < n; i++) await w.metric(sara, { name: `M${i}` });
  if (limit !== undefined) await db().from("workspace_limits").insert({ workspace_id: w.id, metrics: limit, label, set_by: "installation_admin" });
  return { w, sara, make: (name = "New") => createMetric(w.actor(sara), { name }, quiet()) };
}
const since = async (id: string) => (await db().from("workspaces").select("over_limit_since").eq("id", id).single()).data?.over_limit_since as string | null;
const setSince = (id: string, at: Date | null) => db().from("workspaces").update({ over_limit_since: at?.toISOString() ?? null }).eq("id", id);

describe("the rule over the limit", () => {
  // count, limit, days since it went over (null: not over), expected.
  const cases: [number, number | null, number | null, "allow" | "over" | "refuse"][] = [
    [0, null, null, "allow"], [500, null, null, "allow"],
    [8, 10, null, "allow"], [9, 10, null, "allow"],
    [10, 10, null, "over"], [10, 10, 3, "over"], [11, 10, 3, "refuse"],
    [10, 10, GRACE_DAYS - 0.01, "over"], [10, 10, GRACE_DAYS, "refuse"], [10, 10, 30, "refuse"], [9, 10, 30, "allow"],
    [50, 50, null, "over"], [54, 50, 1, "over"], [55, 50, 1, "refuse"],
    [219, 200, 5, "over"], [220, 200, 5, "refuse"], [1099, 1000, 1, "over"], [1100, 1000, 1, "refuse"],
    // 10 % rounds down, but the room is at least one Metric.
    [1, 1, null, "over"], [2, 1, 1, "refuse"], [9, 9, null, "over"], [10, 9, 1, "refuse"], [15, 15, null, "over"], [16, 15, 1, "refuse"],
    // A limit set below the count: beyond the room, nothing new.
    [25, 10, 0, "refuse"],
  ];
  it("gives the same answer in the core and in the database for every case", async () => {
    const now = new Date();
    for (const [count, limit, ago, want] of cases) {
      const at = ago === null ? null : new Date(now.getTime() - ago * 86_400_000);
      expect(limitRule(count, limit, at, now), `core ${count}/${limit}/${ago}`).toBe(want);
      const { data, error } = await db().rpc("workspace_limit_rule", { p_count: count, p_limit: limit, p_since: at?.toISOString() ?? null, p_now: now.toISOString() });
      expect(error).toBeNull();
      expect(data, `database ${count}/${limit}/${ago}`).toBe(want);
    }
  });
});

describe("making Metrics under a limit", () => {
  it("allows 10 % more for 14 days, then waits; the refusal says why", async () => {
    const { w, make } = await withMetrics(9, 10, "Free");
    await make("Tenth");
    expect(await since(w.id)).toBeNull();
    await make("Eleventh");
    expect(await since(w.id)).not.toBeNull();
    const refused = await make("Twelfth").catch((e) => e);
    expect(refused).toBeInstanceOf(LimitReached);
    expect(refused.message).toBe("This Workspace holds 11 Metrics, more than the 10 its Size Free allows. Archive a Metric, or ask an Owner to change the Size.");
    expect(await metricCount(w.id)).toBe(11);
  });

  it("after the grace waits while it holds as many as its limit, and starts a new grace once back under", async () => {
    const { w, sara, make } = await withMetrics(10, 10);
    await setSince(w.id, days(GRACE_DAYS + 1));
    await expect(make()).rejects.toThrow("This Workspace holds 10 Metrics, as many as its limit allows. Archive a Metric, or ask whoever runs this Ziffr to raise the limit.");
    // Archiving one makes room and ends the grace; the next step over starts a new one.
    const { data: one } = await db().from("metrics").select("id").eq("workspace_id", w.id).limit(1).single();
    await archiveMetric(w.actor(sara), one!.id);
    expect(await since(w.id)).toBeNull();
    await make("Back to ten");
    await make("Over again");
    expect(new Date((await since(w.id))!).getTime()).toBeGreaterThan(Date.now() - 60_000);
    // Bringing the Archived Metric back counts again: 11 is the room, so it waits.
    await expect(restoreMetric(w.actor(sara), one!.id)).rejects.toBeInstanceOf(LimitReached);
  });

  it("holds the API, Duplicate and the Metric Catalog to it too, and the API says the count and limit", async () => {
    const { w, sara } = await withMetrics(2, 1);
    const key = { ...w.actor(sara), key: { id: "1", scopes: ["metrics:write"] } };
    await expect(createMetricWithKey(key, { name: "By key" }, quiet())).rejects.toMatchObject({ count: 2, limit: { metrics: 1 } });
    const { data: original } = await db().from("metrics").select("id").eq("workspace_id", w.id).limit(1).single();
    await expect(createMetric(w.actor(sara), { name: "Copy", duplicateOf: original!.id }, quiet())).rejects.toBeInstanceOf(LimitReached);
    const { data: catalog } = await db().from("catalog_metrics").select("id").limit(1).single();
    await expect(createMetric(w.actor(sara), { name: "From the catalog", fromCatalogId: catalog!.id }, quiet())).rejects.toBeInstanceOf(LimitReached);
    // A Metric inserted by any other way meets the same trigger.
    const { error } = await db().from("metrics").insert({ slug: `raw-${w.id.slice(0, 8)}`, name: "Raw", owner_id: sara, workspace_id: w.id, format: "number", period: "month", submission_rule: "overwrite", polarity: "higher" });
    expect(error?.code).toBe("ZF441");
  });

  it("never lets parallel creations pass the room", async () => {
    const { w, make } = await withMetrics(0, 5);
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => make(`Parallel ${i}`)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(6);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof LimitReached)).toBe(true);
    expect(await metricCount(w.id)).toBe(6);
  });

  it("counts Derived Metrics, not Archived ones; a limit set below the count starts the grace, one above ends it", async () => {
    const { w, sara } = await withMetrics(3);
    await w.metric(sara, { name: "Derived", formula: "1" });
    const { data: some } = await db().from("metrics").select("id").eq("workspace_id", w.id).limit(1).single();
    await archiveMetric(w.actor(sara), some!.id);
    expect(await metricCount(w.id)).toBe(3);
    await db().from("workspace_limits").insert({ workspace_id: w.id, metrics: 2, set_by: "installation_admin" });
    expect(await since(w.id)).not.toBeNull();
    await db().from("workspace_limits").update({ metrics: 3 }).eq("workspace_id", w.id);
    expect(await since(w.id)).toBeNull();
  });
});

describe("over the limit nothing else stops", () => {
  it("values still arrive and Prompts still go out", async () => {
    const { w, sara } = await withMetrics(0);
    const cleo = await w.contact({ email: "cleo@field.test" });
    const m = await w.metric(sara, { name: "Visits" });
    const code = await w.token(m.id, cleo);
    await w.metric(sara, { name: "Other" });
    await db().from("workspace_limits").insert({ workspace_id: w.id, metrics: 1, set_by: "installation_admin" });
    await setSince(w.id, days(GRACE_DAYS + 5));
    expect((await submitValue({ source: "web_form", sender: code, text: "4" }, { notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) })).ok).toBe(true);
    expect((await submitValue({ source: "mail", sender: "cleo@field.test", text: "5", workspaceId: w.id }, { notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) })).ok).toBe(true);
    expect(await deliverPrompt({ metricId: m.id, submitterId: cleo, senderId: sara })).toBe(true);
  });
});

describe("the Installation's default", () => {
  it("applies to Workspaces without a limit of their own, never to the demo or a trial", async () => {
    process.env.ZIFFR_DEFAULT_METRICS_LIMIT = "2"; process.env.ZIFFR_DEFAULT_LIMIT_LABEL = "Free";
    forgetStoredSettings(); await syncDefaultLimit(true);
    try {
      const { w, make } = await withMetrics(2);
      expect(await limitOf(w.id)).toEqual({ metrics: 2, label: "Free" });
      await make("Third");
      await expect(make("Fourth")).rejects.toThrow("its Size Free allows");
      // A limit of its own wins, also "no limit".
      await db().from("workspace_limits").insert({ workspace_id: w.id, metrics: null, set_by: "installation_admin" });
      expect(await limitOf(w.id)).toBeNull();
      await make("Fourth");
      expect(await limitOf(DEMO_WORKSPACE_ID)).toBeNull();
      const trial = await ws(); await trial.trial(new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10));
      expect(await limitOf(trial.id)).toBeNull();
    } finally {
      delete process.env.ZIFFR_DEFAULT_METRICS_LIMIT; delete process.env.ZIFFR_DEFAULT_LIMIT_LABEL;
      forgetStoredSettings(); await syncDefaultLimit(true);
    }
  });
});

describe("who sets a limit", () => {
  it("only an Installation Admin, never for the demo; the list shows names and numbers only; the Audit Log keeps it", async () => {
    const { w, sara } = await withMetrics(3);
    await expect(setWorkspaceLimit({ personId: sara }, w.id, { metrics: "50", label: "Small" })).rejects.toThrow(Forbidden);
    await expect(workspaceLimitRows({ personId: sara })).rejects.toThrow(Forbidden);
    await db().from("installation_admins").insert({ person_id: sara });
    await expect(setWorkspaceLimit({ personId: sara }, DEMO_WORKSPACE_ID, { metrics: "5", label: "" })).rejects.toThrow(Forbidden);
    await expect(setWorkspaceLimit({ personId: sara }, "not-a-workspace", { metrics: "5", label: "" })).rejects.toThrow(Forbidden);
    await expect(setWorkspaceLimit({ personId: sara }, w.id, { metrics: "1.5", label: "" })).rejects.toThrow("whole number");
    await expect(setWorkspaceLimit({ personId: sara }, w.id, { metrics: "5", label: "x".repeat(31) })).rejects.toThrow("30 characters");

    await setWorkspaceLimit({ personId: sara }, w.id, { metrics: "1,000", label: "Business" });
    const row = (await workspaceLimitRows({ personId: sara })).find((r) => r.workspaceId === w.id)!;
    expect(Object.keys(row).sort()).toEqual(["label", "limit", "metrics", "name", "overSince", "own", "setAt", "setBy", "setByName", "workspaceId"]);
    expect(row).toMatchObject({ metrics: 3, limit: 1000, label: "Business", own: true, setBy: "installation_admin" });
    expect((await workspaceLimitRows({ personId: sara })).some((r) => r.workspaceId === DEMO_WORKSPACE_ID)).toBe(false);

    await setWorkspaceLimit({ personId: sara }, w.id, null);
    expect((await db().from("workspace_limits").select("workspace_id").eq("workspace_id", w.id)).data).toEqual([]);
    const { data: events } = await db().from("audit_events").select("kind, details").eq("workspace_id", w.id).eq("kind", "workspace.limit_changed").order("id");
    expect(events?.map((e) => e.details)).toEqual([
      expect.objectContaining({ from_limit: null, to_limit: 1000, to_label: "Business", by: "installation_admin" }),
      expect.objectContaining({ from_limit: 1000, to_limit: null, default: true }),
    ]);
    await db().from("installation_admins").delete().eq("person_id", sara);
  });
});
