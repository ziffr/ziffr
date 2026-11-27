// Totals in Set up against the real database (spec 0058 "Team totals", #1226; GLOSSARY: Total, Pack, Repeat): a Pack's
// Total becomes a closed Total over every line, the plan says who sees no sums, and adding a line counts the new Metric
// only where it was ticked and the actor may change the Total.
import { afterEach, describe, expect, it } from "vitest";
import { allSeriesFor } from "./access";
import { db } from "./db";
import { installPackFile } from "./packs";
import { setUpFromPack, setUpStep } from "./pack-setup";
import { planPackSetup } from "./pack-setup-plan";
import { closeTotal, openTotal, totalOpening } from "./total-opening";
import { setTotalPartPeriods } from "./total-changes";
import { exportPack } from "./pack-export";
import { share } from "./sharing";
import { SALES_TEAM } from "./test/sales-team-pack";
import { salesTeam } from "./test/sales-team-people";
import type { PackSetupInput } from "./pack-setup-build";
import type { Pack } from "./pack";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

/** The sales team's Pack with the team's commit as a Total, which a formula for the whole team reads. */
function withTotal(): Pack {
  const pack = structuredClone(SALES_TEAM);
  const commit = pack.contents.metrics![0].metric;
  pack.contents.metrics!.push(
    { key: "team-commit", total: { of: "commit", targets: "own" }, viewers: ["lead"], metric: { ...commit, format: "ziffr.metric/2", name: "Team commit", calculationNote: "The commit of every salesperson, added up." } },
    { key: "left", metric: { ...commit, name: "Left to commit", aggregation: "none", formula: "{quota} - {team-commit}" } },
  );
  return pack;
}

async function setUp() {
  const t = await salesTeam(cleanups);
  const by = t.w.actor(t.sara);
  const install = await installPackFile(by, JSON.stringify(withTotal()), { unsigned: true, assistantTexts: true });
  // The Total and the formula alone: what they are computed from is made too.
  const input: PackSetupInput = { ...t.input, metrics: ["left", "gap"] };
  const line = async (ticked: string[] = [], from?: Record<string, string>, name = "Cara"): Promise<PackSetupInput> => {
    const cara = await t.w.person("member");
    return { metrics: ["commit", "gap"], lineDashboards: [{ key: "mine" }], adding: { ticked, from }, people: [{ position: "lead", people: [t.lena] }], lines: [{ repeat: "rep", name, people: [{ position: "seller", people: [cara] }] }] };
  };
  const metric = async (name: string) => {
    const { metrics } = await allSeriesFor(by);
    return metrics.find((m) => m.name === name)!;
  };
  const parts = async (id: number) => (await db().from("total_parts").select("part_id, first_period").eq("total_id", id).order("part_id")).data!;
  return { ...t, by, install, input, line, metric, parts };
}

