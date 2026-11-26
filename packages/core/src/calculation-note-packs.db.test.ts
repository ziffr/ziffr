// How a Metric is calculated, through Packs against the real database (spec 0060; GLOSSARY: Calculation Note, Pack,
// Metric Catalog): installing keeps the note, a Metric made from the entry gets it, an update replaces and takes it away,
// a note changed nowhere counts as unchanged, and exporting writes it back as ziffr.metric/2.
import { afterEach, describe, expect, it, vi } from "vitest";
import { metricCatalog } from "./page-data";
import { exportPack } from "./pack-export";
import { readPackUpdate, updatePackFile } from "./pack-updates";
import { installPackFile, readPackFile } from "./packs";
import { createMetric, metricEffects, type MetricEffects } from "./metrics";
import { getMetrics } from "./workspace-data";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const quiet: MetricEffects = { ...metricEffects, promptSubmitter: async () => false };
const yes = { unsigned: true, assistantTexts: true };
const NOTE = "Active subscriptions at month end, after discounts. One-off fees are left out.";

const entry = (key: string, name: string, calculationNote?: string) => ({ key, metric: { format: calculationNote ? "ziffr.metric/2" : "ziffr.metric/1", name, period: "month", aggregation: "last", polarity: "higher", ...(calculationNote ? { calculationNote } : {}) } });
const pack = (version: string, metrics: unknown[]) => JSON.stringify({ format: "ziffr.pack/1", id: "acme/notes", name: "Notes", version, summary: "Notes.", author: { name: "Acme" }, license: "MIT", contents: { metrics } });

describe("a Pack with Calculation Notes", () => {
  it("installs, sets a new Metric's note, updates and exports it", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const owner = w.actor(await w.person("owner"));
    const first = pack("1.0.0", [entry("mrr", "MRR", NOTE), entry("seats", "Seats")]);
    const shown = await readPackFile(owner, first);
    expect(shown.ok && shown.preview.items.map((i) => (i.kind === "metric" ? i.calculationNote : null))).toEqual([NOTE, ""]);
    const install = await installPackFile(owner, first, yes);
    const catalog = async () => Object.fromEntries((await metricCatalog(owner)).filter((c) => c.pack_install_id !== null).map((c) => [c.name, c]));
    expect((await catalog()).MRR.calculation_note).toBe(NOTE);
    expect((await catalog()).Seats.calculation_note).toBeNull();

    const made = await createMetric(owner, { name: "MRR", calculationNote: (await catalog()).MRR.calculation_note, fromCatalogId: (await catalog()).MRR.id as number }, quiet);
    expect((await getMetrics(owner.workspaceId)).find((m) => m.id === made.id)!.calculation_note).toBe(NOTE);

    // The same note again is no change here; a new one replaces it and one left out takes it away.
    const next = pack("1.1.0", [entry("mrr", "MRR"), entry("seats", "Seats", "Paid seats at month end.")]);
    const planned = await readPackUpdate(owner, install, next);
    expect(planned.ok && planned.plan.items.map((i) => [i.key, i.change, i.outcome])).toEqual([["mrr", "changed", "replace"], ["seats", "changed", "replace"]]);
    await updatePackFile(owner, install, next, yes);
    expect((await catalog()).MRR.calculation_note).toBeNull();
    expect((await catalog()).Seats.calculation_note).toBe("Paid seats at month end.");

    const ids = [(await catalog()).Seats.id as number];
    const out = await exportPack(owner, { id: "acme/out", name: "Out", version: "1.0.0", summary: "Out.", author: "Acme", license: "MIT" }, { catalog: ids });
    expect(JSON.parse(out.text).contents.metrics[0].metric).toMatchObject({ format: "ziffr.metric/2", calculationNote: "Paid seats at month end." });
  });
});
