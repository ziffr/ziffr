// Where a Pack's numbers come from, against the real database (spec 0058; GLOSSARY: Comes From, Pack, Position): an
// install keeps the overview for Help and Set up, Set up asks nobody for a number the Pack says comes from elsewhere,
// also no Position holder, unless the person setting up chose to be asked, an export says where each number comes from,
// and an installed Pack's words are offered again.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { installPackFile, listInstalledPacks } from "./packs";
import { packSetupOptions, setUpFromPack, setUpStep } from "./pack-setup";
import { planPackSetup } from "./pack-setup-plan";
import type { PackSetupInput } from "./pack-setup-build";
import { visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { listInstalledGuides, readInstalledGuide } from "./installed-pack-guides";
import { exportPack, type ExportManifest } from "./pack-export";
import { draftPackGuide } from "./pack-export-guide";
import { checkPack, type Pack } from "./pack";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const yes = { unsigned: true, assistantTexts: true };
const metric = (name: string) => ({ format: "ziffr.metric/1" as const, name, period: "week" as const, aggregation: "last" as const, polarity: "higher" as const });
const PACK: Pack = {
  format: "ziffr.pack/2", id: "ziffr/numbers", name: "Numbers", version: "1.0.0", summary: "Three numbers.", author: { name: "Ziffr" }, license: "CC-BY-4.0", ziffr: ">=0.11",
  contents: {
    metrics: [
      { key: "commit", comesFrom: { by: "person" }, metric: metric("Commit") },
      { key: "closed", comesFrom: { by: "system", system: "CRM", note: "The won deals." }, metric: metric("Closed") },
      { key: "quota", comesFrom: { by: "target" }, metric: metric("Quota") },
    ],
  },
};
const asked = async (workspaceId: string) => {
  const [{ data: tokens }, { data: metrics }] = await Promise.all([
    db().from("tokens").select("metric_id").eq("workspace_id", workspaceId),
    db().from("metrics").select("id, from_catalog_id").eq("workspace_id", workspaceId),
  ]);
  const { data: entries } = await db().from("catalog_metrics").select("id, pack_key").eq("workspace_id", workspaceId);
  const keyOf = new Map((metrics ?? []).map((m) => [m.id, entries!.find((e) => e.id === m.from_catalog_id)!.pack_key as string]));
  return (tokens ?? []).map((t) => keyOf.get(t.metric_id)).sort();
};

/** Sites with a manager each, who the Pack has submit their visits and the sales a shop system sends, and a lead who
 * it has submit the quota, which is set as a target, and stand in for the sales. */
const SITE_TEAM: Pack = {
  ...PACK, id: "ziffr/site-team",
  positions: [{ key: "lead", name: "Lead", people: "one" }, { key: "manager", name: "Site manager", people: "one", per: "site" }],
  repeats: [{ key: "site", name: "Site" }],
  contents: {
    metrics: [
      { key: "visits", per: "site", submitters: ["manager"], comesFrom: { by: "person" }, metric: metric("Visits") },
      { key: "sales", per: "site", submitters: ["manager"], standIn: "lead", comesFrom: { by: "system", system: "shop system" }, metric: metric("Sales") },
      { key: "quota", submitters: ["lead"], comesFrom: { by: "target" }, metric: metric("Quota") },
    ],
    dashboards: [{ key: "mine", per: "site", viewers: ["manager"], template: { format: "ziffr.dashboard-template/1", name: "My site", slots: [{ label: "Sales", suggests: "sales" }], widgets: [{ view: "number", slots: [0], x: 0, y: 0, w: 6, h: 4 }] } }],
  },
};
async function siteTeam() {
  const w = await ws();
  const [ann, lena, mona] = [await w.person("owner"), await w.person("member"), await w.person("member")];
  const actor = w.actor(ann);
  const id = await installPackFile(actor, JSON.stringify(SITE_TEAM), yes);
  const input = (lead: string, more: Partial<PackSetupInput> = {}): PackSetupInput => ({
    metrics: ["visits", "sales", "quota"], lineDashboards: [{ key: "mine" }],
    people: [{ position: "lead", people: [lead] }], lines: [{ repeat: "site", name: "Munich", people: [{ position: "manager", people: [mona] }] }], ...more,
  });
  const sees = async (who: string) => { const metrics = await getMetrics(w.id); const v = await visibleMetricIds(w.id, who, metrics); return metrics.filter((m) => v.has(m.id)).map((m) => m.name).sort(); };
  return { w, ann, lena, mona, actor, id, input, sees };
}

describe("a number that comes from elsewhere, held by a Position", () => {
  it("is asked of no holder, who is proposed as its Viewer and so still sees it, as the plan says", async () => {
    const t = await siteTeam();
    let plan = await planPackSetup(t.actor, t.id, t.input(t.lena));
    expect(plan.problems).toEqual([]);
    expect(plan.askMeAlso).toEqual([]);
    expect(plan.notAsked.join(" ")).toMatch(/is not asked for Quota: the Pack says it is set as a target\./);
    expect(plan.notAsked.join(" ")).toMatch(/is not asked for Sales, Munich: the Pack says another system sends it\./);
    expect(plan.shares.filter((s) => s.keeps).map((s) => [s.item, s.role, s.suggested]).sort()).toEqual([["Quota", "viewer", true], ["Sales, Munich", "viewer", true]]);
    // With those ticked, the manager's dashboard shows no more, and is ticked with them.
    let ticked: string[] = [];
    for (let i = 0; i < 2; i++) {
      ticked = plan.shares.filter((s) => s.suggested).map((s) => s.id);
      plan = await planPackSetup(t.actor, t.id, t.input(t.lena, { shares: ticked }));
    }
    expect(plan.shares.find((s) => s.kind === "dashboard")).toMatchObject({ showsMore: false, suggested: true });
    expect(ticked).toHaveLength(3);
    await setUpFromPack(t.actor, t.id, t.input(t.lena, { shares: ticked }));
    expect(await asked(t.w.id)).toEqual(["visits"]);
    const { data: tokens } = await db().from("tokens").select("stand_in_id").eq("workspace_id", t.w.id);
    expect((tokens ?? []).filter((x) => x.stand_in_id !== null)).toEqual([]);
    expect(await t.sees(t.mona)).toEqual(["Sales, Munich", "Visits, Munich"]);
    expect(await t.sees(t.lena)).toEqual(["Quota"]);
    for (const p of plan.sees.filter((x) => x.id !== t.ann)) expect(p.metrics.map((m) => m.name).sort()).toEqual(await t.sees(p.id));
  });

  it("is not seen by a holder whose proposed Share is left unticked", async () => {
    const t = await siteTeam();
    await setUpFromPack(t.actor, t.id, t.input(t.lena));
    expect(await t.sees(t.mona)).toEqual(["Visits, Munich"]);
    expect(await t.sees(t.lena)).toEqual([]);
  });

  it("is asked of the person setting up only when they choose it, in steps and for a new line too", async () => {
    const t = await siteTeam();
    const plan = await planPackSetup(t.actor, t.id, t.input(t.ann));
    expect(plan.askMeAlso).toEqual(["Quota"]);
    expect(plan.notAsked.join(" ")).toMatch(/You are not asked for Quota/);
    const chosen = t.input(t.ann, { askElsewhere: true });
    expect((await planPackSetup(t.actor, t.id, chosen)).askMeAlso).toEqual(["Quota"]);
    const first = await setUpStep(t.actor, t.id, chosen, null, 1);
    if (first.done) throw new Error("one Metric a step makes several steps");
    let run = first.run;
    for (let done = false; !done;) { const step = await setUpStep(t.actor, t.id, chosen, run, 1); done = step.done; if (!step.done) run = step.run; }
    expect(await asked(t.w.id)).toEqual(["quota", "visits"]);
    const line: PackSetupInput = { metrics: ["visits", "sales"], askElsewhere: true, adding: { ticked: [] }, people: [{ position: "lead", people: [t.ann] }], lines: [{ repeat: "site", name: "Berlin", people: [{ position: "manager", people: [t.lena] }] }] };
    const added = await planPackSetup(t.actor, t.id, line);
    expect(added.notAsked.join(" ")).toMatch(/is not asked for Sales, Berlin/);
    expect(added.shares.filter((s) => s.keeps).map((s) => s.item)).toEqual(["Sales, Berlin"]);
    await setUpFromPack(t.actor, t.id, line);
    expect(await asked(t.w.id)).toEqual(["quota", "visits", "visits"]);
  });
});

describe("where a Pack's numbers come from", () => {
  it("is kept with the install, listed in Help also without a guide, and offered at Set up", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, JSON.stringify(PACK), yes);
    expect((await listInstalledPacks(actor))[0].help).toBe("numbers");
    expect((await listInstalledGuides(actor)).map((g) => g.installId)).toEqual([id]);
    const read = (await readInstalledGuide(actor, id))!;
    expect(read.guide).toBeNull();
    expect(read.overview!.numbers.map((n) => [n.key, n.by, n.system])).toEqual([["commit", "person", undefined], ["closed", "system", "CRM"], ["quota", "target", undefined]]);
    const options = await packSetupOptions(actor, id);
    expect(options.entries.map((e) => e.comesFrom?.by)).toEqual(["person", "system", "target"]);
  });

  it("asks nobody for a number that comes from elsewhere, unless chosen", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, JSON.stringify(PACK), yes);
    await setUpFromPack(actor, id, { metrics: ["commit", "closed", "quota"], submitters: [ann] });
    expect(await asked(w.id)).toEqual(["commit"]);
    const v = await ws(); const bea = await v.person("owner");
    const second = await installPackFile(v.actor(bea), JSON.stringify(PACK), yes);
    await setUpFromPack(v.actor(bea), second, { metrics: ["commit", "closed", "quota"], submitters: [bea], askElsewhere: true });
    expect(await asked(v.id)).toEqual(["closed", "commit", "quota"]);
  });

  it("holds the same when Set up works in steps and when a line is added", async () => {
    const sites: Pack = {
      ...PACK, id: "ziffr/site-numbers", repeats: [{ key: "site", name: "Site" }],
      contents: {
        metrics: [
          { key: "visits", per: "site", comesFrom: { by: "person" }, metric: metric("Visits") },
          { key: "sales", per: "site", comesFrom: { by: "system", system: "shop system" }, metric: metric("Sales") },
        ],
      },
    };
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, JSON.stringify(sites), yes);
    const input = { metrics: ["visits", "sales"], submitters: [ann], lines: [{ repeat: "site", name: "Munich" }] };
    const first = await setUpStep(actor, id, input, null, 1);
    if (first.done) throw new Error("one Metric a step makes two steps");
    expect((await setUpStep(actor, id, input, first.run, 1)).done).toBe(true);
    expect(await asked(w.id)).toEqual(["visits"]);
    await setUpFromPack(actor, id, { ...input, lines: [{ repeat: "site", name: "Berlin" }], adding: { ticked: [] } });
    expect(await asked(w.id)).toEqual(["visits", "visits"]);
    await setUpFromPack(actor, id, { ...input, lines: [{ repeat: "site", name: "Hamburg" }], adding: { ticked: [] }, askElsewhere: true });
    expect(await asked(w.id)).toEqual(["sales", "visits", "visits", "visits"]);
  });

  it("goes into an export as answered, a person where nothing is said, and is refused in words", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const a = await w.metric(ann, { name: "Orders", aggregation: "sum" });
    const b = await w.metric(ann, { name: "Revenue", aggregation: "sum" });
    const manifest: ExportManifest = { id: "northwind/week", name: "Week", version: "1.0.0", summary: "A week.", author: "Northwind", license: "MIT" };
    const choice = { metrics: [a.id, b.id] };
    const made = await exportPack(actor, manifest, choice, { comesFrom: { [`metric:${b.id}`]: { by: "system", system: " shop " } } });
    const res = checkPack(made.text);
    expect(res.ok && res.pack.format).toBe("ziffr.pack/2");
    expect(res.ok && res.pack.contents.metrics!.map((m) => [m.key, m.comesFrom])).toEqual([["orders", { by: "person" }], ["revenue", { by: "system", system: "shop" }]]);
    await expect(exportPack(actor, manifest, choice, { comesFrom: { [`metric:${a.id}`]: { by: "system" } } })).rejects.toThrow("“Orders”: Name the kind of system");
    await expect(exportPack(actor, manifest, choice, { comesFrom: { [`metric:${a.id}`]: { by: "person", note: "See evil.example/x" } } })).rejects.toThrow("“Orders”: The note must be plain text");
    // Without answers (a program that asks nothing) the file says nothing of numbers and stays /1.
    expect(JSON.parse((await exportPack(actor, manifest, choice)).text).format).toBe("ziffr.pack/1");
  });

  it("offers what an installed Pack said of the numbers picked, to the export of its own Workspace only", async () => {
    const w = await ws(); const ann = await w.person("owner"); const actor = w.actor(ann);
    const id = await installPackFile(actor, JSON.stringify(PACK), yes);
    const made = await setUpFromPack(actor, id, { metrics: ["closed"] });
    const { data: entry } = await db().from("catalog_metrics").select("id").eq("workspace_id", w.id).eq("pack_key", "commit").single();
    const draft = await draftPackGuide(actor, "northwind/week", { metrics: [made.metrics[0].id], catalog: [Number(entry!.id)] });
    expect(draft.numbers).toEqual([
      { ref: `metric:${made.metrics[0].id}`, name: "Closed", said: { by: "system", system: "CRM", note: "The won deals." } },
      { ref: `catalog:${entry!.id}`, name: "Commit", said: { by: "person" } },
    ]);
    const other = await ws(); const eve = await other.person("owner");
    expect((await draftPackGuide(other.actor(eve), "northwind/week", { metrics: [made.metrics[0].id], catalog: [Number(entry!.id)] })).numbers).toEqual([]);
  });
});
