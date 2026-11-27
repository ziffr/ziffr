// Made-up numbers after a Pack's Set up, against the database (spec 0063, #1267; GLOSSARY: Practice Workspace, Import):
// every period from the start of the previous fiscal year gets a value and the current year a Target Series, as imports;
// for a Metric someone submits, the period a request asks for and the running one stay empty, while one nobody submits
// reaches that period; what is there stays; calculated Metrics compute; a sales forecast fits together and starts no
// task; and only the person of a Practice Workspace may ask.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allSeriesFor } from "./access";
import { Forbidden } from "./actor";
import { db } from "./db";
import { fillSetUpNumbers, offersMadeUpNumbers, type PracticeFillStep } from "./practice-fill";
import { madeUpPeriods } from "./practice-numbers";
import { setUpFromPack } from "./pack-setup";
import { installPackFile } from "./packs";
import { openRows } from "./sealed-columns";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { workspaceToday } from "./retention-setting";
import { getMetrics } from "./workspace-data";
import { runWorkflows } from "./workflow-engine";
import { workingPeriod } from "./workflow-rules";
import { repoFile } from "./test/repo-file";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 180_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const pack = readFileSync(repoFile("packs/online-shop.pack.json"), "utf8");

/** A Workspace with the online shop's Pack set up in it, calculated Metrics and a dashboard included. */
async function setUp(practice: boolean) {
  const w = await workspace("Shop", { practice }); cleanups.push(w.cleanup);
  const me = await w.person("owner", practice ? { id: w.practiceFor! } : {});
  const install = await installPackFile(w.actor(me), pack, { unsigned: true, assistantTexts: true });
  await setUpFromPack(w.actor(me), install, { metrics: ["aov", "conversion", "return-rate", "sessions"], submitters: [me] });
  return { w, me, install };
}
/** Every step of filling, to the end. */
async function fill(actor: Parameters<typeof fillSetUpNumbers>[0], install: number) {
  const total = { values: 0, targets: 0, steps: 0 };
  for (let after = 0; ; ) {
    const step: PracticeFillStep = await fillSetUpNumbers(actor, install, after);
    total.values += step.values; total.targets += step.targets; total.steps++;
    if (step.done) return { ...total, of: step.of };
    expect(step.next).toBeGreaterThan(after);
    after = step.next;
  }
}
const periodsOf = async (table: "observations" | "series_values", metric: number) => ((await db().from(table).select("period_start").eq("metric_id", metric).order("period_start").limit(2000)).data ?? []).map((r) => r.period_start as string);

