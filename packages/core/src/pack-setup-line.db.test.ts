// Adding a line to what a Pack set up, against the real database (spec 0058, #1182; GLOSSARY: Pack, Repeat, Workflow,
// Widget): only the new line is made, what is there changes only where ticked and where the actor may change it, and
// who then sees the new Metrics is as the plan said.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { installPackFile, listInstalledPacks } from "./packs";
import { setUpFromPack } from "./pack-setup";
import { planPackSetup } from "./pack-setup-plan";
import { packLineStart } from "./pack-setup-adding";
import { visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { share, shareWithGroup } from "./sharing";
import { createGroup } from "./team";
import { salesTeamText } from "./test/sales-team-pack";
import { salesTeam } from "./test/sales-team-people";
import type { PackSetupInput } from "./pack-setup-build";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const count = async (table: string, ws: string) => (await db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0;

/** The team set up with Anna and Ben, Lena seeing the team's dashboard, and a third person to add. */
async function setUp() {
  const t = await salesTeam(cleanups);
  const install = await installPackFile(t.w.actor(t.sara), salesTeamText(), { unsigned: true, assistantTexts: true });
  const made = await setUpFromPack(t.w.actor(t.sara), install, t.input);
  const board = made.dashboards.find((d) => d.name === "Team forecast")!;
  await share(t.w.actor(t.sara), "dashboard", board.id, t.lena, "viewer");
  const cara = await t.w.person("member");
  const line = (ticked: string[] = [], name = "Cara"): PackSetupInput => ({
    metrics: ["commit", "gap"], lineDashboards: [{ key: "mine" }], adding: { ticked },
    people: [{ position: "lead", people: [t.lena] }], lines: [{ repeat: "rep", name, people: [{ position: "seller", people: [cara] }] }],
  });
  return { ...t, install, made, board, cara, line };
}
const widgetIds = async (ws: string, dashboard: number) => ((await db().from("widgets").select("id, metric_ids").eq("workspace_id", ws).eq("dashboard_id", dashboard).order("id")).data ?? []).map((w) => (w.metric_ids as number[]).length);

describe("adding a line", () => {
  it("offers the shared Workflow and the widget of every line, and lists what is left to do by hand", async () => {
    const t = await setUp();
    const by = t.w.actor(t.sara);
    expect((await listInstalledPacks(by))[0].addable).toEqual([{ repeat: "rep", name: "Salesperson" }]);
    expect((await listInstalledPacks(t.w.actor(t.lena, "member")))[0].addable).toEqual([]);
    expect(await packLineStart(by, t.install, "rep")).toMatchObject({ metrics: ["commit", "gap"], dashboard: "mine", workflow: "", lines: ["Anna", "Ben"], people: { lead: [t.lena], observers: [t.omar] } });
    const plan = await planPackSetup(by, t.install, t.line());
    expect(plan.problems).toEqual([]);
    expect(plan.makes).toEqual({ metrics: ["Commit, Cara", "Gap, Cara"], dashboards: ["My forecast, Cara"], workflows: [] });
    expect(plan.offers.map((o) => o.id.split(":")[0])).toEqual(["workflow", "widget"]);
    expect(plan.byHand.join(" ")).toMatch(/also names each Salesperson/);
  });

  it("starts a widget unticked where someone would newly see the new Metrics, and says who", async () => {
    const t = await setUp();
    const by = t.w.actor(t.sara);
    const offers = async () => (await planPackSetup(by, t.install, t.line())).offers;
    const plan = await planPackSetup(by, t.install, t.line());
    expect(plan.offers.map((o) => o.suggested)).toEqual([true, false]);
    expect(plan.offers[1].words).toContain(`${t.name(t.lena)} would newly see it.`);
    expect(plan.sees.find((p) => p.id === t.lena)?.metrics.map((m) => m.name) ?? []).not.toContain("Commit, Cara");
    // Shared with nobody, it shows nobody more.
    await share(by, "dashboard", t.board.id, t.lena, null);
    expect((await offers())[1]).toMatchObject({ suggested: true, words: expect.stringContaining("Nobody it is shared with now sees more by it.") });
    // A Group may be joined later, even one with nobody in it today.
    const group = await createGroup(by, "Leads");
    await shareWithGroup(by, "dashboard", t.board.id, group, "viewer");
    expect((await offers())[1]).toMatchObject({ suggested: false, words: expect.stringContaining("Whoever joins the Group Leads would see it too.") });
  });

  it("makes only the new line and changes what is ticked, and everyone sees what the plan said", async () => {
    const t = await setUp();
    const by = t.w.actor(t.sara);
    const before = { metrics: await count("metrics", t.w.id), workflows: await count("workflows", t.w.id), dashboards: await count("dashboards", t.w.id), widgets: await widgetIds(t.w.id, t.board.id) };
    const ticked = (await planPackSetup(by, t.install, t.line())).offers.map((o) => o.id);
    const plan = await planPackSetup(by, t.install, t.line(ticked));
    const added = await setUpFromPack(by, t.install, t.line(ticked));
    expect(added.metrics.map((m) => m.name)).toEqual(["Commit, Cara", "Gap, Cara"]);
    expect(added.widgets).toBe(1);
    expect([await count("metrics", t.w.id), await count("workflows", t.w.id), await count("dashboards", t.w.id)]).toEqual([before.metrics + 2, before.workflows, before.dashboards + 1]);
    expect(await widgetIds(t.w.id, t.board.id)).toEqual([before.widgets[0] + 1, ...before.widgets.slice(1)]);
    const { data: commit } = await db().from("metrics").select("workflow_id").eq("id", added.metrics[0].id).single();
    expect(commit!.workflow_id).toBe(t.made.workflowId);
    const metrics = await getMetrics(t.w.id);
    const mine = new Set(added.metrics.map((m) => m.id));
    for (const p of plan.sees) {
      const visible = await visibleMetricIds(t.w.id, p.id, metrics);
      expect([p.name, metrics.filter((m) => mine.has(m.id) && visible.has(m.id)).map((m) => m.name).sort()]).toEqual([p.name, p.metrics.map((m) => m.name).filter((n) => n.endsWith("Cara")).sort()]);
    }
    // Cara sees her own line and no colleague's; Lena sees the new commit through the dashboard shared with her.
    const names = async (who: string) => { const v = await visibleMetricIds(t.w.id, who, metrics); return metrics.filter((m) => v.has(m.id)).map((m) => m.name).sort(); };
    expect(await names(t.cara)).toEqual(["Commit, Cara"]);
    expect(await names(t.lena)).toContain("Commit, Cara");
  });

  it("changes nothing that is not ticked, nor what the actor may not change", async () => {
    const t = await setUp();
    const before = await widgetIds(t.w.id, t.board.id);
    const added = await setUpFromPack(t.w.actor(t.sara), t.install, t.line(["widget:999999", "workflow:999999"]));
    expect(added.widgets).toBe(0);
    expect(await widgetIds(t.w.id, t.board.id)).toEqual(before);
    const { data: commit } = await db().from("metrics").select("workflow_id").eq("id", added.metrics[0].id).single();
    expect(commit!.workflow_id).toBeNull();
    // Another Admin owns neither the shared Workflow nor the quota the gap is computed from, and sees no dashboard.
    const ada = await t.w.person("admin");
    const theirs = await planPackSetup(t.w.actor(ada, "admin"), t.install, t.line([], "Dan"));
    expect(theirs.offers).toEqual([]);
    expect(theirs.problems.join(" ")).toMatch(/cannot be added: it is computed from Team quota/);
    expect(theirs.byHand.join(" ")).not.toMatch(/Team forecast/);
  });

  it("refuses a name that is taken, more than one line, and anything for the whole set", async () => {
    const t = await setUp();
    const by = t.w.actor(t.sara);
    await expect(setUpFromPack(by, t.install, t.line([], "anna"))).rejects.toThrow(/called “anna” already/);
    await expect(setUpFromPack(by, t.install, { ...t.line(), lines: [] })).rejects.toThrow(/one line at a time/);
    await expect(setUpFromPack(by, t.install, { ...t.line(), dashboard: { key: "team" } })).rejects.toThrow(/only what is made once/);
    await expect(setUpFromPack(by, t.install, { ...t.line(), metrics: ["quota"] })).rejects.toThrow(/only what is made once/);
    expect(await count("metrics", t.w.id)).toBe(5);
  });
});
