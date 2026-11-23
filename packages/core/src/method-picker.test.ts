// The method picker's registry, its fit to the canvas and the way it runs (GLOSSARY: Method, Recipe; spec 0041, ticket 16): the
// registry is whole (texts, a Takeaway rule for every entry, agreement with the Methods guide and the Calculation Catalogue), a table of
// canvas states against the list shown, a picked Method and its Recipe give the same Takeaway, no entry can skip a rule on hostile
// inputs, and what a browser sends is read with its limits one step either side.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANALYSIS_FORMAT_2, checkAnalysisRecipeValue } from "./analysis-recipe";
import { resolverFrom } from "./compare";
import { ENTRIES, NOT_OFFERED, WANTS, entryOf, textsOf, type EntryId } from "./method-picker";
import { fitList, groupsFor, metricsNeeded, type CanvasFact } from "./method-picker-fit";
import { RUNNERS, readDay, readNumber, readSettings, readSlotIds, recipeFileOf, runEntry, MOST_NUMBER, type PickWorld, type Picked } from "./method-picker-run";
import { afterDateTakeaway } from "./methods/before-after";
import { changePointTakeaway } from "./methods/change-point";
import { changes } from "./basis";
import { bridgeTakeaway } from "./methods/bridge";
import { laggedTakeaway } from "./methods/lagged-correlation";
import { partialTakeaway } from "./methods/partial-correlation";
import { usualRangeTakeaway } from "./methods/quantiles";
import { spearmanTakeaway } from "./methods/spearman";
import { RECIPE_POINTS } from "./recipe-methods";
import { runRecipe2 } from "./recipe-run";
import { APPLIES } from "./suitability";
import { whatMoves, whatNeeds } from "./takeaways/fit-takeaway";
import { whatIfRecipe } from "./takeaways/what-if-takeaway";
import { endsOf, forecastTakeaway } from "./takeaways/forecast";
import type { Takeaway, TakeawayContext } from "./takeaways/takeaway";
import { metric } from "./test/fixtures";
import { repoFile } from "./test/repo-file";
import type { Metric, Point } from "./types";

const ctx: TakeawayContext = { style: "1,234.5" };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const AVOID = /\bseries\b|\bmodel\b|\bgoal\b|variance|outlier|insight|\banswer\b/i;
const UNIT = { unit: "€", unit_position: "after" as const, decimals: 0 };
const month = (i: number) => `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;
const at = (vs: number[]): Point[] => vs.map((value, i) => ({ period: month(i), value }));
// A steady wobble that is the same on every run: no randomness in a test of the numbers.
const wobble = (n: number, k: number) => Array.from({ length: n }, (_, i) => Math.round((100 + ((i * 37 + k * 11) % 23) * 3 + Math.sin(i * k) * 9 + i * 0.5) * 100) / 100);

const N = 36;
const [A, B, C, D] = [
  metric({ id: 1, slug: "revenue", name: "Revenue", ...UNIT, target_min: 150 }),
  metric({ id: 2, slug: "visits", name: "Visits" }),
  metric({ id: 3, slug: "price", name: "Price" }),
  metric({ id: 4, slug: "tickets", name: "Support tickets" }),
];
const SERIES: Record<string, Point[]> = { revenue: at(wobble(N, 3)), visits: at(wobble(N, 5)), price: at(wobble(N, 7)), tickets: at(wobble(N, 11)) };
const world = (over: Partial<PickWorld> = {}, metrics: Metric[] = [A, B, C, D]): PickWorld => ({ metrics, series: SERIES, breakdowns: {}, ctx, yearStart: 1, ...over });
const picked = (slots: Record<string, Metric[]>, settings: Picked["settings"] = {}): Picked => ({ slots, settings });
const resolve = (w: PickWorld) => resolverFrom(w.metrics, w.series);
const words = (t: Takeaway) => [t.sentence, t.refusal, t.strengthText, t.basis, t.method, t.footer, t.range?.text, ...t.assumptions, ...t.cautions, ...t.notes, ...t.numbers.flatMap((n) => [n.label, n.text]), ...t.figures.map((f) => f.text), t.track].filter((x): x is string => typeof x === "string");

describe("the registry is whole", () => {
  it("has each entry once, with its words, in a group, and a Takeaway rule to run it", () => {
    const ids = ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(RUNNERS).sort()).toEqual([...ids].sort());
    for (const e of ENTRIES) {
      const { useWhen, dontUseWhen } = textsOf(e);
      for (const s of [e.name, e.sentence, useWhen]) expect(s.trim().length, `${e.id} has a text`).toBeGreaterThan(10);
      expect(e.technical.trim().length, `${e.id} has a technical name`).toBeGreaterThan(3);
      expect(dontUseWhen.length, `${e.id} says when not to use it`).toBeGreaterThan(0);
      expect(WANTS.map((w) => w.id), e.id).toContain(e.want);
      expect(["forecast", "correlation", null]).toContain(e.widget);
      expect([null, "what-moves", "what-needs", "what-if", "reach-target", "did-it-work"]).toContain(e.recipe);
    }
  });

  it("shows no forbidden word and no word the GLOSSARY says to avoid", () => {
    for (const e of ENTRIES) {
      const { useWhen, dontUseWhen } = textsOf(e);
      const all = [e.name, e.sentence, e.technical, useWhen, ...dontUseWhen, ...e.slots.map((s) => s.question), ...e.settings.flatMap((s) => [s.question, s.hint])];
      for (const s of all) {
        expect(s, `${e.id}: ${s}`).not.toMatch(FORBIDDEN);
        expect(s, `${e.id}: ${s}`).not.toMatch(AVOID);
      }
    }
    for (const w of WANTS) expect(w.question).not.toMatch(FORBIDDEN);
  });

  it("agrees with the Methods guide: the texts are its words, and every Method of the guide is offered or said not to be", async () => {
    const { generate } = (await import(/* @vite-ignore */ repoFile("scripts/method-picker-texts.mjs").href)) as { generate: () => string };
    expect(readFileSync(new URL("./method-picker-texts.json", import.meta.url), "utf8"), "run node scripts/method-picker-texts.mjs").toBe(generate());
    const guide = readFileSync(repoFile("docs/guides/methods.md"), "utf8");
    for (const e of ENTRIES) expect(guide, `${e.id}'s entry`).toContain(`\n## ${e.catalogue}\n`);
    // A section with its Use it when and Don't use it when is a Method: offered by an entry, or one of the few that are not picked.
    const NOT_PICKED = ["Drivers", "Importance", "Predict", "Heads-ups: moving together and stopped moving together", "Heads-ups about one Metric: change of direction, Target out of reach, unusual for the season"];
    const sections = [...guide.matchAll(/^## (.+)\n[\s\S]*?(?=^## |$(?![\s\S]))/gm)].filter((m) => m[0].includes("**Use it when.**")).map((m) => m[1]);
    const offered = new Set(ENTRIES.map((e) => e.catalogue as string));
    expect(sections.filter((s) => !offered.has(s) && !NOT_PICKED.includes(s)), "a Method of the guide the picker neither offers nor excuses").toEqual([]);
    expect([...offered].filter((s) => !sections.includes(s)), "an entry whose guide section has no Use it when").toEqual([]);
  });

  it("covers every Method the suitability checks know, or says why not", () => {
    const checked = new Set(ENTRIES.map((e) => e.checks).filter(Boolean));
    for (const id of Object.keys(APPLIES) as (keyof typeof APPLIES)[]) {
      expect(checked.has(id) || id in NOT_OFFERED, `${id} is neither an entry's checks nor in NOT_OFFERED`).toBe(true);
      expect(checked.has(id) && id in NOT_OFFERED, `${id} is both offered and excused`).toBe(false);
    }
    for (const id of Object.keys(NOT_OFFERED)) expect(Object.keys(APPLIES)).toContain(id);
  });

  it("names, for each entry, a Method module that is in the Calculation Catalogue", () => {
    const MODULE: Record<EntryId, string> = {
      forecast: "src/takeaways/forecast.ts", "reach-target": "src/takeaways/forecast.ts", correlation: "src/correlation.ts", rank: "src/methods/spearman.ts",
      partial: "src/methods/partial-correlation.ts", lag: "src/methods/lagged-correlation.ts", moves: "src/takeaways/fit-takeaway.ts", needs: "src/takeaways/fit-takeaway.ts", "what-if": "src/takeaways/what-if-takeaway.ts",
      "after-date": "src/methods/before-after.ts", "change-point": "src/methods/change-point.ts", bridge: "src/methods/bridge.ts", usual: "src/methods/quantiles.ts",
      "top-share": "src/methods/concentration.ts", pareto: "src/methods/concentration.ts",
    };
    const modules: string[] = JSON.parse(readFileSync(new URL("../calculation-modules.json", import.meta.url), "utf8"));
    const catalogue = readFileSync(repoFile("docs/reference/calculations.md"), "utf8");
    expect(Object.keys(MODULE).sort()).toEqual(ENTRIES.map((e) => e.id).sort());
    for (const m of new Set(Object.values(MODULE))) {
      expect(modules, m).toContain(m);
      expect(catalogue, m).toContain(`\`${m}\``);
    }
  });

  it("finds an entry by an id from a browser only when it is one", () => {
    expect(entryOf("moves")?.id).toBe("moves");
    for (const v of [undefined, null, 1, {}, "", "Moves", "__proto__", "toString"]) expect(entryOf(v)).toBeUndefined();
  });
});

