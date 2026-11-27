// The Sample Data of a Pack's Preview (GLOSSARY: Sample Data, Preview, Pack): every Dashboard Template of Ziffr's own
// Packs is drawn with the Pack's own Metric names, and each of them has numbers.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