describe("made-up numbers after a Set up", () => {
  it("fill every period from the previous fiscal year, with targets to the end of this one, and replace nothing", async () => {
    const { w, me, install } = await setUp(true);
    const actor = w.actor(me);
    const metrics = await getMetrics(w.id);
    const today = await workspaceToday(w.id);
    const own = metrics.find((m) => !m.formula)!;
    const taken = madeUpPeriods(own.period, today, JANUARY).at(-3)!;
    await w.value(own.id, taken, 4321, me);
    const done = await fill(actor, install);
    expect(done.of).toBe(metrics.length);
    expect(done.values).toBeGreaterThan(0);
    for (const m of metrics) {
      const have = await periodsOf("observations", m.id);
      if (m.formula) {
        expect([m.name, have]).toEqual([m.name, []]);
        continue;
      }
      expect([m.name, have]).toEqual([m.name, madeUpPeriods(m.period, today, JANUARY)]);
      if (m.polarity !== "target") {
        const targets = await periodsOf("series_values", m.id);
        expect([m.name, targets]).toEqual([m.name, madeUpPeriods(m.period, today, JANUARY, true)]);
      }
    }
    const rows = (await db().from("observations").select("value, value_sealed, imported, period_start, metric_id, submitter_id").eq("workspace_id", w.id).limit(5000)).data!;
    expect(rows.find((r) => r.metric_id === own.id && r.period_start === taken)).toMatchObject({ imported: false });
    expect(rows.filter((r) => !r.imported)).toHaveLength(1);
    expect(rows.filter((r) => r.imported).every((r) => r.submitter_id === null)).toBe(true);
    expect((await db().from("breakdown_rows").select("id").eq("workspace_id", w.id)).data).toEqual([]);
    // A second run adds nothing.
    expect(await fill(actor, install)).toMatchObject({ values: 0, targets: 0 });
    expect(((await db().from("deliveries").select("mail_state").eq("workspace_id", w.id)).data ?? []).every((d) => d.mail_state === "outbox")).toBe(true);
  });

  it("are offered to nobody else, and nowhere else", async () => {
    const { w, install } = await setUp(true);
    const ann = await w.madeUp("admin");
    expect(await offersMadeUpNumbers(w.actor(ann, "admin"))).toBe(false);
    await expect(fillSetUpNumbers(w.actor(ann, "admin"), install)).rejects.toBeInstanceOf(Forbidden);
    await expect(fillSetUpNumbers({ ...w.actor(w.practiceFor!), key: { id: 1 } as never }, install)).rejects.toBeInstanceOf(Forbidden);
    const plain = await setUp(false);
    await expect(fillSetUpNumbers(plain.w.actor(plain.me), plain.install)).rejects.toBeInstanceOf(Forbidden);
    expect((await db().from("observations").select("id").eq("workspace_id", plain.w.id)).data).toEqual([]);
    // Another Workspace's install is nothing here.
    expect(await fillSetUpNumbers(w.actor(w.practiceFor!), plain.install)).toMatchObject({ done: true, of: 0, values: 0 });
  });
});

/** The sales forecast's Pack set up for two salespeople in a Practice Workspace: they are asked for Commit and Best
 * case, nobody for the two figures a CRM would send. */
async function forecast() {
  const w = await workspace("Forecast", { practice: true }); cleanups.push(w.cleanup);
  const me = await w.person("owner", { id: w.practiceFor! });
  const [anna, ben] = [await w.madeUp("member"), await w.madeUp("member")];
  const actor = w.actor(me);
  const install = await installPackFile(actor, readFileSync(repoFile("packs/sales-forecast.pack.json"), "utf8"), { unsigned: true, assistantTexts: true });
  const line = (name: string, person: string) => ({ repeat: "rep", name, people: [{ position: "seller", people: [person] }] });
  const made = await setUpFromPack(actor, install, {
    metrics: ["commit", "best-case", "closed-quarter", "pipeline", "team-commit", "team-best-case", "team-closed", "team-pipeline", "quota", "commit-gap", "commit-share", "coverage"],
    workflow: { key: "weekly-forecast" }, people: [{ position: "sales-lead", people: [me] }], lines: [line("Anna", anna), line("Ben", ben)],
  });
  /** How many tasks and questions, messages and requests there are. */
  const asking = () => Promise.all(["actions", "deliveries", "prompts"].map(async (table) => (await db().from(table).select("id").eq("workspace_id", w.id)).data!.length));
  const idOf = async (name: string) => (await getMetrics(w.id)).find((m) => m.name === name)!.id;
  return { w, me, anna, ben, actor, install, made, asking, idOf };
}
const statesOf = async (metric: number) => (await db().from("period_states").select("period_start, state").eq("metric_id", metric)).data;

