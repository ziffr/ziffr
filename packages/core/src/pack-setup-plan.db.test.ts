// Planning a Set up against the real database (spec 0058, #1179; GLOSSARY: Pack, Position, Repeat, Share): who may
// fill each Position, what would be made, who would see what (the same as after making it by hand), the proposed
// Shares, the messages, and that nothing is written and nobody but an Owner or Admin gets a plan.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { Forbidden } from "./actor";
import { installPackFile } from "./packs";
import { planPackSetup } from "./pack-setup-plan";
import type { PackSetupInput } from "./pack-setup-build";
import { writeFormula } from "./pack-setup";
import { visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { createMetric, addSubmitters } from "./metrics";
import { createDashboardFromTemplate } from "./dashboard-templates";
import { share } from "./sharing";
import { salesTeamText } from "./test/sales-team-pack";
import { salesTeam } from "./test/sales-team-people";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const count = async (table: string, ws: string) => (await db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0;

async function setUpTeam() {
  const t = await salesTeam(cleanups);
  const install = await installPackFile(t.w.actor(t.sara), salesTeamText(), { unsigned: true, assistantTexts: true });
  return { ...t, install };
}

describe("planning a Set up with Positions and Repeats", () => {
  it("says what is made, who sees what, which Shares are proposed and who is asked, and writes nothing", async () => {
    const t = await setUpTeam();
    const plan = await planPackSetup(t.w.actor(t.sara), t.install, t.input);
    expect(plan.problems).toEqual([]);
    expect(plan.makes).toEqual({
      metrics: ["Team quota", "Commit, Anna", "Gap, Anna", "Commit, Ben", "Gap, Ben"],
      dashboards: ["Team forecast", "My forecast, Anna", "My forecast, Ben"],
      workflows: ["Weekly forecast"],
    });
    const sees = new Map(plan.sees.map((p) => [p.id, p.metrics.map((m) => m.name)]));
    // A salesperson sees their own line and nothing of a colleague's.
    expect(sees.get(t.anna)).toEqual(["Commit, Anna"]);
    expect(sees.get(t.ben)).toEqual(["Commit, Ben"]);
    expect(sees.get(t.lena)).toEqual(["Team quota"]);
    expect(sees.get(t.omar)).toEqual([]);
    expect(plan.sees.find((p) => p.id === t.anna)!.metrics[0].why).toEqual(["submits it"]);
    const proposed = (person: string, item: string) => plan.shares.find((s) => s.person === t.name(person) && s.item === item);
    expect(proposed(t.anna, "My forecast, Anna")).toMatchObject({ role: "viewer", showsMore: false, suggested: true });
    expect(proposed(t.anna, "Gap, Anna")).toMatchObject({ showsMore: true, suggested: false });
    expect(proposed(t.lena, "Commit, Ben")).toMatchObject({ showsMore: true, suggested: false });
    expect(proposed(t.anna, "My forecast, Ben")).toBeUndefined();
    expect(proposed(t.omar, "Team forecast")).toMatchObject({ showsMore: true, suggested: false });
    expect(plan.messages.now).toEqual([]);
    expect(plan.messages.nextRun.map((m) => m.count)).toEqual([1, 1, 1]);
    expect(plan.messages.unasked).toEqual([]);
    expect((await planPackSetup(t.w.actor(t.sara), t.install, { ...t.input, askNow: true })).messages.now).toHaveLength(3);
    for (const table of ["metrics", "workflows", "dashboards", "shares", "deliveries"]) expect(await count(table, t.w.id)).toBe(0);
  });

  it("lists for every person what they see after the same things are made by hand", async () => {
    const t = await setUpTeam();
    const first = await planPackSetup(t.w.actor(t.sara), t.install, t.input);
    // Lena may see every line and the team's dashboard; Omar only the dashboard.
    const ticked = first.shares.filter((s) => s.suggested || s.person === t.name(t.lena) || s.item === "Team forecast").map((s) => s.id);
    const plan = await planPackSetup(t.w.actor(t.sara), t.install, { ...t.input, shares: ticked });
    const by = t.w.actor(t.sara);
    const { data: entries } = await db().from("catalog_metrics").select("id, pack_key").eq("pack_install_id", t.install);
    const made = new Map<string, { id: number; slug: string }>();
    const metric = async (name: string, over: Record<string, unknown> = {}) => made.set(name, await createMetric(by, { name, period: "week", aggregation: "last", ...over }));
    await metric("Team quota");
    await addSubmitters(by, made.get("Team quota")!.id, [t.lena]);
    for (const [line, person] of [["Anna", t.anna], ["Ben", t.ben]]) {
      await metric(`Commit, ${line}`, { fromCatalogId: entries!.find((e) => e.pack_key === "commit")!.id });
      await addSubmitters(by, made.get(`Commit, ${line}`)!.id, [person]);
      await metric(`Gap, ${line}`, { aggregation: "none" });
      await writeFormula(by, { id: made.get(`Gap, ${line}`)!.id, name: `Gap, ${line}` }, `{${made.get(`Commit, ${line}`)!.slug}} - {${made.get("Team quota")!.slug}}`);
    }
    const { data: templates } = await db().from("team_templates").select("id, pack_key").eq("pack_install_id", t.install).eq("kind", "dashboard");
    const tpl = new Map(templates!.map((x) => [x.pack_key as string, Number(x.id)]));
    const id = (name: string) => made.get(name)!.id;
    const boards = new Map([
      ["Team forecast", await createDashboardFromTemplate(by, { template: tpl.get("team")!, name: "Team forecast", fills: [[id("Commit, Anna"), id("Commit, Ben")], [id("Team quota")]] })],
      ["My forecast, Anna", await createDashboardFromTemplate(by, { template: tpl.get("mine")!, name: "My forecast, Anna", fills: [[id("Commit, Anna")]] })],
      ["My forecast, Ben", await createDashboardFromTemplate(by, { template: tpl.get("mine")!, name: "My forecast, Ben", fills: [[id("Commit, Ben")]] })],
    ]);
    const person = new Map(plan.people.map((p) => [p.name, p.id]));
    for (const s of plan.shares.filter((x) => ticked.includes(x.id))) await share(by, s.kind === "Metric" ? "metric" : "dashboard", s.kind === "Metric" ? id(s.item) : boards.get(s.item)!, person.get(s.person)!, s.role);
    const metrics = await getMetrics(t.w.id);
    for (const p of plan.sees) {
      const visible = await visibleMetricIds(t.w.id, p.id, metrics);
      expect([p.name, metrics.filter((m) => visible.has(m.id)).map((m) => m.name).sort()]).toEqual([p.name, p.metrics.map((m) => m.name).sort()]);
    }
    // Still only their own line for the salespeople.
    expect(plan.sees.find((p) => p.id === t.anna)!.metrics.map((m) => m.name).sort()).toEqual(["Commit, Anna"]);
  });

  it("says who may not fill a Position and why, and collects it as a problem when picked all the same", async () => {
    const t = await setUpTeam();
    const plan = await planPackSetup(t.w.actor(t.sara), t.install, { ...t.input, people: [{ position: "lead", people: [t.gus] }, { position: "observers", people: [t.cora] }] });
    const lead = plan.positions.find((p) => p.key === "lead")!;
    expect(new Map(lead.refused.map((r) => [r.id, r.why])).get(t.gus)).toBe("A Guest cannot stand in for someone.");
    expect(lead.refused.map((r) => r.id)).toContain(t.cora);
    expect(plan.problems.join(" ")).toMatch(/cannot be Sales lead.*cannot be Observers/s);
  });

  it("holds lines to their names and limits, and refuses an empty Approver", async () => {
    const t = await setUpTeam();
    const plan = (over: Partial<PackSetupInput>) => planPackSetup(t.w.actor(t.sara), t.install, { ...t.input, ...over });
    expect((await plan({ lines: [{ repeat: "rep", name: "Anna" }, { repeat: "rep", name: " anna " }] })).problems.join(" ")).toMatch(/Two lines of Salesperson/);
    expect((await plan({ lines: Array.from({ length: 13 }, (_, i) => ({ repeat: "rep", name: `Rep ${i}` })) })).problems.join(" ")).toMatch(/at most 12 lines/);
    await expect(plan({ lines: [{ repeat: "rep", name: "see https://example.test" }] })).rejects.toThrow(/plain text/);
    await expect(plan({ lines: [{ repeat: "nope", name: "Anna" }] })).rejects.toThrow(/Repeats of this Pack/);
    const empty = await plan({ people: [] });
    expect(empty.problems.join(" ")).toMatch(/Pick Sales lead: the Workflow Weekly forecast is not made/);
    expect(empty.makes.workflows).toEqual([]);
  });

  it("is only for Owners and Admins, never a key, and only names Metrics the actor sees", async () => {
    const t = await setUpTeam();
    for (const [who, role] of [[t.lena, "member"], [t.gus, "guest"]] as const) await expect(planPackSetup(t.w.actor(who, role), t.install, t.input)).rejects.toThrow(Forbidden);
    await expect(planPackSetup({ ...t.w.actor(t.sara), key: {} } as never, t.install, t.input)).rejects.toThrow(Forbidden);
    const secret = await t.w.metric(t.lena, { name: "Lena's own", period: "week" });
    const board = { metrics: [], dashboard: { key: "team", fills: [[secret.id], [secret.id]] } };
    await expect(planPackSetup(t.w.actor(t.sara), t.install, board)).rejects.toThrow(/Metrics you see/);
    const other = await workspace("Other"); cleanups.push(other.cleanup);
    const zoe = await other.person("owner");
    await expect(planPackSetup(other.actor(zoe), t.install, t.input)).rejects.toThrow(Forbidden);
    await expect(planPackSetup(t.w.actor(t.sara), t.install, { ...t.input, people: [{ position: "lead", people: [zoe] }] })).rejects.toThrow(Forbidden);
  });
});
