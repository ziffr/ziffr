// Made-up numbers after a Pack's Set up, against the database (spec 0063, #1267; GLOSSARY: Practice Workspace, Import):
// every period from the start of the previous fiscal year gets a value and the current year a Target Series, as imports;
// what is there stays; calculated Metrics compute; and only the person of a Practice Workspace may ask.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { fillSetUpNumbers, offersMadeUpNumbers, type PracticeFillStep } from "./practice-fill";
import { madeUpPeriods } from "./practice-numbers";
import { setUpFromPack } from "./pack-setup";
import { installPackFile } from "./packs";
import { JANUARY } from "./periods";
import { workspaceToday } from "./retention-setting";
import { getMetrics } from "./workspace-data";
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