describe("a made-up sales forecast and its Workflow", () => {
  it("fits together, fills what nobody is asked for to the last ended week, and starts no task from made-up values", async () => {
    const { w, me, anna, ben, actor, install, made, asking, idOf } = await forecast();
    // The targets someone sets next are each salesperson's quota.
    expect(made.targetsToSet.map((m) => m.name).sort()).toEqual(["Commit, Anna", "Commit, Ben"]);
    const before = await asking();
    await fill(actor, install);
    // Filling asks nobody and gives nobody anything to do.
    expect(await asking()).toEqual(before);
    const read = await allSeriesFor(actor);
    const metric = (name: string) => read.metrics.find((m) => m.name === name)!;
    const series = (name: string) => new Map(read.series[metric(name).slug]!.map((p) => [p.period, p.value]));
    const today = await workspaceToday(w.id);
    const weeks = madeUpPeriods("week", today, JANUARY);
    const asked = workingPeriod(today, "week", JANUARY);
    const targetsOf = async (name: string) => openRows("series_values", w.id, (await db().from("series_values").select("id, metric_id, kind, period_start, value, value_sealed").eq("metric_id", metric(name).id).eq("kind", "target")).data);
    for (const name of ["Anna", "Ben"]) {
      const [commit, best, closed, pipeline] = ["Commit", "Best case", "Closed this quarter", "Pipeline value"].map((what) => series(`${what}, ${name}`));
      expect([...commit!.keys()].sort()).toEqual(weeks);
      expect([...best!.keys()].sort()).toEqual(weeks);
      expect([...closed!.keys()].sort()).toEqual([...weeks, asked]);
      expect([...pipeline!.keys()].sort()).toEqual([...weeks, asked]);
      // Counted as through the Workflow, which publishes and locks.
      expect(await statesOf(await idOf(`Pipeline value, ${name}`))).toEqual([{ period_start: asked, state: "locked" }]);
      for (const week of weeks) {
        expect([week, closed!.get(week)! <= commit!.get(week)!, commit!.get(week)! <= best!.get(week)!, pipeline!.get(week)! >= best!.get(week)! - closed!.get(week)!]).toEqual([week, true, true, true]);
      }
      const quotas = new Map<string, Set<number>>();
      for (const t of await targetsOf(`Commit, ${name}`)) {
        const quarter = periodStart(String(t.period_start), "quarter", JANUARY);
        quotas.set(quarter, (quotas.get(quarter) ?? new Set()).add(t.value));
      }
      expect(quotas.size).toBeGreaterThanOrEqual(4);
      for (const [quarter, values] of quotas) expect([name, quarter, values.size]).toEqual([name, quarter, 1]);
      expect(await targetsOf(`Best case, ${name}`)).toEqual([]);
    }
    // The day's run asks for the week just ended: nothing made up stands in its way.
    await runWorkflows(w.id, today, me);
    expect(await statesOf(metric("Commit, Anna").id)).toEqual([{ period_start: asked, state: "asked" }]);
    // Nothing made up waits to be approved or checked; late in a week the run may follow up what is still missing.
    expect((await db().from("actions").select("purpose").eq("workspace_id", w.id).in("purpose", ["approval", "self_check"])).data).toEqual([]);
    // Never what was filled.
    expect((await db().from("actions").select("id").eq("metric_id", metric("Closed this quarter, Anna").id)).data).toEqual([]);
    const { data: prompts } = await db().from("prompts").select("submitter_id, period_start").eq("workspace_id", w.id);
    expect(prompts).toEqual(expect.arrayContaining([{ submitter_id: anna, period_start: asked }, { submitter_id: ben, period_start: asked }]));
  });

  it("fills a week a run marked asked where nobody could be asked, closes the follow-up and sends nothing", async () => {
    const { w, me, actor, install, asking, idOf } = await forecast();
    const today = await workspaceToday(w.id);
    const ended = workingPeriod(today, "week", JANUARY);
    // As of a day after the Due Date: the run follows up what is missing, the figures nobody sends included.
    await runWorkflows(w.id, shiftPeriod(shiftPeriod(ended, "week", 1), "day", 5), me);
    const closed = await idOf("Closed this quarter, Anna");
    const open = async () => (await db().from("actions").select("id").eq("metric_id", closed).eq("status", "open")).data!.length;
    expect(await open()).toBe(1);
    const before = await asking();
    await fill(actor, install);
    expect(await asking()).toEqual(before);
    expect(await open()).toBe(0);
    expect(await statesOf(closed)).toEqual([{ period_start: ended, state: "locked" }]);
    // Whoever is asked still is: the week stays open for them.
    expect(await statesOf(await idOf("Commit, Anna"))).toEqual([{ period_start: ended, state: "asked" }]);
    expect(await periodsOf("observations", await idOf("Commit, Anna"))).not.toContain(ended);
  });
});
