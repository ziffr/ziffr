// The method picker as a person gets it (GLOSSARY: Analysis Canvas, Method; spec 0041, ticket 16), against the database: the list and the
// run work only on Metrics the actor sees. A Metric they may not see is never offered (not in the canvas, not as a Slot default, not
// named in a reason, not counted), an id for one gets the same words as an id that does not exist, and a Metric that stops being
// shared drops off the list on the next call.
import { afterEach, describe, expect, it } from "vitest";
import { listPicker, runPicker, NOT_AVAILABLE, MOST_PICKED } from "./analysis-picker";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const month = (i: number) => `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;
const wobble = (i: number, k: number) => Math.round(100 + ((i * 37 + k * 11) % 23) * 3 + Math.sin(i * k) * 9 + i * 0.5);

async function setup() {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const bob = await w.person("member");
  const mk = async (name: string, k: number) => {
    const m = await w.metric(sara, { name, target_min: 100 });
    for (let i = 0; i < 24; i++) await w.value(m.id, month(i), wobble(i, k), sara);
    return m;
  };
  const [visits, revenue, secret] = [await mk("Visits", 5), await mk("Revenue", 3), await mk("Secret payroll", 7)];
  await w.share(visits.id, bob);
  await w.share(revenue.id, bob);
  return { w, sara, bob, visits, revenue, secret, as: w.actor(bob, "member"), owner: w.actor(sara, "owner") };
}

describe("the method picker's list", () => {
  it("lists what fits the canvas of the Metrics the person sees, with the reasons in words", async () => {
    const t = await setup();
    const list = await listPicker(t.as, [t.visits.id, t.revenue.id]);
    expect(list.canvas.map((m) => m.name)).toEqual(["Visits", "Revenue"]);
    const entries = list.groups.flatMap((g) => g.entries);
    const fit = (id: string) => entries.find((e) => e.id === id)!.fit;
    expect(fit("correlation")).toEqual({ entry: "correlation", ok: true });
    expect(fit("forecast").ok).toBe(true);
    expect(fit("partial")).toEqual({ entry: "partial", ok: false, reason: "Needs 3 Metrics on the canvas; there are 2." });
    expect(fit("bridge")).toEqual({ entry: "bridge", ok: false, reason: "Visits has no Breakdown for its latest period." });
    expect(entries.find((e) => e.id === "moves")!.defaults).toEqual({ metric: [t.visits.id], drivers: [t.revenue.id] });
    expect(entries.every((e) => e.useWhen.length > 0 && e.dontUseWhen.length > 0)).toBe(true);
  });

  it("shows an empty canvas as everything greyed with the same first step", async () => {
    const t = await setup();
    const list = await listPicker(t.as, []);
    const entries = list.groups.flatMap((g) => g.entries);
    expect(entries.length).toBeGreaterThan(10);
    for (const e of entries) expect(e.fit).toEqual({ entry: e.id, ok: false, reason: "Drop a Metric on the canvas first." });
  });

  it("never offers a Metric the person may not see: not on the canvas, not a default, not named, not counted", async () => {
    const t = await setup();
    const withSecret = await listPicker(t.as, [t.visits.id, t.secret.id, t.revenue.id]);
    const without = await listPicker(t.as, [t.visits.id, t.revenue.id]);
    // The list is the very same as if the hidden Metric had never been named.
    expect(withSecret).toEqual(without);
    const text = JSON.stringify(withSecret);
    expect(text).not.toContain("Secret payroll");
    // Alone, a hidden Metric is an empty canvas: nothing says there is a Metric there.
    const alone = await listPicker(t.as, [t.secret.id]);
    expect(alone.canvas).toEqual([]);
    for (const e of alone.groups.flatMap((g) => g.entries)) expect(e.fit).toEqual({ entry: e.id, ok: false, reason: "Drop a Metric on the canvas first." });
    // The owner sees it.
    const mine = await listPicker(t.owner, [t.secret.id]);
    expect(mine.canvas.map((m) => m.name)).toEqual(["Secret payroll"]);
  });

  it("drops a Metric from the list when it stops being shared", async () => {
    const t = await setup();
    expect((await listPicker(t.as, [t.visits.id, t.revenue.id])).canvas).toHaveLength(2);
    await t.w.unshare(t.revenue.id, t.bob);
    expect((await listPicker(t.as, [t.visits.id, t.revenue.id])).canvas.map((m) => m.name)).toEqual(["Visits"]);
  });

  it("reads the ids of a canvas with limits: at most 50, whole numbers, each once", async () => {
    const t = await setup();
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    expect((await listPicker(t.as, ids(MOST_PICKED))).groups.length).toBeGreaterThan(0);
    expect((await listPicker(t.as, ids(MOST_PICKED + 1))).groups).toEqual([]);
    for (const bad of ["x", null, {}, [0], [-1], [1.5], ["1"], [Number.MAX_SAFE_INTEGER + 2]]) expect((await listPicker(t.as, bad)).groups, JSON.stringify(bad)).toEqual([]);
    expect((await listPicker(t.as, [t.visits.id, t.visits.id])).canvas).toHaveLength(1);
  });
});

describe("running a picked Method", () => {
  it("gives a Takeaway over the Metrics chosen, as the Recipe does, and the pieces to save and share it", async () => {
    const t = await setup();
    const r = await runPicker(t.as, { entry: "correlation", slots: { first: [t.visits.id], second: [t.revenue.id] } });
    expect(r.ok && r.takeaway.kind).toBe("answer");
    if (r.ok) {
      expect(r.takeaway.sentence).toMatch(/Visits and Revenue/);
      expect(r.widget).toEqual({ template: "correlation", metricIds: [t.visits.id, t.revenue.id], showTarget: false });
      expect(r.recipe).toBeNull();
    }
    const moves = await runPicker(t.as, { entry: "moves", slots: { metric: [t.revenue.id], drivers: [t.visits.id] } });
    expect(moves.ok && moves.recipe?.steps[0].fn).toBe("fit");
    const reach = await runPicker(t.as, { entry: "reach-target", slots: { metric: [t.revenue.id] }, settings: { ahead: 2 } });
    expect(reach.ok && reach.widget).toEqual({ template: "forecast", metricIds: [t.revenue.id], showTarget: true });
  });

  it("refuses a Metric the person may not see in the very words it uses for one that does not exist", async () => {
    const t = await setup();
    const hidden = await runPicker(t.as, { entry: "correlation", slots: { first: [t.visits.id], second: [t.secret.id] } });
    const missing = await runPicker(t.as, { entry: "correlation", slots: { first: [t.visits.id], second: [2_000_000_000] } });
    expect(hidden).toEqual({ ok: false, message: NOT_AVAILABLE });
    expect(missing).toEqual(hidden);
    // Hidden as a driver, as the Metric to explain, and as the Metric set beside.
    expect(await runPicker(t.as, { entry: "moves", slots: { metric: [t.revenue.id], drivers: [t.visits.id, t.secret.id] } })).toEqual(hidden);
    expect(await runPicker(t.as, { entry: "moves", slots: { metric: [t.secret.id], drivers: [t.visits.id] } })).toEqual(hidden);
    expect(await runPicker(t.as, { entry: "after-date", slots: { metric: [t.visits.id], beside: [t.secret.id] }, settings: { date: "2025-03-01" } })).toEqual(hidden);
    // A Metric of another Workspace is not theirs either.
    const other = await setup();
    expect(await runPicker(t.as, { entry: "forecast", slots: { metric: [other.visits.id] } })).toEqual(hidden);
    // The owner may.
    const mine = await runPicker(t.owner, { entry: "correlation", slots: { first: [t.visits.id], second: [t.secret.id] } });
    expect(mine.ok).toBe(true);
  });

  it("names no Metric the person may not see in a Takeaway of 'What moves B?'", async () => {
    const t = await setup();
    const r = await runPicker(t.as, { entry: "moves", slots: { metric: [t.revenue.id], drivers: [t.visits.id] } });
    expect(JSON.stringify(r)).not.toContain("Secret payroll");
  });

  it("refuses what a browser should not send, in words, and runs nothing", async () => {
    const t = await setup();
    const bad = [
      undefined, null, "x", [], { entry: "nope", slots: {} }, { entry: 5 }, { entry: "forecast" }, { entry: "forecast", slots: { metric: [] } },
      { entry: "forecast", slots: { metric: [0] } }, { entry: "forecast", slots: { metric: [t.visits.id], other: [1] } }, { entry: "needs", slots: { metric: [t.revenue.id], drivers: [t.visits.id] } },
      { entry: "needs", slots: { metric: [t.revenue.id], drivers: [t.visits.id] }, settings: { goal: "1e30" } }, { entry: "after-date", slots: { metric: [t.visits.id] }, settings: { date: "2025-02-30" } },
      { entry: "forecast", slots: { metric: [t.visits.id] }, settings: { extra: 1 } },
    ];
    for (const request of bad) {
      const r = await runPicker(t.as, request);
      expect(r.ok, JSON.stringify(request)).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(5);
    }
  });

  it("will not set a Metric beside another that is counted at a different period", async () => {
    const t = await setup();
    const weekly = await t.w.metric(t.sara, { name: "Weekly", period: "week" });
    await t.w.share(weekly.id, t.bob);
    const r = await runPicker(t.as, { entry: "after-date", slots: { metric: [t.visits.id], beside: [weekly.id] }, settings: { date: "2025-03-01" } });
    expect(r).toEqual({ ok: false, message: "Weekly is not counted at the same period as Visits, so it cannot be set beside it." });
  });
});