// ---- The table of canvas states against the list shown -----------------------------------------------------------------------

const fact = (over: Partial<CanvasFact> & Pick<CanvasFact, "id" | "name">): CanvasFact => ({ period: "month", aggregation: "sum", periods: 24, hasTarget: false, breakdownLatest: false, breakdownBefore: false, builtFrom: [], ...over });
const [rev, vis, pri, tix] = [fact({ id: 1, name: "Revenue" }), fact({ id: 2, name: "Visits" }), fact({ id: 3, name: "Price" }), fact({ id: 4, name: "Support tickets" })];
const greyed = (canvas: CanvasFact[]) => Object.fromEntries(fitList(canvas).flatMap((f) => (f.ok ? [] : [[f.entry, f.reason]])));
const ALL = ENTRIES.map((e) => e.id);
const EMPTY = "Drop a Metric on the canvas first.";

describe("the list against the canvas, state by state", () => {
  it("empty canvas: every entry greyed, each with the same first step", () => {
    expect(greyed([])).toEqual(Object.fromEntries(ALL.map((id) => [id, EMPTY])));
  });

  it("one Metric with 24 months and no Target Range or Breakdown", () => {
    expect(greyed([rev])).toEqual({
      "reach-target": "Revenue has no Target Range, so there is nothing to reach.",
      correlation: "Needs 2 Metrics on the canvas; there is 1.",
      rank: "Needs 2 Metrics on the canvas; there is 1.",
      partial: "Needs 3 Metrics on the canvas; there is 1.",
      lag: "Needs 2 Metrics on the canvas; there is 1.",
      moves: "Needs 2 Metrics on the canvas; there is 1.",
      needs: "Needs 2 Metrics on the canvas; there is 1.",
      "what-if": "Needs 2 Metrics on the canvas; there is 1.",
      bridge: "Revenue has no Breakdown for its latest period.",
      "top-share": "Revenue has no Breakdown for its latest period.",
      pareto: "Revenue has no Breakdown for its latest period.",
    });
  });

  it("one Metric with a Target Range and Breakdowns for two periods: the Target and the rows entries run", () => {
    const g = greyed([{ ...rev, hasTarget: true, breakdownLatest: true, breakdownBefore: true }]);
    expect(Object.keys(g).sort()).toEqual(["correlation", "lag", "moves", "needs", "partial", "rank", "what-if"]);
  });

  it("a Breakdown for the latest period only: shares run, the bridge says it has nothing to compare with", () => {
    const g = greyed([{ ...rev, breakdownLatest: true }]);
    expect(g.bridge).toBe("Revenue has no Breakdown for the period before its latest, so there is nothing to compare with.");
    expect(g["top-share"]).toBeUndefined();
    expect(g.pareto).toBeUndefined();
  });

  it("two Metrics: the pairs run; three Metrics: the held-the-same Metric runs too", () => {
    const two = greyed([rev, vis]);
    for (const id of ["correlation", "rank", "lag", "moves", "needs", "what-if"]) expect(two[id], id).toBeUndefined();
    expect(two.partial).toBe("Needs 3 Metrics on the canvas; there are 2.");
    expect(greyed([rev, vis, pri]).partial).toBeUndefined();
  });

  it("history one step either side of each Method's minimum", () => {
    const least: Record<string, [number, string]> = { forecast: [4, "forecast"], correlation: [6, "correlation"], rank: [6, "rank"], lag: [12, "lag"], "change-point": [8, "change-point"], usual: [8, "usual"], "after-date": [6, "after-date"] };
    for (const [id, [n]] of Object.entries(least)) {
      const need = id === "lag" ? [rev, vis] : id === "correlation" || id === "rank" ? [rev, vis] : [rev];
      const enough = need.map((m) => ({ ...m, periods: n }));
      const short = need.map((m, i) => ({ ...m, periods: i === 0 ? n - 1 : n }));
      expect(greyed(enough)[id], `${id} at ${n}`).toBeUndefined();
      expect(greyed(short)[id], `${id} at ${n - 1}`).toBe(`Needs at least ${n} months of values; Revenue has ${n - 1}.`);
    }
    // A Metric with 7 months: the forecast and the short ones run, the long ones say how much they need.
    const seven = greyed([{ ...rev, periods: 7 }, { ...vis, periods: 7 }]);
    expect(seven.lag).toBe("Needs at least 12 months of values; Revenue has 7.");
    expect(seven.moves).toBe("Needs at least 12 months of values; Revenue has 7.");
    expect(seven["change-point"]).toBe("Needs at least 8 months of values; Revenue has 7.");
    expect(seven.correlation).toBeUndefined();
  });

  it("a fit takes 8 + 4 for the Metric it weighs; held-the-same Metrics add 4 each", () => {
    expect(greyed([rev, vis]).moves).toBeUndefined();
    expect(greyed([{ ...rev, periods: 11 }, vis]).moves).toBe("Needs at least 12 months of values; Revenue has 11.");
    expect(greyed([{ ...rev, periods: 15 }, vis, pri]).partial).toBe("Needs at least 16 months of values; Revenue has 15.");
    expect(greyed([{ ...rev, periods: 16 }, vis, pri]).partial).toBeUndefined();
    expect(greyed([{ ...rev, periods: 19 }, vis, pri, tix]).partial).toBe("Needs at least 20 months of values; Revenue has 19.");
  });

  it("a Metric with Aggregation none beside another period cannot be compared; alone it can", () => {
    const weekly = { ...vis, period: "week" as const, aggregation: "none" as const, periods: 60 };
    const g = greyed([rev, weekly]);
    for (const id of ["correlation", "rank", "lag"]) expect(g[id], id).toBe("Visits has Aggregation none, so it cannot be compared with Metrics counted at another period.");
    // A fit leaves out a driver it cannot use, and says so: only the Metric to explain stops it.
    expect(g.moves).toBeUndefined();
    expect(g.needs).toBeUndefined();
    expect(greyed([weekly, rev]).moves).toBe("Visits has Aggregation none, so it cannot be compared with Metrics counted at another period.");
    expect(greyed([weekly]).forecast).toBeUndefined();
    // Another period with a way to combine is fine: the longer period sets the comparison's.
    expect(greyed([rev, { ...vis, period: "week" as const, periods: 60 }]).correlation).toBeUndefined();
  });

  it("the period that sets the comparison is the longest one: its history is what counts", () => {
    const g = greyed([{ ...rev, periods: 5 }, { ...vis, period: "week" as const, periods: 200 }]);
    expect(g.correlation).toBe("Needs at least 6 months of values; Revenue has 5.");
    expect(greyed([{ ...rev, period: "quarter" as const, periods: 6 }, { ...vis, periods: 6 }]).correlation).toBeUndefined();
    expect(greyed([{ ...rev, period: "quarter" as const, periods: 5 }, vis]).correlation).toBe("Needs at least 6 quarters of values; Revenue has 5.");
  });

  it("a Metric calculated from another is never compared with it", () => {
    const margin = fact({ id: 9, name: "Margin", builtFrom: [1] });
    const g = greyed([margin, rev]);
    expect(g.correlation).toBe("Margin is calculated from Revenue, so the two are never compared.");
    expect(g.rank).toBeDefined();
    expect(greyed([margin, vis]).correlation).toBeUndefined();
  });

  it("takes at most the Slot's own number of Metrics from the canvas, and names the one with the least history", () => {
    // Eight on the canvas: held-the-same takes 4 at most, so the fit weighs 2 + 4 = 6 Metrics and needs 8 + 4 x 5 = 28 periods.
    const eight = Array.from({ length: 8 }, (_, i) => fact({ id: 20 + i, name: `M${i}`, periods: 27 }));
    expect(greyed(eight).partial).toBe("Needs at least 28 months of values; M0 has 27.");
    expect(greyed(eight.map((m) => ({ ...m, periods: 28 }))).partial).toBeUndefined();
    // The shortest history among the Metrics is the one named, whichever place it has on the canvas.
    const mixed = [{ ...rev, periods: 24 }, { ...vis, periods: 5 }, { ...pri, periods: 9 }];
    expect(greyed(mixed).correlation).toBe("Needs at least 6 months of values; Visits has 5.");
    expect(greyed([{ ...rev, periods: 5 }, { ...vis, periods: 5 }]).correlation).toBe("Needs at least 6 months of values; Revenue has 5.");
  });

  it("the longest period sets a comparison, and a Metric with Aggregation none is a problem only beside another period", () => {
    // Quarterly with 10 periods beside monthly with 3: the comparison is quarterly, and the quarterly history is what counts.
    expect(greyed([{ ...rev, period: "quarter" as const, periods: 10 }, { ...vis, periods: 3 }]).correlation).toBeUndefined();
    // Both monthly, one with Aggregation none: nothing to combine, so nothing stops them.
    expect(greyed([rev, { ...vis, aggregation: "none" as const }]).correlation).toBeUndefined();
    expect(greyed([{ ...rev, aggregation: "none" as const }, vis]).correlation).toBeUndefined();
    // Built from each other only where the formula says so.
    expect(greyed([rev, vis]).correlation).toBeUndefined();
    expect(greyed([fact({ id: 1, name: "Revenue", builtFrom: [7] }), vis]).correlation).toBeUndefined();
  });

  it("says the same thing for an entry that runs as for one that does not, without anything extra", () => {
    expect(fitList([rev, vis]).find((f) => f.entry === "correlation")).toStrictEqual({ entry: "correlation", ok: true });
    for (const g of groupsFor([rev, vis])) for (const e of g.entries) expect(e.fit).toStrictEqual(fitList([rev, vis]).find((f) => f.entry === e.id));
  });

  it("an entry about one Metric runs on whichever canvas Metric fits, and starts on it", () => {
    // Revenue has 3 months, Visits 24 with a Breakdown: the forecast, the usual range and the shares run, on Visits.
    const short = { ...rev, periods: 3 };
    const long = { ...vis, breakdownLatest: true, breakdownBefore: true };
    const g = greyed([short, long]);
    for (const id of ["forecast", "usual", "change-point", "bridge", "top-share", "pareto"]) expect(g[id], id).toBeUndefined();
    const fit = (id: string) => fitList([short, long]).find((f) => f.entry === id)!;
    expect(fit("forecast")).toEqual({ entry: "forecast", ok: true, metric: 2 });
    expect(fit("moves")).toEqual({ entry: "moves", ok: false, reason: "Needs at least 12 months of values; Revenue has 3." });
    // With none that fits, the first Metric's reason.
    expect(greyed([short, { ...vis, periods: 2 }]).forecast).toBe("Needs at least 4 months of values; Revenue has 3.");
  });

  it("a driver calculated from another does not stop a fit; the Metric to explain being calculated from one does", () => {
    const margin = fact({ id: 9, name: "Margin", builtFrom: [2] });
    expect(greyed([rev, margin, vis]).moves).toBeUndefined();
    expect(greyed([margin, vis]).moves).toBe("Margin is calculated from Visits, so the two are never compared.");
  });

  it("groups the entries by what a person wants, every entry once, with how it fits", () => {
    const groups = groupsFor([rev, vis]);
    expect(groups.map((g) => g.want)).toEqual(WANTS.map((w) => w.id));
    expect(groups.flatMap((g) => g.entries.map((e) => e.id)).sort()).toEqual([...ALL].sort());
    for (const g of groups) for (const e of g.entries) expect(e.want).toBe(g.want);
  });

  it("counts the Metrics each entry needs from its Slots", () => {
    expect(Object.fromEntries(ENTRIES.map((e) => [e.id, metricsNeeded(e)]))).toEqual({
      forecast: 1, "reach-target": 1, correlation: 2, rank: 2, partial: 3, lag: 2, moves: 2, needs: 2, "what-if": 2, "after-date": 1, "change-point": 1, bridge: 1, usual: 1, "top-share": 1, pareto: 1,
    });
  });
});