describe("setting up a Pack with a Total", () => {
  it("makes it over every line, closed, after its parts and before what reads it, in steps too", async () => {
    const t = await setUp();
    // One Metric a step, so the Total's parts come from earlier steps.
    let step = await setUpStep(t.by, t.install, t.input, null, 1);
    while (!step.done) step = await setUpStep(t.by, t.install, t.input, step.run, 1);
    const names = step.result.metrics.map((m) => m.name);
    expect(names.indexOf("Team commit")).toBeGreaterThan(names.indexOf("Commit, Ben"));
    expect(names.indexOf("Left to commit")).toBeGreaterThan(names.indexOf("Team commit"));
    const total = step.result.metrics.find((m) => m.name === "Team commit")!;
    expect(total.takesValues).toBe(false);
    expect((await t.metric("Team commit")).calculation_note).toBe("The commit of every salesperson, added up.");
    const { data: row } = await db().from("metrics").select("total_targets, total_opened_at, workflow_id, from_catalog_id").eq("id", total.id).single();
    expect(row).toMatchObject({ total_targets: "own", total_opened_at: null, workflow_id: null });
    expect(row!.from_catalog_id).not.toBeNull();
    const lines = step.result.metrics.filter((m) => m.key === "commit").map((m) => m.id).sort((a, b) => a - b);
    expect((await t.parts(total.id)).map((p) => p.part_id)).toEqual(lines);
    expect((await db().from("tokens").select("id").eq("metric_id", total.id)).data).toEqual([]);
  });

  it("says in the plan who sees no sums, as they then do", async () => {
    const t = await setUp();
    const plain = await planPackSetup(t.by, t.install, t.input);
    expect(plain.problems).toEqual([]);
    const shared = (names: string[]) => plain.shares.filter((s) => s.person === t.name(t.lena) && s.kind === "Metric" && names.includes(s.item)).map((s) => s.id);
    const why = async (shares: string[]) => {
      const plan = await planPackSetup(t.by, t.install, { ...t.input, shares });
      return plan.sees.find((p) => p.id === t.lena)!.metrics.find((m) => m.name === "Team commit")!.why.join(", ");
    };
    // Lena submits the quota and approves in the Workflow, but sees no line unless it is shared with her.
    expect(await why(shared(["Team commit"]))).toMatch(/no sums/);
    expect(await why(shared(["Team commit", "Commit, Anna", "Commit, Ben"]))).not.toMatch(/no sums/);
    await setUpFromPack(t.by, t.install, { ...t.input, shares: shared(["Team commit"]) });
    const total = await t.metric("Team commit");
    const anna = await t.metric("Commit, Anna");
    const ben = await t.metric("Commit, Ben");
    for (const m of [anna, ben]) await t.w.value(m.id, new Date().toISOString().slice(0, 10), 5);
    const seen = await allSeriesFor(t.w.actor(t.lena, "member"));
    expect(seen.metrics.map((m) => m.name)).toContain("Team commit");
    expect(seen.series[total.slug] ?? []).toEqual([]);
  });
});

describe("history for a Total made by Set up", () => {
  it("counts values from before the Set up as they come, and a line that joins later changes no earlier sum, nor who sees it", async () => {
    const t = await setUp();
    await setUpFromPack(t.by, t.install, t.input);
    const total = await t.metric("Team commit");
    const [anna, ben] = [await t.metric("Commit, Anna"), await t.metric("Commit, Ben")];
    expect((await t.parts(total.id)).map((p) => p.first_period)).toEqual(["1900-01-01", "1900-01-01"]);
    const sums = async (as = t.by) => (await allSeriesFor(as)).series[total.slug] ?? [];
    await t.w.value(anna.id, "2026-03-02", 5);
    expect(await sums()).toEqual([]);
    await t.w.value(ben.id, "2026-03-02", 7);
    expect(await sums()).toEqual([{ period: "2026-03-02", value: 12 }]);
    const offer = (await planPackSetup(t.by, t.install, await t.line())).offers.find((o) => o.id === `total:${total.id}`)!;
    await setUpFromPack(t.by, t.install, await t.line([offer.id]));
    expect(await t.parts(total.id)).toHaveLength(3);
    // History pasted after she joined counts those who were there then.
    await t.w.value(anna.id, "2026-02-23", 1);
    await t.w.value(ben.id, "2026-02-23", 2);
    const past = [{ period: "2026-02-23", value: 3 }, { period: "2026-03-02", value: 12 }];
    expect(await sums()).toEqual(past);
    // The same rule of sight: a past sum is for who sees every Metric counted in it, and the newcomer is not one of them.
    const lena = t.w.actor(t.lena, "member");
    await share(t.by, "metric", total.id, t.lena, "viewer");
    await share(t.by, "metric", anna.id, t.lena, "viewer");
    expect(await sums(lena)).toEqual([]);
    await share(t.by, "metric", ben.id, t.lena, "viewer");
    expect(await sums(lena)).toEqual(past);
  });
});

