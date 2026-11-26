// Setting up a Pack with Repeats in steps, against the real database (spec 0058, #1181; GLOSSARY: Pack, Repeat,
// Submitter, Workspace Limit): one set per line that only its own Submitter sees, each step taken once and only by the
// person who started with the same choices, the whole set held to the limit first, and a run that stops saying what was
// made.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { installPackFile } from "./packs";
import { setUpStep, type PackSetupStep } from "./pack-setup";
import { visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { salesTeamText } from "./test/sales-team-pack";
import { salesTeam } from "./test/sales-team-people";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const count = async (table: string, ws: string) => (await db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0;

async function team() {
  const t = await salesTeam(cleanups);
  const install = await installPackFile(t.w.actor(t.sara), salesTeamText(), { unsigned: true, assistantTexts: true });
  return { ...t, install };
}
const running = (step: PackSetupStep) => {
  if (step.done) throw new Error("finished");
  return step;
};

describe("a Set up in steps", () => {
  it("makes the Metrics a few at a time, the dashboards at the end, and each line's person sees only their line", async () => {
    const t = await team();
    const by = t.w.actor(t.sara);
    const input = { ...t.input, askNow: true };
    const first = running(await setUpStep(by, t.install, input, null, 2));
    expect([first.made, first.of]).toEqual([2, 5]);
    expect([await count("metrics", t.w.id), await count("workflows", t.w.id), await count("dashboards", t.w.id)]).toEqual([2, 1, 0]);
    const second = running(await setUpStep(by, t.install, input, first.run, 2));
    expect(second.made).toBe(4);
    const last = await setUpStep(by, t.install, input, second.run, 2);
    if (!last.done) throw new Error("not finished");
    expect(last.result.metrics.map((m) => m.name)).toEqual(["Team quota", "Commit, Anna", "Gap, Anna", "Commit, Ben", "Gap, Ben"]);
    expect([last.result.dashboards.length, last.result.workflows.length, last.result.messages]).toEqual([3, 1, 3]);
    expect([await count("metrics", t.w.id), await count("workflows", t.w.id), await count("pack_setup_items", t.w.id)]).toEqual([5, 1, 9]);
    const metrics = await getMetrics(t.w.id);
    const names = async (who: string) => { const v = await visibleMetricIds(t.w.id, who, metrics); return metrics.filter((m) => v.has(m.id)).map((m) => m.name); };
    expect(await names(t.anna)).toEqual(["Commit, Anna"]);
    expect(await names(t.ben)).toEqual(["Commit, Ben"]);
    const { data: events } = await db().from("audit_events").select("kind").eq("workspace_id", t.w.id).eq("kind", "pack.set_up");
    expect(events).toHaveLength(1);
    // A finished Set up takes no further step.
    await expect(setUpStep(by, t.install, input, second.run, 2)).rejects.toThrow(/cannot go on/);
  });

  it("takes each step once, with the same choices, and only for the person who started", async () => {
    const t = await team();
    const by = t.w.actor(t.sara);
    const ada = await t.w.person("admin");
    const first = running(await setUpStep(by, t.install, t.input, null, 1));
    await expect(setUpStep(by, t.install, { ...t.input, askNow: true }, first.run, 1)).rejects.toThrow(/cannot go on/);
    await expect(setUpStep(t.w.actor(ada, "admin"), t.install, t.input, first.run, 1)).rejects.toThrow(/cannot go on/);
    await expect(setUpStep(by, t.install, t.input, { id: first.run.id, step: 7 }, 1)).rejects.toThrow(/cannot go on/);
    const both = await Promise.allSettled([setUpStep(by, t.install, t.input, first.run, 1), setUpStep(by, t.install, t.input, first.run, 1)]);
    expect(both.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await count("metrics", t.w.id)).toBe(2);
  });

  it("holds the whole set to the Workspace Limit before anything is made", async () => {
    const t = await team();
    await t.w.limit(3);
    await expect(setUpStep(t.w.actor(t.sara), t.install, t.input, null, 1)).rejects.toThrow();
    for (const table of ["metrics", "workflows", "pack_setups"]) expect([table, await count(table, t.w.id)]).toEqual([table, 0]);
  });

  it("says what was made when it stops, and keeps that", async () => {
    const t = await team();
    const by = t.w.actor(t.sara);
    const first = running(await setUpStep(by, t.install, t.input, null, 2));
    await t.w.limit(2);
    await expect(setUpStep(by, t.install, t.input, first.run, 2)).rejects.toThrow(/Made before it stopped: Team quota, Commit, Anna, the Workflow Weekly forecast\./);
    expect(await count("metrics", t.w.id)).toBe(2);
    const { data: record } = await db().from("pack_setups").select("finished_at").eq("workspace_id", t.w.id).single();
    expect(record!.finished_at).not.toBeNull();
  });
});