// ---- A picked Method and its Recipe give the same Takeaway ------------------------------------------------------------------------

const same = (a: Takeaway, b: Takeaway) => expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));

describe("a picked Method gives its Recipe's Takeaway", () => {
  const w = world();
  const opts = { yearStart: 1 as const, ctx };
  it("What moves B? and What does B need?: the Recipes' own functions", () => {
    same(runEntry(entryOf("moves")!, w, picked({ metric: [A], drivers: [B, C] })), whatMoves(A, [B, C], resolve(w), opts));
    same(runEntry(entryOf("needs")!, w, picked({ metric: [A], drivers: [B, C] }, { goal: 400 })), whatNeeds(A, [B, C], 400, resolve(w), opts));
  });

  it("What if A changes?: the Recipe's own function, by an amount and by a percent", () => {
    same(runEntry(entryOf("what-if")!, w, picked({ metric: [A], others: [B, C] }, { by: 50 })), whatIfRecipe(A, { by: 50 }, [B, C], resolve(w), opts));
    same(runEntry(entryOf("what-if")!, w, picked({ metric: [A], others: [B, C] }, { percent: 10 })), whatIfRecipe(A, { percent: 10 }, [B, C], resolve(w), opts));
  });

  it("Will we reach the Target? with its usual look ahead, and a set look ahead", () => {
    const pts = SERIES.revenue;
    same(runEntry(entryOf("reach-target")!, w, picked({ metric: [A] })), forecastTakeaway(A, pts, ctx, { ends: endsOf(A) }));
    const ahead = runEntry(entryOf("reach-target")!, w, picked({ metric: [A] }, { ahead: 2 }));
    same(ahead, forecastTakeaway(A, pts, ctx, { ends: endsOf(A), by: "2023-02-01" }));
  });

  it("Where is it heading?, Did it work?, Did something change?", () => {
    same(runEntry(entryOf("forecast")!, w, picked({ metric: [A] })), forecastTakeaway(A, SERIES.revenue, ctx));
    same(runEntry(entryOf("after-date")!, w, picked({ metric: [A], beside: [B] }, { date: "2022-03-01" })), afterDateTakeaway("Revenue", SERIES.revenue, "month", "2022-03-01", A, ctx, { name: "Visits", points: SERIES.visits, unit: B }));
    same(runEntry(entryOf("change-point")!, w, picked({ metric: [A] })), changePointTakeaway("Revenue", SERIES.revenue, "month", A, ctx));
  });

  // The entries a recipe file can say: the file the picker offers, run as an Analysis Recipe, gives the same Takeaway as the entry.
  const FILE_CASES: [EntryId, Record<string, Metric[]>, Metric[]][] = [
    ["rank", { first: [A], second: [B] }, [A, B]],
    ["lag", { first: [A], second: [B] }, [A, B]],
    ["usual", { metric: [A] }, [A]],
    ["partial", { first: [A], second: [B], held: [C] }, [A, B, C]],
    ["moves", { metric: [A], drivers: [B, C] }, [A, B, C]],
  ];
  it.each(FILE_CASES)("the recipe file of %s passes the checks and runs to the same Takeaway", (id, slots, order) => {
    const entry = entryOf(id)!;
    const file = recipeFileOf(entry, slots.held?.length, slots.drivers?.length)!;
    expect(file.format).toBe(ANALYSIS_FORMAT_2);
    const checked = checkAnalysisRecipeValue(JSON.parse(JSON.stringify(file)));
    expect(checked.ok, JSON.stringify(checked)).toBe(true);
    const run = runRecipe2(file, order.map((m) => ({ meta: m, name: m.name, unit: m, period: m.period, points: SERIES[m.slug].slice(-RECIPE_POINTS) })), ctx);
    const takeaway = (run.outputs[0] as { takeaway: Takeaway }).takeaway;
    const direct = runEntry(entry, w, picked(slots));
    expect(takeaway.sentence).toBe(direct.sentence);
    expect(takeaway.strength).toBe(direct.strength);
    expect(takeaway.range).toEqual(direct.range);
    expect(takeaway.numbers).toEqual(direct.numbers);
    expect(takeaway.footer).toBe(direct.footer);
    expect(takeaway.kind).toBe("answer");
  });

  it("makes no recipe file for an entry that is no composition of the library's functions", () => {
    expect(ENTRIES.filter((e) => recipeFileOf(e) === null).map((e) => e.id).sort()).toEqual(["after-date", "bridge", "change-point", "correlation", "forecast", "needs", "pareto", "reach-target", "top-share", "what-if"]);
  });
});

