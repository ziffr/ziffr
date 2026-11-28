// The Sample Data of a Pack's Preview (GLOSSARY: Sample Data, Preview, Pack): every Dashboard Template of Ziffr's own
// Packs is drawn with the Pack's own Metric names, and each of them has numbers.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRIVATE_SETS } from "./first-steps-screens";
import { checkPack } from "./pack";
import { packSample, type PackSampleEntry } from "./pack-sample";
import { storedItems } from "./packs";
import { sampleDashboard } from "./sample-data";
import { repoFile } from "./test/repo-file";
import { widgetMetricIds } from "./widget-metrics";

const PACKS = readdirSync(repoFile("packs")).filter((f) => f.endsWith(".pack.json")).map((f) => {
  const res = checkPack(readFileSync(repoFile(`packs/${f}`), "utf8"));
  if (!res.ok) throw new Error(`${f} does not pass the checks.`);
  const { pack } = res;
  const stored = storedItems(pack);
  const repeats = new Map((pack.repeats ?? []).map((r) => [r.key, r.name]));
  const entries = stored.catalog.map((e, i): PackSampleEntry => ({
    ...(e as unknown as PackSampleEntry), total: pack.contents.metrics![i]!.total ?? null, repeat: repeats.get(pack.contents.metrics![i]!.per ?? "") ?? null,
  }));
  return { id: pack.id, entries, dashboards: stored.templates.filter((t) => t.kind === "dashboard") };
});

describe("a Pack's Preview", () => {
  it.each(PACKS.filter((p) => p.dashboards.length).map((p) => [p.id, p] as const))("draws %s with its own Metrics, each with numbers", (id, pack) => {
    const sample = packSample(id, pack.entries);
    const own = new Map(sample.data.metrics.map((m) => [m.id, m]));
    for (const t of pack.dashboards) {
      const widgets = sampleDashboard(t as never, "month", sample.fills(t.slots));
      const shown = widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings));
      expect(shown.length).toBeGreaterThan(0);
      for (const metric of shown) {
        const m = own.get(metric);
        expect([id, metric, Boolean(m)]).toEqual([id, metric, true]);
        expect([m!.name, sample.data.series[m!.slug]!.length > 3]).toEqual([m!.name, true]);
      }
    }
  });

  // What one person's week can be, for every period the Preview draws.
  const BELIEVABLE: Record<string, Record<string, [number, number]>> = {
    "ziffr/my-money": { "Money saved": [50, 220], Spending: [250, 700], "Net worth": [15_000, 50_000] },
    "ziffr/health-and-habits": { "Hours of sleep": [5.5, 8.5], Exercise: [100, 300], "Pages read": [50, 180] },
    "ziffr/my-time": { "Focus hours": [8, 25], "Screen time": [1.5, 5] },
  };

  it.each(PRIVATE_SETS.map((s) => s.pack))("draws %s without targets, with numbers one person could have", (id) => {
    const sample = packSample(id, PACKS.find((p) => p.id === id)!.entries);
    expect(sample.data.targets).toEqual({});
    expect(sample.data.metrics.map((m) => m.name).sort()).toEqual(Object.keys(BELIEVABLE[id]!).sort());
    for (const m of sample.data.metrics) {
      const [low, high] = BELIEVABLE[id]![m.name]!;
      expect([m.name, m.target_min, m.target_max]).toEqual([m.name, null, null]);
      expect([m.name, sample.data.series[m.slug]!.filter((p) => p.value < low || p.value > high)]).toEqual([m.name, []]);
    }
  });

  it("still gives a business Pack's Metrics made-up targets", () => {
    const pack = PACKS.find((p) => p.id === "ziffr/sales")!;
    expect(Object.keys(packSample(pack.id, pack.entries).data.targets).length).toBeGreaterThan(0);
  });

  it("shows the sales forecast by its own names, a line for each made-up salesperson, its team figures added up", () => {
    const pack = PACKS.find((p) => p.id === "ziffr/sales-forecast")!;
    const sample = packSample(pack.id, pack.entries);
    const of = (name: string) => sample.data.metrics.find((m) => m.name === name)!;
    const latest = (name: string) => sample.data.series[of(name).slug]!.at(-1)!.value;
    const lines = ["A", "B", "C"].map((l) => `Commit, Salesperson ${l}`);
    expect(latest("Team commit")).toBe(lines.reduce((n, name) => n + latest(name), 0));
    expect(latest("Quota")).toBe(lines.reduce((n, name) => n + sample.data.targets[of(name).id]!.at(-1)!.value, 0));
    expect(latest("Commit gap to quota")).toBe(latest("Team commit") - latest("Quota"));
    expect(latest("Pipeline coverage")).toBeGreaterThan(0);
    expect(sample.data.metrics.map((m) => m.name)).not.toContain("Revenue");
    // The same on every call.
    expect(JSON.stringify(packSample(pack.id, pack.entries).data)).toBe(JSON.stringify(sample.data));
  });
});
