// Setting up from a Pack with Positions against the real database (spec 0058, #1180; GLOSSARY: Pack, Position, Repeat,
// Submitter, Stand-in, Approver, Share, Prompt): every place filled by the right person, no Share without its tick, no
// request to others unless asked, everyone seeing what the plan said, the record of the Set up and what takes it away,
// and nothing made when anything is refused.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { Forbidden } from "./actor";
import { installPackFile } from "./packs";
import { uninstallPack } from "./pack-updates";
import { setUpFromPack } from "./pack-setup";
import { planPackSetup } from "./pack-setup-plan";
import { removeMember } from "./handover";
import { removeContact } from "./team";
import { visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { runWorkflows } from "./workflow-engine";
import { workingPeriod } from "./workflow-rules";
import { localTime } from "./workspace-clock";
import { JANUARY } from "./periods";
import { openRows } from "./sealed-columns";
import { openWorkflowRow } from "./workflow-rows";
import { SALES_TEAM, salesTeamText } from "./test/sales-team-pack";
import { salesTeam } from "./test/sales-team-people";
import type { WorkflowConfig, WorkflowStep } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const count = async (table: string, ws: string) => (await db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0;
const ok = { unsigned: true, assistantTexts: true };

async function team() {
  const t = await salesTeam(cleanups);
  const install = await installPackFile(t.w.actor(t.sara), salesTeamText(), ok);
  return { ...t, install };
}
type Team = Awaited<ReturnType<typeof team>>;

const metricByName = async (ws: string) => new Map((await getMetrics(ws)).map((m) => [m.name, m]));
const tokensOf = async (metricId: number) => ((await db().from("tokens").select("submitter_id, stand_in_id").eq("metric_id", metricId)).data ?? []);
const askedFor = async (t: Team) => {
  const ids = (await getMetrics(t.w.id)).map((m) => m.id);
  return ((await db().from("prompts").select("submitter_id").in("metric_id", ids)).data ?? []).map((p) => p.submitter_id as string).sort();
};
const every = async (t: Team) => (await planPackSetup(t.w.actor(t.sara), t.install, t.input)).shares.map((s) => s.id);

describe("setting up with Positions", () => {
  it("writes each person into the ordinary places, makes only the ticked Shares, and keeps a record", async () => {
    const t = await team();
    const shares = await every(t);
    const planned = await planPackSetup(t.w.actor(t.sara), t.install, { ...t.input, shares });
    const made = await setUpFromPack(t.w.actor(t.sara), t.install, { ...t.input, shares });
    expect(made.metrics.map((m) => [m.name, m.line])).toEqual([["Team quota", null], ["Commit, Anna", "Anna"], ["Gap, Anna", "Anna"], ["Commit, Ben", "Ben"], ["Gap, Ben", "Ben"]]);
    expect(made.shares).toBe(shares.length);
    expect(await count("shares", t.w.id)).toBe(shares.length);

    // Submitters and Stand-ins.
    const by = await metricByName(t.w.id);
    expect(await tokensOf(by.get("Commit, Anna")!.id)).toEqual([{ submitter_id: t.anna, stand_in_id: t.lena }]);
    expect(await tokensOf(by.get("Commit, Ben")!.id)).toEqual([{ submitter_id: t.ben, stand_in_id: t.lena }]);
    expect(await tokensOf(by.get("Team quota")!.id)).toEqual([{ submitter_id: t.lena, stand_in_id: null }]);
    expect(await tokensOf(by.get("Gap, Anna")!.id)).toEqual([]);
    expect(by.get("Gap, Ben")!.formula).toBe(`{${by.get("Commit, Ben")!.slug}} - {${by.get("Team quota")!.slug}}`);

    // The Workflow: Approver, information, Task, Tell and Send Snapshot.
    const flow = await openWorkflowRow(t.w.id, (await db().from("workflows").select("id, config, owner_id").eq("id", made.workflowId!).single()).data);
    expect(flow!.owner_id).toBe(t.sara);
    const steps = (flow!.config as WorkflowConfig).steps;
    const step = <T extends WorkflowStep["type"]>(type: T) => steps.filter((s): s is Extract<WorkflowStep, { type: T }> => s.type === type);
    expect(step("approve")[0].approvers).toEqual([t.lena]);
    const [info, tick] = step("checklist");
    expect(info).toMatchObject({ kind: "info", people: [t.anna, t.ben] });
    expect(tick).toMatchObject({ kind: "tick", assignee: t.lena });
    expect(step("tell")[0]).toMatchObject({ condition: { kind: "share_of_target", share: "90" }, people: [t.lena] });
    const board = made.dashboards.find((d) => d.name === "Team forecast")!;
    expect(step("send_snapshot")[0]).toMatchObject({ dashboardId: board.id, people: [t.omar] });
    expect(((await metricByName(t.w.id)).get("Commit, Anna") as { workflow_id?: number }).workflow_id).toBe(made.workflowId);

    // Everyone sees what the plan said, and a salesperson only their line.
    const metrics = await getMetrics(t.w.id);
    for (const p of planned.sees) {
      const visible = await visibleMetricIds(t.w.id, p.id, metrics);
      expect([p.name, metrics.filter((m) => visible.has(m.id)).map((m) => m.name).sort()]).toEqual([p.name, p.metrics.map((m) => m.name).sort()]);
    }
    const annas = await visibleMetricIds(t.w.id, t.anna, metrics);
    expect(metrics.filter((m) => annas.has(m.id)).map((m) => m.name).sort()).toEqual(["Commit, Anna", "Gap, Anna"]);

    // The record: who, which lines (sealed) and what was made.
    const { data: record } = await db().from("pack_setups").select("id, install_id, pack_version, made_by").eq("workspace_id", t.w.id).single();
    expect(record).toMatchObject({ install_id: t.install, pack_version: "1.0.0", made_by: t.sara });
    const { data: lines } = await db().from("pack_setup_lines").select("id, name, repeat_key").eq("setup_id", record!.id).order("id");
    expect((await openRows("pack_setup_lines", t.w.id, lines)).map((l) => l.name)).toEqual(["Anna", "Ben"]);
    expect(await count("pack_setup_people", t.w.id)).toBe(4);
    expect(await count("pack_setup_items", t.w.id)).toBe(9);

    // Audited with counts, never who.
    const { data: events } = await db().from("audit_events").select("kind, details").eq("workspace_id", t.w.id).eq("kind", "pack.set_up");
    expect(events).toHaveLength(1);
  });

  it("makes no Share that is not ticked and asks nobody else unless asked to", async () => {
    const t = await team();
    const made = await setUpFromPack(t.w.actor(t.sara), t.install, { ...t.input, shares: ["made-up"] });
    expect(made).toMatchObject({ shares: 0, messages: 0 });
    expect(await count("shares", t.w.id)).toBe(0);
    expect(await askedFor(t)).toEqual([]);
    expect(await count("deliveries", t.w.id)).toBe(0);
  });

  it("asks the others at once, when that is ticked, for the period that ended last, and the Workflow's run does not ask again", async () => {
    const t = await team();
    const made = await setUpFromPack(t.w.actor(t.sara), t.install, { ...t.input, askNow: true });
    expect(await askedFor(t)).toEqual([t.anna, t.ben, t.lena].sort());
    expect(made.messages).toBe(3);
    const { data: ws } = await db().from("workspaces").select("time_zone").eq("id", t.w.id).single();
    const today = localTime(new Date(), String(ws!.time_zone)).day;
    const week = workingPeriod(today, "week", JANUARY);
    const ids = made.metrics.map((m) => m.id);
    expect([...new Set((await db().from("prompts").select("period_start").in("metric_id", ids)).data!.map((p) => p.period_start))]).toEqual([week]);
    expect((await db().from("period_states").select("state").in("metric_id", ids).eq("period_start", week)).data).toEqual(Array(3).fill({ state: "asked" }));
    // A line that says "due" is the run asking; reminders and Escalations may follow, by the day it is.
    const log = await runWorkflows(t.w.id, today, t.sara, { queue: true });
    expect(log.filter((line) => line.includes(", due "))).toEqual([]);
  });

  it("sends the person setting up nothing either, unless sending was chosen", async () => {
    const t = await team();
    const made = await setUpFromPack(t.w.actor(t.sara), t.install, { ...t.input, people: [{ position: "lead", people: [t.sara] }] });
    expect(await askedFor(t)).toEqual([]);
    expect(await count("deliveries", t.w.id)).toBe(0);
    // Each Metric with a Submitter follows the Workflow made with it, which asks at its next run.
    expect(made).toMatchObject({ messages: 0, later: { nextRun: 3, noWorkflow: [] } });
  });

  it("asks the person setting up at once when sending is chosen", async () => {
    const t = await team();
    const made = await setUpFromPack(t.w.actor(t.sara), t.install, { ...t.input, askNow: true, people: [{ position: "lead", people: [t.sara] }] });
    expect(await askedFor(t)).toEqual([t.anna, t.ben, t.sara].sort());
    expect(made.later).toEqual({ nextRun: 0, noWorkflow: [] });
  });

  it("names what nothing will ask for when no Workflow is made, and which of it the person submits", async () => {
    const t = await team();
    const made = await setUpFromPack(t.w.actor(t.sara), t.install, { ...t.input, workflow: null, people: [{ position: "lead", people: [t.sara] }] });
    expect(await askedFor(t)).toEqual([]);
    expect(made.later.nextRun).toBe(0);
    expect(made.later.noWorkflow.map((m) => [m.name, m.mine])).toEqual([["Team quota", true], ["Commit, Anna", false], ["Commit, Ben", false]]);
  });

  it("leaves an empty Position's places open", async () => {
    const t = await team();
    const made = await setUpFromPack(t.w.actor(t.sara), t.install, { ...t.input, people: [{ position: "lead", people: [t.lena] }], lines: [{ repeat: "rep", name: "Anna" }] });
    const by = await metricByName(t.w.id);
    expect(await tokensOf(by.get("Commit, Anna")!.id)).toEqual([]);
    const flow = await openWorkflowRow(t.w.id, (await db().from("workflows").select("id, config").eq("id", made.workflowId!).single()).data);
    expect((flow!.config as WorkflowConfig).steps.find((s) => s.type === "send_snapshot")).toMatchObject({ people: [] });
  });

  it("makes nothing and keeps no record when anything is refused", async () => {
    const t = await team();
    const by = t.w.actor(t.sara);
    const nothing = async () => { for (const table of ["metrics", "workflows", "dashboards", "shares", "pack_setups"]) expect([table, await count(table, t.w.id)]).toEqual([table, 0]); };
    await expect(setUpFromPack(by, t.install, { ...t.input, people: [] })).rejects.toThrow(/not made while an Approver is empty/);
    await expect(setUpFromPack(by, t.install, { ...t.input, people: [{ position: "lead", people: [t.gus] }] })).rejects.toThrow(/cannot be Sales lead/);
    await expect(setUpFromPack(by, t.install, { ...t.input, people: [{ position: "lead", people: [t.lena] }, { position: "observers", people: [t.cora] }] })).rejects.toThrow(/cannot be Observers/);
    for (const [who, role] of [[t.lena, "member"], [t.gus, "guest"]] as const) await expect(setUpFromPack(t.w.actor(who, role), t.install, t.input)).rejects.toThrow(Forbidden);
    await expect(setUpFromPack({ ...by, key: {} } as never, t.install, t.input)).rejects.toThrow(Forbidden);
    await nothing();
    // The whole set is checked against the Workspace Limit before anything is made.
    await t.w.limit(3);
    await expect(setUpFromPack(by, t.install, t.input)).rejects.toThrow(/3/);
    await nothing();
  });
});

describe("the record of a Set up", () => {
  it("drops a person who is removed, and goes when the Pack is uninstalled, leaving what was made", async () => {
    const t = await team();
    await setUpFromPack(t.w.actor(t.sara), t.install, { ...t.input, lines: [{ repeat: "rep", name: "Anna", people: [{ position: "seller", people: [t.cora] }] }, { repeat: "rep", name: "Ben", people: [{ position: "seller", people: [t.ben] }] }], dashboard: null, lineDashboards: [], workflow: null, metrics: ["commit"], people: [] });
    const recorded = async () => ((await db().from("pack_setup_people").select("person_id").eq("workspace_id", t.w.id)).data ?? []).map((r) => r.person_id as string).sort();
    expect(await recorded()).toEqual([t.ben, t.cora].sort());
    await removeContact(t.w.actor(t.sara), t.cora);
    await removeMember(t.w.actor(t.sara), t.ben, t.lena);
    expect(await recorded()).toEqual([]);
    expect(await count("pack_setups", t.w.id)).toBe(1);
    await uninstallPack(t.w.actor(t.sara), t.install);
    for (const table of ["pack_setups", "pack_setup_lines", "pack_setup_items"]) expect([table, await count(table, t.w.id)]).toEqual([table, 0]);
    expect(await count("metrics", t.w.id)).toBe(2);
  });

  it("is kept for a Pack without Positions too", async () => {
    const t = await team();
    const plain = structuredClone(SALES_TEAM);
    Object.assign(plain, { format: "ziffr.pack/1", id: "ziffr/plain-test", positions: undefined, repeats: undefined });
    plain.contents = { metrics: [{ key: "alone", metric: { ...plain.contents.metrics![1].metric, name: "Alone" } }] };
    const install = await installPackFile(t.w.actor(t.sara), JSON.stringify(plain), ok);
    await setUpFromPack(t.w.actor(t.sara), install, { metrics: ["alone"] });
    expect(await count("pack_setup_items", t.w.id)).toBe(1);
  });
});