describe("adding a line to a Set up with a Total", () => {
  it("counts the new Metric where ticked, from the period asked for, and nowhere else", async () => {
    const t = await setUp();
    await setUpFromPack(t.by, t.install, t.input);
    const total = await t.metric("Team commit");
    // A week both lines count in and have a value for.
    for (const [name, value] of [["Commit, Anna", 5], ["Commit, Ben", 7]] as const) {
      const m = await t.metric(name);
      await setTotalPartPeriods(t.by, total.id, m.id, { first: "2026-03-02", last: null });
      await t.w.value(m.id, "2026-03-02", value);
    }
    const past = async () => (await allSeriesFor(t.by)).series[total.slug]?.find((p) => p.period === "2026-03-02")?.value;
    expect(await past()).toBe(12);
    const offered = (await planPackSetup(t.by, t.install, await t.line())).offers.find((o) => o.id === `total:${total.id}`)!;
    expect(offered).toMatchObject({ suggested: true, on: false });
    expect(offered.words).toContain("Commit, Cara");
    const unticked = await setUpFromPack(t.by, t.install, await t.line([]));
    expect(unticked.totals).toBe(0);
    expect(await t.parts(total.id)).toHaveLength(2);
    // With the period proposed, the running one, earlier totals stay as they were.
    expect((await setUpFromPack(t.by, t.install, await t.line([offered.id], undefined, "Fay"))).totals).toBe(1);
    expect(await past()).toBe(12);
    const added = await setUpFromPack(t.by, t.install, await t.line([offered.id], { [offered.id]: "2026-03-04" }, "Dan"));
    expect(added.totals).toBe(1);
    // A first period the person moved back is theirs to move: that week now waits for the new line's value.
    expect(await past()).toBeUndefined();
    const dan = added.metrics.find((m) => m.name === "Commit, Dan")!;
    expect((await t.parts(total.id)).find((p) => p.part_id === dan.id)!.first_period).toBe("2026-03-02");
    const bad = await planPackSetup(t.by, t.install, await t.line([offered.id], { [offered.id]: "soon" }, "Eve"));
    expect(bad.problems.join(" ")).toMatch(/first period/);
  });

  it("leaves a Total's entry out of a Pack made from this Workspace, naming nothing of it in the file", async () => {
    const t = await setUp();
    const { data } = await db().from("catalog_metrics").select("id, pack_key").eq("workspace_id", t.w.id).in("pack_key", ["commit", "team-commit"]);
    const res = await exportPack(t.by, { id: "sales/copy", name: "Copy", version: "1.0.0", summary: "A copy.", author: "Sales", license: "CC-BY-4.0" }, { catalog: (data ?? []).map((r) => Number(r.id)) });
    expect(res.leftOut).toContainEqual({ name: "Team commit", why: "A Total is not in a Pack yet." });
    expect(res.text).not.toMatch(/Team commit|"total"/);
  });

  it("offers an open Total unticked, saying who learns what, and drops a tick given before it was opened", async () => {
    const t = await setUp();
    await setUpFromPack(t.by, t.install, t.input);
    const total = await t.metric("Team commit");
    await openTotal(t.by, total.id, (await totalOpening(t.by, total.id)).fingerprint);
    const plan = await planPackSetup(t.by, t.install, await t.line([`total:${total.id}`]));
    expect(plan.offers.find((o) => o.id.startsWith("total:"))).toMatchObject({ id: `total:${total.id}:open`, suggested: false, on: false });
    expect(plan.byHand.join(" ")).toMatch(/was opened meanwhile/);
    const stale = await setUpFromPack(t.by, t.install, await t.line([`total:${total.id}`]));
    expect(stale.totals).toBe(0);
    expect(await t.parts(total.id)).toHaveLength(2);
    const confirmed = await setUpFromPack(t.by, t.install, await t.line([`total:${total.id}:open`], undefined, "Dan"));
    expect(confirmed.totals).toBe(1);
    await closeTotal(t.by, total.id);
  });

  it("changes no Total the actor may not change, and names none they do not see", async () => {
    const t = await setUp();
    // Without the quota there is nothing for the team dashboard's second Slot, so that dashboard is not made.
    await setUpFromPack(t.by, t.install, { ...t.input, metrics: ["commit", "team-commit"], dashboard: null });
    const total = await t.metric("Team commit");
    const ada = await t.w.person("admin");
    const theirs = await planPackSetup(t.w.actor(ada, "admin"), t.install, { ...(await t.line([`total:${total.id}`])), metrics: ["commit"], lineDashboards: [] });
    expect(theirs.offers.filter((o) => o.id.startsWith("total:"))).toEqual([]);
    expect(theirs.byHand.join(" ")).toMatch(/1 Total of this set that you cannot see/);
    expect(JSON.stringify(theirs)).not.toContain("Team commit");
    const added = await setUpFromPack(t.w.actor(ada, "admin"), t.install, { ...(await t.line([`total:${total.id}`], undefined, "Dan")), metrics: ["commit"], lineDashboards: [] });
    expect(added.totals).toBe(0);
    expect(await t.parts(total.id)).toHaveLength(2);
  });
});
