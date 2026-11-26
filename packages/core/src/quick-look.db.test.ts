// A Metric's quick look against the real database (GLOSSARY: Quick look): only for Metrics the person sees, the same
// refusal for one that is not there, nothing beyond the drawn fields, Guests, other Workspaces
// and the demo.
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { metricQuickLook, QUICK_LOOK_REFUSAL } from "./quick-look";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);
const thisMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;

describe("the quick look of a Metric", () => {
  it("shows its owner and anyone it is shared with the drawn fields and values, and nothing else", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara, { name: "Cash", description: "Secret notes" });
    await w.value(m.id, thisMonth(), 42, sara); await w.share(m.id, ann);
    for (const a of [w.actor(sara), w.actor(ann, "member")]) {
      const q = await metricQuickLook(a, m.slug);
      expect(q.metric).toMatchObject({ name: "Cash", slug: m.slug, period: "month", derived: false });
      expect(q.record).toBeNull();
      expect(Object.keys(q.metric).sort()).toEqual(["calculation_note", "decimals", "derived", "formula", "name", "period", "polarity", "slug", "sources", "target_max", "target_min", "unit", "unit_position"]);
      expect(q.points.map((p) => p.value)).toEqual([42]);
      expect(typeof q.ownerName === "string" || q.ownerName === null).toBe(true);
    }
  });

  it("offers Record a value only to someone who submits the Metric", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member"); const ben = await w.person("member");
    const m = await w.metric(sara, { name: "Visits" });
    await w.share(m.id, ann); await w.share(m.id, ben); await w.token(m.id, ann);
    expect((await metricQuickLook(w.actor(ann, "member"), m.slug)).record).toMatchObject({ name: "Visits" });
    expect((await metricQuickLook(w.actor(ben, "member"), m.slug)).record).toBeNull();
    expect((await metricQuickLook(w.actor(sara), m.slug)).record).toBeNull();
  });

  it("answers a Metric that is not shared, a Guest and a missing slug with the same words", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    const m = await w.metric(sara, { name: "Payroll" });
    expect(await refusal(metricQuickLook(w.actor(ben, "member"), m.slug))).toBe(QUICK_LOOK_REFUSAL);
    expect(await refusal(metricQuickLook(w.actor(gus, "guest"), m.slug))).toBe(QUICK_LOOK_REFUSAL);
    expect(await refusal(metricQuickLook(w.actor(ben, "member"), "no-such-metric"))).toBe(QUICK_LOOK_REFUSAL);
    await w.share(m.id, gus);
    expect((await metricQuickLook(w.actor(gus, "guest"), m.slug)).metric.name).toBe("Payroll");
    await w.unshare(m.id, gus);
    expect(await refusal(metricQuickLook(w.actor(gus, "guest"), m.slug))).toBe(QUICK_LOOK_REFUSAL);
  });

  it("shows nothing of another Workspace", async () => {
    const w = await ws(); const other = await ws();
    const sara = await w.person("owner"); const osara = await other.person("owner");
    const m = await w.metric(sara, { name: "Visits" });
    const theirs = await other.metric(osara, { name: "Theirs" });
    expect(await refusal(metricQuickLook(w.actor(sara), theirs.slug))).toBe(QUICK_LOOK_REFUSAL);
    expect((await metricQuickLook(w.actor(sara), m.slug)).metric.name).toBe("Visits");
  });

  it("reads the demo Workspace like any other", async () => {
    const { data } = await db().from("memberships").select("user_id, role").eq("workspace_id", DEMO_WORKSPACE_ID).eq("role", "owner").limit(1).single();
    const q = await metricQuickLook({ personId: data!.user_id, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, "revenue");
    expect(q.metric.name).toBe("Revenue");
    expect(q.points.length).toBeGreaterThan(1);
  });
});
