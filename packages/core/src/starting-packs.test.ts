// The thirteen starting Packs (spec 0030, #279; five for business functions, one for the weekly sales forecast, #1151): Ziffr's own Packs in packs/, kept in this repository so they work
// offline. Each passes the checks Ziffr runs on any Pack, on this version of Ziffr, and says nothing to an assistant.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluate } from "./formula";
import { checkPack } from "./pack";
import { buildSeries } from "./series";
import { figureModel } from "./slide-figures";
import { canvas, metric } from "./test/fixtures";
import { mapElementWords } from "./slide-element";
import { repoFile } from "./test/repo-file";
import type { Observation } from "./types";

/** Every file in packs/, by name. */
export const STARTING_PACKS = readdirSync(repoFile("packs/")).filter((f) => f.endsWith(".pack.json")).sort();
/** A starting Pack's text. */
export const startingPack = (file: string) => readFileSync(repoFile(`packs/${file}`), "utf8");

describe("the starting Packs", () => {
  it("are the seven the specs name, the five for business functions and the sales forecast", () => {
    expect(STARTING_PACKS).toEqual(["agency.pack.json", "board-meeting.pack.json", "customer-support.pack.json", "finance.pack.json", "fulfilment.pack.json", "online-shop.pack.json", "people.pack.json", "saas-metrics.pack.json", "sales-forecast.pack.json", "sales.pack.json", "sports-club.pack.json", "workspace-usage.pack.json", "ziffr-operations.pack.json"]);
  });

  it.each(STARTING_PACKS)("%s passes every check, is Ziffr's under CC BY 4.0, and aims no text at an assistant", (file) => {
    const res = checkPack(startingPack(file));
    expect(res.ok ? [] : res.problems).toEqual([]);
    if (!res.ok) return;
    expect(res.pack.id).toBe(`ziffr/${file.replace(".pack.json", "")}`);
    expect([res.pack.author.name, res.pack.license]).toEqual(["Ziffr", "CC-BY-4.0"]);
    expect(res.assistantTexts).toEqual([]);
  });

  it("every Metric Catalog entry of every Pack says how it is calculated, in one to three sentences", () => {
    for (const file of STARTING_PACKS) {
      const res = checkPack(startingPack(file));
      if (!res.ok) throw new Error(`${file} does not pass`);
      for (const e of res.pack.contents.metrics ?? []) {
        const note = e.metric.calculationNote ?? "";
        expect(e.metric.format, `${file} ${e.key}`).toBe("ziffr.metric/2");
        expect(note, `${file} ${e.key}`).toMatch(/^\p{Lu}.{20,}\.$/u);
        expect(note.split(/\.(?= \p{Lu})/u).length, `${file} ${e.key}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it("Sales forecast reads the quota from Commit's target, with no value where an input or the quota is missing or a division is by 0", () => {
    const res = checkPack(startingPack("sales-forecast.pack.json"));
    if (!res.ok) throw new Error("does not pass");
    const formula = (key: string) => res.pack.contents.metrics!.find((e) => e.key === key)!.metric.formula!;
    const week = { commit: 400000, "closed-quarter": 200000, pipeline: 900000 };
    const of = (key: string, values: Record<string, number> = week, quota: number | undefined = 500000) => evaluate(formula(key), values, {}, quota === undefined ? {} : { commit: quota });
    expect([of("quota"), of("commit-gap"), of("commit-share"), of("coverage")]).toEqual([500000, -100000, 80, 3]);
    // A week without a quota, or without a Commit to read it by, has no derived value, never one counted from 0.
    for (const key of ["quota", "commit-gap", "commit-share", "coverage"]) {
      expect(evaluate(formula(key), week), key).toBeNull();
      expect(of(key, { "closed-quarter": 200000, pipeline: 900000 }), key).toBeNull();
    }
    expect(of("commit-share", week, 0)).toBeNull();
    // Exactly the quota closed: nothing is missing, so there is no coverage. More than it: below 0, as the description says.
    expect(of("coverage", { ...week, "closed-quarter": 500000 })).toBeNull();
    expect(of("coverage", { ...week, "closed-quarter": 800000 })).toBe(-3);
    // Every figure a person sends is a weekly last value, so a quarter shows the latest call, not a sum of calls. The quota is not one of them.
    const sent = res.pack.contents.metrics!.filter((e) => !e.metric.formula);
    expect(sent.map((e) => [e.key, e.metric.period, e.metric.aggregation])).toEqual(["commit", "best-case", "closed-quarter", "pipeline", "quota-split"].map((k) => [k, "week", "last"]));
  });

  it("Sales forecast's slides show the quota and what follows from it, with nothing but a target on Commit and the week's figures", () => {
    const res = checkPack(startingPack("sales-forecast.pack.json"));
    if (!res.ok) throw new Error("does not pass");
    const metrics = res.pack.contents.metrics!.map(({ key, metric: m }, i) => metric({ id: i + 1, slug: key, name: m.name, period: m.period, aggregation: m.aggregation, unit: m.unit, decimals: m.decimals, formula: m.formula ?? null, target_min: null }));
    const of = (key: string) => metrics.find((m) => m.slug === key)!;
    const week = "2026-11-09";
    const observations = Object.entries({ commit: 400000, "best-case": 450000, "closed-quarter": 200000, pipeline: 900000 }).map(([key, value]) => ({ metric_id: of(key).id, period_start: week, value }) as Observation);
    const targets = { [of("commit").id]: [{ period: week, value: 500000 }] };
    const series = buildSeries(metrics, observations, targets);
    expect(["quota", "commit-gap", "commit-share", "coverage"].map((k) => series[k].map((p) => p.value))).toEqual([[500000], [-100000], [80], [3]]);
    // The four figures of the call slide, each from the Metrics of its Slots.
    const { template } = res.pack.contents.decks![0];
    const data = canvas(metrics, series, { targets });
    const figures = template.slides[1].shapes.flatMap((shape) => {
      if (shape.shape !== "element" || shape.element.kind !== "figure") return [];
      const model = figureModel(shape.element, { data, metrics: shape.slots!.map((slot) => of(template.slots[slot].suggests!)) });
      return model.denied ? [] : [[model.label, model.value, model.note]];
    });
    expect(figures).toEqual([
      ["Commit", "400 k€", ""],
      ["Quota", "500 k€", "100 k€ short"],
      ["Best case", "450 k€", "50 k€ short"],
      ["Pipeline coverage", "3.0×", "of the 300 k€ still to close"],
    ]);
  });

  it("SaaS metrics 2.0 brings a logo, Tags on every entry, both decks and both close Workflows", () => {
    const res = checkPack(startingPack("saas-metrics.pack.json"));
    if (!res.ok) throw new Error("does not pass");
    const c = res.pack.contents;
    expect(res.pack.version).toBe("2.2.0");
    expect(res.pack.logo).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(c.metrics!.every((e) => (e.metric.tags ?? []).length > 0)).toBe(true);
    expect(c.decks!.map((d) => d.key)).toEqual(["monthly-report", "quarterly-board"]);
    expect(c.workflows!.map((d) => d.key)).toEqual(["monthly-close", "quarter-close"]);
    expect(c.themes![0].theme.slides?.logo).toBe("pack");
  });

  it.each(["saas-metrics", "sales-forecast"])("%s decks use Placeholders only where the slide has a widget, and Show by only on Metrics that combine", (id) => {
    const res = checkPack(startingPack(`${id}.pack.json`));
    if (!res.ok) throw new Error("does not pass");
    const entries = new Map(res.pack.contents.metrics!.map((e) => [e.key, e.metric]));
    for (const { key, template } of res.pack.contents.decks!) {
      template.slides.forEach((slide, i) => {
        const words = slide.shapes.flatMap((sh) => ("text" in sh && sh.text ? sh.text : []));
        // A slide's Placeholders are filled from the Metrics of its own widgets: with none, they would stay visible.
        if (words.some((t) => t.includes("{"))) expect(slide.shapes.some((sh) => sh.shape === "widget"), `${key} slide ${i + 1}`).toBe(true);
        for (const sh of slide.shapes) {
          // A Slide Element's Placeholders are filled from its own Slots; only the page number needs none.
          if (sh.shape === "element") mapElementWords(sh.element, (text) => { if (/\{(?!slide\})/.test(text)) expect(sh.slots?.length ?? 0, `${key} slide ${i + 1}: ${text}`).toBeGreaterThan(0); return text; });
          if (sh.shape !== "widget" || !sh.settings?.display) continue;
          const m = entries.get(template.slots[sh.slots[0]].suggests!)!;
          expect(Boolean(m.formula) || m.aggregation !== "none", `${key} slide ${i + 1} shows by ${sh.settings.display}`).toBe(true);
        }
      });
    }
  });
});
