// Ziffr's Sales forecast Pack set up whole against the real database (spec 0058, #1190; GLOSSARY: Pack, Position,
// Repeat, Total): four figures for each salesperson, the team's added up, the quota from the salespeople's targets, and
// who then sees what.
import { afterEach, describe, expect, it } from "vitest";
import { allSeriesFor, canvasSeries, visibleMetricIds } from "./access";
import { db } from "./db";
import { workflowsView } from "./page-data";
import { installPackFile } from "./packs";
import { setUpFromPack } from "./pack-setup";
import { planPackSetup } from "./pack-setup-plan";
import { periodStart } from "./periods";
import { getMetrics } from "./workspace-data";
import { saveSeriesRows } from "./metrics";
import { startingPack } from "./starting-packs.test";
import { workspace } from "./test/db-fixtures";
import type { PackSetupInput } from "./pack-setup-build";
import type { WorkflowConfig } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const EACH = ["commit", "best-case", "closed-quarter", "pipeline"];

async function setUp() {
  const w = await workspace("Forecast"); cleanups.push(w.cleanup);
  const [sara, lena, anna, ben] = [await w.person("owner"), await w.person("member"), await w.person("member"), await w.person("member")];
  const by = w.actor(sara);
  const install = await installPackFile(by, startingPack("sales-forecast.pack.json"), { unsigned: true, assistantTexts: true });
  const line = (name: string, person: string) => ({ repeat: "rep", name, people: [{ position: "seller", people: [person] }] });
  const input: PackSetupInput = {
    metrics: [...EACH, "team-commit", "team-best-case", "team-closed", "team-pipeline", "quota", "commit-gap", "commit-share", "coverage"],
    dashboard: { key: "forecast-weekly" },
    workflow: { key: "weekly-forecast" },
    people: [{ position: "sales-lead", people: [lena] }],
    lines: [line("Anna", anna), line("Ben", ben)],
  };
  return { w, sara, lena, anna, ben, by, install, input };
}

describe("setting up the Sales forecast Pack", () => {
  it("makes the figures of each salesperson and the team's, and shows each person what the plan said", async () => {
    const t = await setUp();
    const plan = await planPackSetup(t.by, t.install, t.input);
    expect(plan.problems).toEqual([]);
    expect(plan.makes.metrics).toHaveLength(4 * 2 + 8);
    expect(plan.makes.workflows).toEqual(["Weekly sales forecast"]);
    // The sales lead ticks every Share proposed for them.
    const shares = plan.shares.map((s) => s.id);
    const said = (await planPackSetup(t.by, t.install, { ...t.input, shares })).sees;
    const made = await setUpFromPack(t.by, t.install, { ...t.input, shares });
    expect(made.metrics).toHaveLength(16);
    expect(made.tagsLeftOut).toEqual([]);
    // The dashboard with every widget, the last of them each salesperson's commit; the sales lead approves and gets
    // the Snapshot.
    const { data: widgets } = await db().from("widgets").select("template, metric_ids").eq("dashboard_id", made.dashboardId!).order("id");
    expect(widgets).toHaveLength(JSON.parse(startingPack("sales-forecast.pack.json")).contents.dashboards[0].template.widgets.length);
    expect(widgets!.find((x) => x.template === "progress")!.metric_ids).toHaveLength(2);
    const { workflows } = await workflowsView(t.by);
    const steps = (workflows.find((x) => x.id === made.workflowId)!.config as WorkflowConfig).steps;
    expect(steps.flatMap((s) => (s.type === "approve" ? [s.approvers] : []))).toEqual([[t.lena]]);
    expect(steps.flatMap((s) => (s.type === "send_snapshot" ? [[s.dashboardId, s.people]] : []))).toEqual([[made.dashboardId, [t.lena]]]);

    const read = await allSeriesFor(t.by);
    const metric = (name: string) => read.metrics.find((m) => m.name === name)!;
    expect(metric("Team commit").total).toMatchObject({ targets: "parts", open: false });
    expect(metric("Team commit").calculation_note).toMatch(/added up/);
    const week = periodStart(new Date(), "week", 1);
    for (const [name, commit, quota] of [["Anna", 300, 400], ["Ben", 100, 200]] as const) {
      for (const [what, value] of [["Commit", commit], ["Best case", commit + 50], ["Closed this quarter", 40], ["Pipeline value", 500]] as const) await t.w.value(metric(`${what}, ${name}`).id, week, value);
      await saveSeriesRows(t.by, metric(`Commit, ${name}`).id, "target", [{ period: week, value: quota }], "");
    }
    // Everyone sees the Metrics the plan said, no more and no fewer.
    const all = await getMetrics(t.w.id);
    expect(said.map((p) => p.id).sort()).toEqual([t.sara, t.lena, t.anna, t.ben].sort());
    for (const p of said) {
      const visible = await visibleMetricIds(t.w.id, p.id, all);
      expect(all.filter((m) => visible.has(m.id)).map((m) => m.name).sort(), p.name).toEqual(p.metrics.map((m) => m.name).sort());
    }
    // What a canvas sends each person: only the series of Metrics they see, each Total worked out for them.
    const of = async (person: string, name: string) => {
      const sent = await canvasSeries(t.w.actor(person, "member"), all.map((m) => m.id));
      return sent.series[metric(name).slug]?.find((p) => p.period === week)?.value;
    };
    expect([await of(t.lena, "Team commit"), await of(t.lena, "Quota"), await of(t.lena, "Commit gap to quota")]).toEqual([400, 600, -200]);
    // A salesperson sees their own figures and none of a colleague's or the team's.
    expect([await of(t.anna, "Commit, Anna"), await of(t.anna, "Closed this quarter, Anna"), await of(t.anna, "Commit, Ben"), await of(t.anna, "Team commit"), await of(t.anna, "Quota")]).toEqual([300, 40, undefined, undefined, undefined]);
  });
});