// ---- No entry can skip a rule: hostile inputs ----------------------------------------------------------------------------------

const BREAKDOWNS = (id: number): PickWorld["breakdowns"] => ({ [id]: { [month(34)]: [{ label: "DE", value: 70 }, { label: "AT", value: 20 }, { label: "FR", value: 10 }], [month(35)]: [{ label: "DE", value: 60 }, { label: "AT", value: 25 }, { label: "FR", value: 5 }] } });
const HOSTILE: Record<string, Point[]> = {
  "no values": [],
  "one value": at([5]),
  "all the same": at(Array(30).fill(7)),
  "not numbers": at([1, NaN, 3, Infinity, 5, -Infinity, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
  "huge": at(Array.from({ length: 30 }, (_, i) => 1e300 * (i + 1))),
  "tiny": at(Array.from({ length: 30 }, (_, i) => 1e-300 * (i + 1))),
  "the same period twice": [...at(wobble(20, 3)), { period: month(3), value: 99999 }],
  "unsorted": at(wobble(30, 3)).reverse(),
  "far beyond the work allowance": at(Array.from({ length: 30 }, (_, i) => (i % 2 ? 1e15 + 0.123456789 * i : 1e-9 * i))),
};
const SLOTS: Record<EntryId, (m: Metric[]) => Record<string, Metric[]>> = {
  forecast: ([a]) => ({ metric: [a] }), "reach-target": ([a]) => ({ metric: [a] }), correlation: ([a, b]) => ({ first: [a], second: [b] }), rank: ([a, b]) => ({ first: [a], second: [b] }),
  partial: ([a, b, c]) => ({ first: [a], second: [b], held: [c] }), lag: ([a, b]) => ({ first: [a], second: [b] }), moves: ([a, b, c]) => ({ metric: [a], drivers: [b, c] }), "what-if": ([a, b, c]) => ({ metric: [a], others: [b, c] }), needs: ([a, b, c]) => ({ metric: [a], drivers: [b, c] }),
  "after-date": ([a, b]) => ({ metric: [a], beside: [b] }), "change-point": ([a]) => ({ metric: [a] }), bridge: ([a]) => ({ metric: [a] }), usual: ([a]) => ({ metric: [a] }), "top-share": ([a]) => ({ metric: [a] }), pareto: ([a]) => ({ metric: [a] }),
};
const SETTINGS: Partial<Record<EntryId, Picked["settings"]>> = { "what-if": { percent: 10 }, needs: { goal: 500 }, "after-date": { date: "2022-03-01" }, usual: { value: 100 }, "top-share": { rows: 2 }, "reach-target": { ahead: 3 } };

describe("no entry can give a number the Takeaway layer would not", () => {
  for (const [what, points] of Object.entries(HOSTILE)) {
    it.each(ENTRIES.map((e) => e.id))(`%s on ${what}: a refusal in words or an answer, never a quiet or broken number`, (id) => {
      const metrics = [A, B, C];
      const w = world({ series: { revenue: points, visits: points, price: points }, breakdowns: BREAKDOWNS(1) }, metrics);
      const t = runEntry(entryOf(id)!, w, picked(SLOTS[id](metrics), SETTINGS[id]));
      expect(["answer", "refusal"]).toContain(t.kind);
      // The footer is the one line that says what a Takeaway is not ("not what caused what"): the rule itself writes it.
      for (const text of words(t).filter((x) => x !== t.footer)) {
        expect(text).not.toMatch(FORBIDDEN);
        expect(text).not.toMatch(/NaN|Infinity|undefined|null|\[object/);
      }
      if (t.kind === "refusal") {
        expect(t.refusal && t.refusal.length > 0).toBe(true);
        expect([t.sentence, t.strength, t.range, t.footer]).toEqual([null, null, null, null]);
        expect(t.figures).toEqual([]);
      } else {
        expect(t.sentence && t.sentence.length > 0).toBe(true);
        // Nothing with a caution is called strong.
        if (t.cautions.length > 0) expect(t.strength).not.toBe("strong");
      }
    });
  }

  it("refuses in words, never throws, where a Breakdown or a Target Range is missing", () => {
    const w = world({ breakdowns: {} });
    for (const id of ["bridge", "top-share", "pareto"] as const) {
      const t = runEntry(entryOf(id)!, w, picked({ metric: [A] }, SETTINGS[id]));
      expect(t.kind).toBe("refusal");
      expect(t.refusal).toMatch(/Breakdown/);
    }
    const t = runEntry(entryOf("reach-target")!, w, picked({ metric: [{ ...A, target_min: null, target_max: null }] }));
    expect(t.kind).toBe("refusal");
    expect(t.refusal).toBe("Revenue has no Target Range, so there is nothing to reach.");
  });

  it("works a bridge and the shares from the latest Breakdown, exactly", () => {
    const w2 = world({ breakdowns: BREAKDOWNS(1) });
    const bridge = runEntry(entryOf("bridge")!, w2, picked({ metric: [A] }));
    expect(bridge.kind).toBe("answer");
    expect(bridge.sentence).toMatch(/DE/);
    const top = runEntry(entryOf("top-share")!, w2, picked({ metric: [A] }, { rows: 2 }));
    expect(top.sentence).toMatch(/94\.4/);
    const pareto = runEntry(entryOf("pareto")!, w2, picked({ metric: [A] }));
    expect(pareto.kind).toBe("answer");
  });

  it("puts Metrics of different periods on the longest and says why where one cannot be", () => {
    const weekly = { ...B, period: "week" as const, aggregation: "none" as const };
    const w3 = world({}, [A, weekly]);
    const t = runEntry(entryOf("rank")!, w3, picked({ first: [A], second: [weekly] }));
    expect(t.kind).toBe("refusal");
    expect(t.refusal).toBe("Combined only for Metrics whose Aggregation is sum, average or last value; this one is set to none.");
  });
});

// ---- What a browser sends ----------------------------------------------------------------------------------------------------------

describe("what a browser sends is read with its limits", () => {
  it("reads a number only as digits with a minus, up to 1e15, and nothing else", () => {
    for (const [v, n] of [[0, 0], ["0", 0], ["-12.5", -12.5], [" 7 ", 7], [MOST_NUMBER, MOST_NUMBER], [-MOST_NUMBER, -MOST_NUMBER], ["1000000000000000", 1e15]] as const) expect(readNumber(v), String(v)).toBe(n);
    for (const v of [MOST_NUMBER + 2, -MOST_NUMBER - 2, "1000000000000001", "1e5", "0x10", "1,5", "", " ", "NaN", "Infinity", NaN, Infinity, null, undefined, {}, [], true, "12abc", "1.1234567890123", "--1", "+3"]) expect(readNumber(v), String(v)).toBeNull();
  });

  it("reads a day only when it exists, from 1970 to 2100", () => {
    for (const v of ["1970-01-01", "2024-02-29", "2100-12-31", "2026-03-01"]) expect(readDay(v), v).toBe(v);
    for (const v of ["1969-12-31", "2101-01-01", "2023-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "2026-3-1", "26-03-01", "2026-03-01T00:00", "", null, 20260301, {}]) expect(readDay(v), String(v)).toBeNull();
  });

  it("reads each setting with its range, one step either side", () => {
    const reach = entryOf("reach-target")!;
    const ok = (e: typeof reach, s: unknown) => readSettings(e, s);
    expect(ok(reach, {})).toEqual({ ok: true, settings: {} });
    expect(ok(reach, undefined)).toEqual({ ok: true, settings: {} });
    for (const n of [1, 60, "30"]) expect(ok(reach, { ahead: n }).ok, String(n)).toBe(true);
    for (const n of [0, 61, 1.5, -1, "x", [], "1e1"]) expect(ok(reach, { ahead: n }).ok, String(n)).toBe(false);
    const top = entryOf("top-share")!;
    expect(ok(top, {})).toEqual({ ok: true, settings: { rows: 3 } });
    for (const n of [1, 10]) expect(ok(top, { rows: n })).toEqual({ ok: true, settings: { rows: n } });
    for (const n of [0, 11]) expect(ok(top, { rows: n }).ok).toBe(false);
    const needs = entryOf("needs")!;
    expect(ok(needs, {}).ok).toBe(false);
    expect(ok(needs, { goal: "" }).ok).toBe(false);
    expect(ok(needs, { goal: 0 })).toEqual({ ok: true, settings: { goal: 0 } });
    expect(ok(needs, { goal: MOST_NUMBER + 2 }).ok).toBe(false);
    const after = entryOf("after-date")!;
    expect(ok(after, {}).ok).toBe(false);
    expect(ok(after, { date: "2026-02-30" }).ok).toBe(false);
    expect(ok(after, { date: "2026-02-28" })).toEqual({ ok: true, settings: { date: "2026-02-28" } });
    const ifs = entryOf("what-if")!;
    expect(ok(ifs, { by: 5 })).toEqual({ ok: true, settings: { by: 5 } });
    expect(ok(ifs, { percent: "-5" })).toEqual({ ok: true, settings: { percent: -5 } });
    expect(ok(ifs, {}).ok).toBe(false);
    expect(ok(ifs, { by: 5, percent: 5 }).ok).toBe(false);
    expect(ok(ifs, { by: "" , percent: 3 })).toEqual({ ok: true, settings: { percent: 3 } });
    const usual = entryOf("usual")!;
    expect(ok(usual, {})).toEqual({ ok: true, settings: {} });
    expect(ok(usual, { value: "" })).toEqual({ ok: true, settings: {} });
    expect(ok(usual, { value: "-3.5" })).toEqual({ ok: true, settings: { value: -3.5 } });
    expect(ok(usual, { value: "abc" }).ok).toBe(false);
  });

  it("refuses a setting the Method does not take, and settings that are not an object", () => {
    const usual = entryOf("usual")!;
    expect(readSettings(usual, { value: 1, extra: 2 }).ok).toBe(false);
    expect(readSettings(usual, { __proto__: 1, value: 1 }).ok).toBe(true);
    for (const v of [[], "x", 5, true]) expect(readSettings(usual, v).ok, String(v)).toBe(false);
    expect(readSettings(entryOf("forecast")!, { ahead: 1 }).ok).toBe(false);
    for (const e of ENTRIES) for (const s of e.settings) expect(readSettings(e, { [s.id]: { toString: () => "5" } }).ok, `${e.id}.${s.id}`).toBe(false);
  });

  it("reads the Metrics of each Slot with its count, one step either side", () => {
    const moves = entryOf("moves")!;
    const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 10);
    expect(readSlotIds(moves, { metric: [1], drivers: ids(1) }).ok).toBe(true);
    expect(readSlotIds(moves, { metric: [1], drivers: ids(12) }).ok).toBe(true);
    expect(readSlotIds(moves, { metric: [1], drivers: ids(13) }).ok).toBe(false);
    expect(readSlotIds(moves, { metric: [1], drivers: [] }).ok).toBe(false);
    expect(readSlotIds(moves, { metric: [], drivers: ids(2) }).ok).toBe(false);
    expect(readSlotIds(moves, { metric: [1, 2], drivers: ids(2) }).ok).toBe(false);
    const partial = entryOf("partial")!;
    expect(readSlotIds(partial, { first: [1], second: [2], held: ids(4) }).ok).toBe(true);
    expect(readSlotIds(partial, { first: [1], second: [2], held: ids(5) }).ok).toBe(false);
    const after = entryOf("after-date")!;
    expect(readSlotIds(after, { metric: [1] })).toEqual({ ok: true, ids: { metric: [1], beside: [] } });
    expect(readSlotIds(after, { metric: [1], beside: [2] }).ok).toBe(true);
    expect(readSlotIds(after, { metric: [1], beside: [2, 3] }).ok).toBe(false);
  });

  it("refuses ids that are not whole positive numbers, one that comes twice, a place the Method lacks, and a list that is not one", () => {
    const corr = entryOf("correlation")!;
    for (const bad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2, NaN, "1", null, {}]) expect(readSlotIds(corr, { first: [bad], second: [2] }).ok, String(bad)).toBe(false);
    expect(readSlotIds(corr, { first: [1], second: [1] }).ok).toBe(false);
    expect(readSlotIds(corr, { first: [1], second: [2], third: [3] }).ok).toBe(false);
    expect(readSlotIds(corr, { first: 1, second: [2] }).ok).toBe(false);
    for (const v of [[], "x", 7, true]) expect(readSlotIds(corr, v).ok).toBe(false);
    expect(readSlotIds(corr, { first: [Number.MAX_SAFE_INTEGER], second: [2] }).ok).toBe(true);
  });
});

// ---- Held to the Takeaway functions in the places where a wrong turn would still give a plausible number ------------------------------

describe("the picker hands the Takeaway layer exactly what the Recipes hand it", () => {
  const entry = (id: EntryId) => entryOf(id)!;
  const trending = (k: number) => at(Array.from({ length: 36 }, (_, i) => 100 + i * 5 + ((i * 37 + k * 11) % 7)));

  it("compares two Metrics on their changes where both grow, and on their values where they do not", () => {
    const [x, y] = [trending(1), trending(2)];
    const w = world({ series: { revenue: x, visits: y } });
    const rank = runEntry(entry("rank"), w, picked({ first: [A], second: [B] }));
    expect(rank.basis).toBe(spearmanTakeaway("Revenue", "Visits", changes(x, "month"), changes(y, "month"), "month", "changes", ctx).basis);
    same(rank, spearmanTakeaway("Revenue", "Visits", changes(x, "month"), changes(y, "month"), "month", "changes", ctx));
    same(runEntry(entry("lag"), w, picked({ first: [A], second: [B] })), laggedTakeaway("Revenue", "Visits", changes(x, "month"), changes(y, "month"), "month", "changes", ctx));
    const flat = world();
    same(runEntry(entry("rank"), flat, picked({ first: [A], second: [B] })), spearmanTakeaway("Revenue", "Visits", SERIES.revenue, SERIES.visits, "month", "values", ctx));
    same(runEntry(entry("partial"), flat, picked({ first: [A], second: [B], held: [C, D] })), partialTakeaway({ a: "Revenue", b: "Visits", held: ["Price", "Support tickets"] }, SERIES.revenue, SERIES.visits, [SERIES.price, SERIES.tickets], "month", ctx));
  });

  it("names its Method in the words of the layer when Metrics cannot be put on one period", () => {
    const weekly = { ...B, period: "week" as const, aggregation: "none" as const };
    const w = world({}, [A, weekly, C]);
    const cases: [EntryId, Record<string, Metric[]>, string][] = [["rank", { first: [A], second: [weekly] }, "Spearman's rank correlation"], ["lag", { first: [A], second: [weekly] }, "Lagged correlation"], ["partial", { first: [A], second: [weekly], held: [C] }, "Partial correlation"]];
    for (const [id, slots, name] of cases) {
      const t = runEntry(entry(id), w, picked(slots));
      expect(t.method, id).toBe(name);
      expect(t.kind).toBe("refusal");
    }
  });

  it("cuts a Metric's incomplete last period away when it puts Metrics on a longer period", () => {
    const quarterly = { ...B, period: "quarter" as const };
    const qs: Point[] = Array.from({ length: 12 }, (_, i) => ({ period: `${2020 + Math.floor(i / 4)}-${String((i % 4) * 3 + 1).padStart(2, "0")}-01`, value: 300 + ((i * 37) % 23) * 3 }));
    const full = world({ series: { revenue: SERIES.revenue, visits: qs } }, [A, quarterly]);
    const extra = world({ series: { revenue: [...SERIES.revenue, ...at(Array(40).fill(0)).slice(36, 38).map((p) => ({ period: p.period, value: 90 }))], visits: qs } }, [A, quarterly]);
    for (const id of ["rank", "lag"] as const) {
      const slots = { first: [A], second: [quarterly] };
      same(runEntry(entry(id), extra, picked(slots)), runEntry(entry(id), full, picked(slots)));
    }
  });

  it("hands the start of the Workspace's year to the putting of Metrics on a longer period", () => {
    // Six yearly values dated 1 January: months make calendar years when the year starts in January, and none of the years when it starts in April.
    const yearly = { ...B, period: "year" as const };
    const ys: Point[] = Array.from({ length: 6 }, (_, i) => ({ period: `${2020 + i}-01-01`, value: 300 + ((i * 37) % 23) * 9 }));
    const months72 = Array.from({ length: 72 }, (_, i) => ({ period: month(i), value: 100 + ((i * 37) % 23) * 3 + (i % 12) * 2 }));
    const slots = { first: [A], second: [yearly] };
    for (const id of ["rank", "correlation"] as const) {
      const jan = runEntry(entry(id), world({ series: { revenue: months72, visits: ys }, yearStart: 1 }, [A, yearly]), picked(slots));
      const apr = runEntry(entry(id), world({ series: { revenue: months72, visits: ys }, yearStart: 4 }, [A, yearly]), picked(slots));
      expect([id, jan.kind, apr.kind]).toEqual([id, "answer", "refusal"]);
    }
  });

  it("works a bridge on the rows of the last two periods: a row that appeared or went is a part, and no rows is a refusal in words", () => {
    const rows = (a: [string, number][]) => a.map(([label, value]) => ({ label, value }));
    const was = rows([["DE", 60], ["OLD", 10]]);
    const now = rows([["DE", 70], ["NEW", 5]]);
    const w2 = world({ breakdowns: { 1: { [month(34)]: was, [month(35)]: now } } });
    const direct = bridgeTakeaway("Revenue", [{ label: "DE", before: 60, after: 70 }, { label: "OLD", before: 10, after: null }, { label: "NEW", before: null, after: 5 }], A, ctx, { before: SERIES.revenue[34].value, after: SERIES.revenue[35].value });
    same(runEntry(entry("bridge"), w2, picked({ metric: [A] })), direct);
    const none = (b: PickWorld["breakdowns"], text: RegExp) => { const t = runEntry(entry("bridge"), world({ breakdowns: b }), picked({ metric: [A] })); expect([t.kind, t.refusal]).toEqual(["refusal", expect.stringMatching(text)]); };
    none({ 1: { [month(35)]: now } }, /Revenue needs a Breakdown for its latest period and the one before\./);
    none({ 1: { [month(34)]: was } }, /Revenue needs a Breakdown/);
    none({ 1: { [month(34)]: [], [month(35)]: now } }, /Revenue needs a Breakdown/);
    none({ 1: { [month(34)]: was, [month(35)]: [] } }, /Revenue needs a Breakdown/);
    const short = runEntry(entry("bridge"), world({ series: { revenue: at([5]) }, breakdowns: { 1: { [month(0)]: now } } }), picked({ metric: [A] }));
    expect(short.kind).toBe("refusal");
  });

  it("reads a Target of one end, and refuses in words without one", () => {
    const lower = { ...A, polarity: "lower" as const, target_min: null, target_max: 200 };
    same(runEntry(entry("reach-target"), world({}, [lower]), picked({ metric: [lower] })), forecastTakeaway(lower, SERIES.revenue, ctx, { ends: endsOf(lower) }));
    const higherMaxOnly = { ...A, polarity: "higher" as const, target_min: null, target_max: 200 };
    expect(runEntry(entry("reach-target"), world({}, [higherMaxOnly]), picked({ metric: [higherMaxOnly] })).refusal).toBe("Revenue has no Target Range, so there is nothing to reach.");
  });

  it("asks the usual range about a value, 0 included, only when one is given; sets a Metric beside only when one is", () => {
    const w2 = world();
    const [none, zero, big] = ([{}, { value: 0 }, { value: 1e6 }] as Picked["settings"][]).map((s) => runEntry(entry("usual"), w2, picked({ metric: [A] }, s)));
    same(none, usualRangeTakeaway("Revenue", SERIES.revenue, "month", A, ctx));
    same(zero, usualRangeTakeaway("Revenue", SERIES.revenue, "month", A, ctx, { value: 0 }));
    same(big, usualRangeTakeaway("Revenue", SERIES.revenue, "month", A, ctx, { value: 1e6 }));
    expect(zero.sentence).not.toBe(none.sentence);
    same(runEntry(entry("after-date"), w2, picked({ metric: [A] }, { date: "2022-03-01" })), afterDateTakeaway("Revenue", SERIES.revenue, "month", "2022-03-01", A, ctx, undefined));
  });
});

describe("what is sent is refused in these words", () => {
  const e = (id: EntryId) => entryOf(id)!;
  const bad = (r: { ok: boolean }) => (r as { ok: false; message: string }).message;
  it("numbers, whole numbers and days", () => {
    expect(bad(readSettings(e("needs"), {}))).toBe("Which value should it reach? Give a number.");
    expect(bad(readSettings(e("needs"), { goal: null }))).toBe("Which value should it reach? Give a number.");
    expect(bad(readSettings(e("needs"), { goal: "1e5" }))).toBe("Which value should it reach? Give a number with digits only, no larger than 1,000,000,000,000,000.");
    expect(bad(readSettings(e("top-share"), { rows: 11 }))).toBe("How many of the largest rows? Use a whole number from 1 to 10.");
    expect(bad(readSettings(e("top-share"), { rows: 1.5 }))).toBe("How many of the largest rows? Use a whole number from 1 to 10.");
    expect(readSettings(e("reach-target"), { ahead: null })).toEqual({ ok: true, settings: {} });
    expect(readSettings(e("reach-target"), { ahead: "" })).toEqual({ ok: true, settings: {} });
    expect(bad(readSettings(e("after-date"), {}))).toBe("Which day did it start? Give a day.");
    expect(bad(readSettings(e("after-date"), { date: undefined }))).toBe("Which day did it start? Give a day.");
    expect(bad(readSettings(e("after-date"), { date: "2026-02-30" }))).toBe("Which day did it start? Give a day that exists, written like 2026-03-01.");
    expect(readSettings(e("usual"), { value: null })).toEqual({ ok: true, settings: {} });
    expect(readSettings(e("usual"), null)).toEqual({ ok: true, settings: {} });
    expect(readSettings(e("forecast"), null)).toEqual({ ok: true, settings: {} });
    expect(bad(readSettings(e("usual"), []))).toBe("The settings were not sent in a form Ziffr can read.");
    expect(bad(readSettings(e("usual"), { nope: 1 }))).toBe("A setting was sent that this Method does not take.");
    expect(readDay(["2026-03-01"])).toBeNull();
    expect(readDay({ toString: () => "2026-03-01" })).toBeNull();
  });

  it("exactly one of an amount and a percent", () => {
    const m = "What if A changes? Give exactly one of: Change it by how much? or Or by how many percent?";
    expect(bad(readSettings(e("what-if"), {}))).toBe(m);
    expect(bad(readSettings(e("what-if"), { by: 1, percent: 1 }))).toBe(m);
    expect(readSettings(e("what-if"), { percent: 0 })).toEqual({ ok: true, settings: { percent: 0 } });
  });

  it("Metrics for a place", () => {
    expect(bad(readSlotIds(e("forecast"), { metric: [1, 2] }))).toBe("Which Metric do you want to look ahead for? Choose one Metric.");
    expect(bad(readSlotIds(e("moves"), { metric: [1], drivers: Array.from({ length: 13 }, (_, i) => i + 5) }))).toBe("Which Metrics might move it? Choose up to 12 Metrics.");
    expect(bad(readSlotIds(e("forecast"), null))).toBe("Which Metric do you want to look ahead for? Choose a Metric.");
    expect(bad(readSlotIds(e("forecast"), {}))).toBe("Which Metric do you want to look ahead for? Choose a Metric.");
    expect(bad(readSlotIds(e("partial"), { first: [1], second: [2], held: [] }))).toBe("Which Metrics should be held the same? Choose a Metric.");
    expect(bad(readSlotIds(e("what-if"), { metric: [1], others: [] }))).toBe("Which Metrics might follow it? Choose a Metric.");
    expect(bad(readSlotIds(e("forecast"), []))).toBe("The Metrics were not sent in a form Ziffr can read.");
    expect(bad(readSlotIds(e("forecast"), { metric: [1], x: [2] }))).toBe("A Metric was named for a place this Method does not have.");
    expect(bad(readSlotIds(e("correlation"), { first: [1], second: [1] }))).toBe("A Metric can be chosen once for each Method.");
  });

  it("the recipe file numbers the Slots after the ones before", () => {
    const partial = recipeFileOf(e("partial"), 2)!;
    expect(partial.slots).toHaveLength(4);
    expect(partial.steps[0]).toMatchObject({ controls: ["slot3", "slot4"] });
    const moves = recipeFileOf(e("moves"), 1, 3)!;
    expect(moves.slots).toHaveLength(4);
    expect(moves.steps[0]).toMatchObject({ drivers: ["slot2", "slot3", "slot4"] });
  });
});
