// Running an Analysis Recipe in format /2 (spec 0041, ticket 8; GLOSSARY: Analysis Recipe): each new function gives what the
// Method it names gives (the Methods have their own references and tests; these hold the step to them and to cases worked by
// hand), a Takeaway output is the Method's own Takeaway, and a recipe reaches only the series of its Slots, in words where it
// cannot answer.
import { describe, expect, it } from "vitest";
import { ANALYSIS_FORMAT_2, type AnalysisRecipe2 } from "./analysis-recipe";
import { changes, detrended } from "./basis";
import { fit, importance } from "./methods/fit";
import { laggedCorrelation, laggedTakeaway } from "./methods/lagged-correlation";
import { partialCorrelation, partialTakeaway } from "./methods/partial-correlation";
import { quantile, usualRangeTakeaway } from "./methods/quantiles";
import { spearman, spearmanTakeaway } from "./methods/spearman";
import { runRecipe, runRecipe2, tooWide, MOST_PLACES, MOST_SIZE, WORK_BUDGET, type RunOutput } from "./recipe-run";
import { RECIPE_POINTS, type RecipeInput } from "./recipe-methods";
import { movesTakeaway } from "./takeaways/fit-takeaway";
import type { Takeaway, TakeawayContext } from "./takeaways/takeaway";
import type { Point } from "./types";

const ctx: TakeawayContext = { style: "1,234.5" };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const UNIT = { unit: "€", unit_position: "after" as const, decimals: 0 };
const month = (i: number, from = 2020) => `${from + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;
const at = (vs: number[], from = 2020): Point[] => vs.map((value, i) => ({ period: month(i, from), value }));
// A steady wobble that is the same on every run: no randomness in a test of the numbers.
const wobble = (n: number, k: number) => Array.from({ length: n }, (_, i) => 100 + ((i * 37 + k * 11) % 23) * 3 + Math.sin(i * k) * 9 + i * 0.5);
const input = (name: string, vs: number[], period: RecipeInput["period"] = "month"): RecipeInput => ({ name, unit: UNIT, period, points: at(vs) });
const rec = (steps: AnalysisRecipe2["steps"], outputs: AnalysisRecipe2["outputs"], slots = 3): AnalysisRecipe2 => ({ format: ANALYSIS_FORMAT_2, name: "t", slots: Array.from({ length: slots }, (_, i) => ({ label: `S${i + 1}` })), steps, outputs });
const out = (r: { outputs: RunOutput[] }, step: string) => r.outputs.find((o) => o.step === step)!;
const val = (o: RunOutput) => (o.shows === "value" || o.shows === "series" ? (o.result.kind === "value" ? o.result.value : o.result.points) : null);
// The footer is the one line that says what a Takeaway is not ("not what caused what"), which the rule itself writes.
const takeawayOf = (r: { outputs: RunOutput[] }, step: string) => (r.outputs.find((o) => o.step === step && o.shows === "takeaway") as Extract<RunOutput, { shows: "takeaway" }>).takeaway;
const words = (t: Takeaway) => [t.sentence, t.refusal, t.basis, ...t.assumptions, ...t.cautions, ...t.notes].filter(Boolean).join(" ");

const N = 36;
const [va, vb, vc] = [wobble(N, 3), wobble(N, 5), wobble(N, 7)];
const [a, b, c] = [at(va), at(vb), at(vc)];
const slots = [input("Revenue", va), input("Visits", vb), input("Price", vc)];

describe("the new functions give what their Methods give", () => {
  it("changes and detrended are the Methods' own", () => {
    const r = runRecipe2(rec([{ id: "x", fn: "changes", of: "slot1" }, { id: "y", fn: "detrended", of: "slot2" }], [{ step: "x", label: "x", shows: "series", unit: "metric" }, { step: "y", label: "y", shows: "series", unit: "metric" }]), slots, ctx);
    expect(val(out(r, "x"))).toEqual(changes(a, "month"));
    expect(val(out(r, "y"))).toEqual(detrended(b, "month"));
  });
  it("spearman is worked out by hand: two ranks moved by 3 in eight is 11/14", () => {
    const run = (x: number[], y: number[]) => runRecipe2(rec([{ id: "s", fn: "spearman", of: "slot1", with: "slot2" }], [{ step: "s", label: "s", shows: "value", unit: "number" }], 2), [input("A", x), input("B", y)], ctx);
    // Neither series grows (a shuffle of 1 to 8), so they are compared by value. Swapping the first two values moves two ranks by 3: Σd² = 18, 1 − 6·18 ÷ 504 = 11/14.
    const shuffled = [4, 1, 7, 3, 8, 2, 6, 5];
    expect(val(out(run(shuffled, [1, 4, 7, 3, 8, 2, 6, 5]), "s"))).toBeCloseTo(11 / 14, 14);
    expect(val(out(run(shuffled, shuffled.map((v) => 9 - v)), "s"))).toBe(-1);
    expect(val(out(run(shuffled, shuffled), "s"))).toBe(1);
    // Fewer than six pairs, or a series that does not change: no number, never a made-up one.
    expect(val(out(run([1, 2, 3], [3, 1, 2]), "s"))).toBeNull();
    expect(val(out(run([1, 2, 3, 4, 5, 6, 7, 8], [5, 5, 5, 5, 5, 5, 5, 5]), "s"))).toBeNull();
    expect(val(out(run(va, vb), "s"))).toBe(spearman(a, b)!.rho);
  });
  it("a partial correlation is the Method's, none where it has none", () => {
    const r = runRecipe2(rec([{ id: "p", fn: "partialCorrelation", of: "slot1", with: "slot2", controls: ["slot3"] }], [{ step: "p", label: "p", shows: "value", unit: "number" }]), slots, ctx);
    const direct = partialCorrelation(a, b, [c]);
    expect(direct.ok).toBe(true);
    expect(val(out(r, "p"))).toBe(direct.ok ? direct.r : null);
    const none = runRecipe2(rec([{ id: "p", fn: "partialCorrelation", of: "slot1", with: "slot2", controls: ["slot3"] }], [{ step: "p", label: "p", shows: "value", unit: "number" }]), [input("A", va.slice(0, 4)), input("B", vb.slice(0, 4)), input("C", vc.slice(0, 4))], ctx);
    expect(val(out(none, "p"))).toBeNull();
  });
  it("a lagged correlation gives a row for each delay, and finds a delay of two exactly", () => {
    const lead = wobble(30, 3);
    const follow = [50, 60, ...lead.slice(0, 28)];
    const r = runRecipe2(rec([{ id: "l", fn: "laggedCorrelation", of: "slot1", with: "slot2", maxLag: 4 }], [{ step: "l", label: "l", shows: "table" }], 2), [input("A", lead), input("B", follow)], ctx);
    const rows = (out(r, "l") as Extract<RunOutput, { shows: "table" }>).rows;
    expect(rows.map((x) => x.label)).toEqual(["Same month", "1 month later", "2 months later", "3 months later", "4 months later"]);
    expect(rows[2].value).toBeCloseTo(1, 12);
    expect(Math.max(...rows.map((x) => Math.abs(x.value!)))).toBe(Math.abs(rows[2].value!));
    expect(rows.map((x) => x.value)).toEqual(laggedCorrelation(at(lead), at(follow), "month", 4).lags.map((l) => l.r));
  });
  it("the usual range is worked out by hand: 1 to 11 is 2, 3.5, 6, 8.5, 10 (type 7)", () => {
    const r = runRecipe2(rec([{ id: "u", fn: "usualRange", of: "slot1" }], [{ step: "u", label: "u", shows: "table" }], 1), [input("A", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])], ctx);
    expect((out(r, "u") as Extract<RunOutput, { shows: "table" }>).rows).toEqual([
      { label: "Usual low", value: 2 }, { label: "Lower quartile", value: 3.5 }, { label: "Median", value: 6 }, { label: "Upper quartile", value: 8.5 }, { label: "Usual high", value: 10 },
    ]);
    const none = runRecipe2(rec([{ id: "u", fn: "usualRange", of: "slot1" }], [{ step: "u", label: "u", shows: "table" }], 1), [input("A", [])], ctx);
    expect((out(none, "u") as Extract<RunOutput, { shows: "table" }>).rows).toEqual([]);
  });
  it("a percentile is worked out by hand: of 1 to 5, the 10th is 1.4, the 25th 2, the 50th 3, the 99th 4.96", () => {
    for (const [p, want] of [[1, 1.04], [10, 1.4], [25, 2], [50, 3], [75, 4], [99, 4.96]] as const) {
      const r = runRecipe2(rec([{ id: "q", fn: "quantile", of: "slot1", percent: p }], [{ step: "q", label: "q", shows: "value", unit: "metric" }], 1), [input("A", [1, 2, 3, 4, 5])], ctx);
      expect(val(out(r, "q")), `${p}th`).toBeCloseTo(want, 12);
    }
    const r = runRecipe2(rec([{ id: "q", fn: "quantile", of: "slot1", percent: 30 }], [{ step: "q", label: "q", shows: "value", unit: "metric" }], 1), [input("A", va)], ctx);
    expect(val(out(r, "q"))).toBe(quantile(a, 0.3));
    expect(val(out(runRecipe2(rec([{ id: "q", fn: "quantile", of: "slot1", percent: 30 }], [{ step: "q", label: "q", shows: "value", unit: "metric" }], 1), [input("A", [])], ctx), "q"))).toBeNull();
  });
  it("a fit holds the Method's fit, and its importance gives shares that add up to 1", () => {
    const x1 = wobble(30, 3), x2 = wobble(30, 5);
    const y = x1.map((v, i) => 3 * v + x2[i] + (i % 4) * 0.7);
    const r = runRecipe2(rec([{ id: "m", fn: "fit", of: "slot1", drivers: ["slot2", "slot3"] }, { id: "w", fn: "importance", of: "m" }], [{ step: "w", label: "w", shows: "table" }]), [input("Y", y), input("X1", x1), input("X2", x2)], ctx);
    const direct = fit({ target: { name: "Y", points: at(y) }, drivers: [{ name: "X1", points: at(x1) }, { name: "X2", points: at(x2) }], span: "month" });
    const model = r.steps.m as Extract<typeof r.steps.m, { kind: "model" }>;
    expect(model.fit).toEqual(direct);
    const rows = (out(r, "w") as Extract<RunOutput, { shows: "table" }>).rows;
    expect(rows.map((x) => x.label)).toEqual(["X1", "X2"]);
    expect(rows[0].value! + rows[1].value!).toBeCloseTo(1, 12);
    expect(rows[0].value!).toBeGreaterThan(rows[1].value!);
    const imp = importance(model.input);
    expect(imp.ok && imp.drivers.map((d) => d.share)).toEqual(rows.map((x) => x.value));
    // Too short a history: the fit says why in words; the table has no rows; never a number.
    const short = runRecipe2(rec([{ id: "m", fn: "fit", of: "slot1", drivers: ["slot2"] }, { id: "w", fn: "importance", of: "m" }], [{ step: "w", label: "w", shows: "table" }], 2), [input("Y", y.slice(0, 5)), input("X", x1.slice(0, 5))], ctx);
    expect((out(short, "w") as Extract<RunOutput, { shows: "table" }>).rows).toEqual([]);
    expect((short.steps.m as { fit: { ok: boolean } }).fit.ok).toBe(false);
  });
  it("the functions of /1 give what the same steps give in a /1 recipe", () => {
    const steps = [{ id: "ma", fn: "movingAverage", of: "slot1", window: 3 }, { id: "g", fn: "growth", of: "ma" }, { id: "r", fn: "correlation", of: "slot1", with: "slot2" }, { id: "z", fn: "zScore", of: "slot2" }] as const;
    const two = runRecipe2(rec([...steps], [{ step: "g", label: "g", shows: "series", unit: "percent" }]), slots, ctx);
    const one = runRecipe({ format: "ziffr.analysis/1", name: "t", slots: [{ label: "A" }, { label: "B" }], steps: [...steps], outputs: [{ step: "g", label: "g", unit: "percent" }] }, [a, b]);
    expect(two.steps).toEqual(one);
  });
});

describe("a Takeaway output is the Method's own Takeaway", () => {
  const take = (fn: AnalysisRecipe2["steps"][number], inputs = slots) => {
    const r = runRecipe2(rec([fn], [{ step: fn.id, label: "T", shows: "takeaway", title: "Title", note: "A note." }]), inputs, ctx);
    const o = out(r, fn.id) as Extract<RunOutput, { shows: "takeaway" }>;
    expect(o.title).toBe("Title");
    expect(o.note).toBe("A note.");
    return o.takeaway;
  };
  it("rank correlation, lagged correlation, partial correlation, the usual range and a fit", () => {
    expect(take({ id: "s", fn: "spearman", of: "slot1", with: "slot2" })).toEqual(spearmanTakeaway("Revenue", "Visits", a, b, "month", "values", ctx));
    expect(take({ id: "l", fn: "laggedCorrelation", of: "slot1", with: "slot2", maxLag: 6 })).toEqual(laggedTakeaway("Revenue", "Visits", a, b, "month", "values", ctx));
    expect(take({ id: "p", fn: "partialCorrelation", of: "slot1", with: "slot2", controls: ["slot3"] })).toEqual(partialTakeaway({ a: "Revenue", b: "Visits", held: ["Price"] }, a, b, [c], "month", ctx));
    expect(take({ id: "u", fn: "usualRange", of: "slot1" })).toEqual(usualRangeTakeaway("Revenue", a, "month", UNIT, ctx));
    const f = fit({ target: { name: "Revenue", points: a }, drivers: [{ name: "Visits", points: b }, { name: "Price", points: c }], span: "month" });
    expect(take({ id: "m", fn: "fit", of: "slot1", drivers: ["slot2", "slot3"] })).toEqual(movesTakeaway({ ...UNIT, name: "Revenue" }, [{ ...UNIT, name: "Visits" }, { ...UNIT, name: "Price" }], f, ctx));
  });
  it("compares two growing Metrics by their changes, as the rule says, and says so", () => {
    const up = (k: number) => wobble(30, k + 2).map((v, i) => v + i * 25 * k);
    const t = take({ id: "s", fn: "spearman", of: "slot1", with: "slot2" }, [input("A", up(1)), input("B", up(2))]);
    expect(t.basis).toContain("growth removed");
    expect(t).toEqual(spearmanTakeaway("A", "B", changes(at(up(1)), "month"), changes(at(up(2)), "month"), "month", "changes", ctx));
  });
  it("never uses a word a Takeaway may not, answer or refusal", () => {
    for (const step of [
      { id: "s", fn: "spearman", of: "slot1", with: "slot2" }, { id: "l", fn: "laggedCorrelation", of: "slot1", with: "slot2", maxLag: 6 },
      { id: "p", fn: "partialCorrelation", of: "slot1", with: "slot2", controls: ["slot3"] }, { id: "u", fn: "usualRange", of: "slot1" }, { id: "m", fn: "fit", of: "slot1", drivers: ["slot2", "slot3"] },
    ] as AnalysisRecipe2["steps"]) {
      for (const inputs of [slots, slots.map((s) => ({ ...s, points: s.points.slice(0, 4) }))]) expect(words(take(step, inputs)), step.fn).not.toMatch(FORBIDDEN);
    }
  });
  it("refuses in words where the data is too short, with no sentence and no number", () => {
    const t = take({ id: "s", fn: "spearman", of: "slot1", with: "slot2" }, slots.map((s) => ({ ...s, points: s.points.slice(0, 4) })));
    expect(t.kind).toBe("refusal");
    expect(t.sentence).toBeNull();
    expect(t.refusal).toMatch(/Not enough/);
  });
});

describe("what each step holds", () => {
  it("is a series, one value, a table or a model, by its function", () => {
    const r = runRecipe2(rec([
      { id: "x", fn: "detrended", of: "slot1" }, { id: "s", fn: "spearman", of: "slot1", with: "slot2" }, { id: "l", fn: "laggedCorrelation", of: "slot1", with: "slot2", maxLag: 1 },
      { id: "u", fn: "usualRange", of: "slot1" }, { id: "m", fn: "fit", of: "slot1", drivers: ["slot2"] }, { id: "w", fn: "importance", of: "m" },
    ], [{ step: "s", label: "s", shows: "value", unit: "number" }], 2), slots.slice(0, 2), ctx);
    expect(Object.fromEntries(Object.entries(r.steps).map(([k, v]) => [k, v.kind]))).toEqual({ x: "series", s: "value", l: "table", u: "table", m: "model", w: "table" });
  });
  it("refuses values so large that a change or a miss from a line could not be written as a number", () => {
    const big = 1.7e308;
    const r = runRecipe2(rec([{ id: "d", fn: "detrended", of: "slot1" }, { id: "c", fn: "changes", of: "slot1" }], [{ step: "d", label: "d", shows: "series", unit: "metric" }, { step: "c", label: "c", shows: "series", unit: "metric" }], 1), [input("A", [big, -big, big])], ctx);
    expect(val(out(r, "d"))).toEqual([]);
    expect(val(out(r, "c"))).toEqual([]);
    // At the largest size accepted, a change and a miss are numbers.
    const ok = runRecipe2(rec([{ id: "d", fn: "detrended", of: "slot1" }, { id: "c", fn: "changes", of: "slot1" }], [{ step: "d", label: "d", shows: "series", unit: "metric" }, { step: "c", label: "c", shows: "series", unit: "metric" }], 1), [input("A", [1e15, -1e15, 1e15])], ctx);
    expect((val(out(ok, "c")) as { value: number }[]).map((p) => p.value)).toEqual([-2e15, 2e15]);
    expect((val(out(ok, "d")) as { value: number }[]).every((p) => Number.isFinite(p.value))).toBe(true);
  });
  it("names a step by its own id and a Slot by its Metric, even where an id looks like a Slot", () => {
    // `myslot1` and `slot1x` are good names for steps: only slot1 to slot4 exactly are Slots.
    const r = runRecipe2(rec([
      { id: "myslot1", fn: "changes", of: "slot2" }, { id: "slot1x", fn: "changes", of: "slot3" }, { id: "m", fn: "fit", of: "slot1", drivers: ["slot2", "myslot1", "slot1x"] },
    ], [{ step: "myslot1", label: "c", shows: "series", unit: "metric" }], 3), slots, ctx);
    const model = r.steps.m as { input: { target: { name: string }; drivers: { name: string }[] } };
    expect([model.input.target.name, ...model.input.drivers.map((d) => d.name)]).toEqual(["Revenue", "Visits", "myslot1", "slot1x"]);
  });
  it("carries a Takeaway's title and note only when the recipe gives them", () => {
    const r = runRecipe2(rec([{ id: "u", fn: "usualRange", of: "slot1" }], [{ step: "u", label: "u", shows: "takeaway" }, { step: "u", label: "v", shows: "takeaway", title: "T" }, { step: "u", label: "w", shows: "takeaway", note: "N" }], 1), slots.slice(0, 1), ctx);
    expect(r.outputs.map((o) => ["title" in o, "note" in o])).toEqual([[false, false], [true, false], [false, true]]);
  });
});

describe("what a recipe reaches and how it fails", () => {
  const all = rec([
    { id: "x", fn: "changes", of: "slot1" }, { id: "s", fn: "spearman", of: "slot1", with: "slot2" }, { id: "l", fn: "laggedCorrelation", of: "slot1", with: "slot2", maxLag: 2 },
    { id: "m", fn: "fit", of: "slot1", drivers: ["slot2"] }, { id: "w", fn: "importance", of: "m" },
  ], [{ step: "x", label: "x", shows: "series", unit: "metric" }, { step: "s", label: "s", shows: "value", unit: "number" }, { step: "l", label: "l", shows: "table" }, { step: "w", label: "w", shows: "table" }, { step: "m", label: "m", shows: "takeaway" }], 2);
  it("Metrics of different periods are not compared: every output says so in words, with no number", () => {
    const r = runRecipe2(all, [input("Revenue", va), { ...input("Visits", vb.slice(0, 12), "quarter") }], ctx);
    expect(val(out(r, "x"))).toEqual([]);
    expect(val(out(r, "s"))).toBeNull();
    expect((out(r, "l") as Extract<RunOutput, { shows: "table" }>).rows).toEqual([]);
    expect((out(r, "w") as Extract<RunOutput, { shows: "table" }>).rows).toEqual([]);
    const t = (out(r, "m") as Extract<RunOutput, { shows: "takeaway" }>).takeaway;
    expect(t.kind).toBe("refusal");
    expect(t.refusal).toBe("Revenue, Visits are kept by different periods, and a recipe compares Metrics of one period. Show them by the same period first.");
    expect(t.sentence).toBeNull();
    // Every step is empty in its own kind, and a fit says why in the same words.
    expect(r.steps).toEqual({
      x: { kind: "series", points: [] }, s: { kind: "value", value: null }, l: { kind: "table", rows: [] }, w: { kind: "table", rows: [] },
      m: { kind: "model", input: { target: { name: "", points: [] }, drivers: [], span: "month" }, fit: { ok: false, refusals: [{ case: "recipe-mixed-periods", slots: { names: "Revenue, Visits" } }] } },
    });
    const usual = runRecipe2(rec([{ id: "u", fn: "usualRange", of: "slot1" }, { id: "p", fn: "partialCorrelation", of: "slot1", with: "slot2", controls: ["slot1"] }], [{ step: "u", label: "u", shows: "takeaway" }], 2), [input("Revenue", va), input("Visits", vb.slice(0, 12), "quarter")], ctx);
    expect((out(usual, "u") as Extract<RunOutput, { shows: "takeaway" }>).takeaway.method).toBe("Usual range");
    expect(usual.steps.p).toEqual({ kind: "value", value: null });
  });
  it("a Slot with no values is no reason to refuse for periods: only Slots that have values are compared", () => {
    const r = runRecipe2(all, [input("Revenue", va), { ...input("Visits", [], "quarter") }], ctx);
    expect(val(out(r, "x"))).toEqual(changes(a, "month"));
  });
  it("a Slot that was not given is empty, and nothing is borrowed from another", () => {
    const r = runRecipe2(all, [], ctx);
    expect(val(out(r, "x"))).toEqual([]);
    expect(val(out(r, "s"))).toBeNull();
    expect(((out(r, "m") as Extract<RunOutput, { shows: "takeaway" }>).takeaway).kind).toBe("refusal");
    const half = runRecipe2(all, [input("Revenue", va)], ctx);
    expect(val(out(half, "s"))).toBeNull();
    expect(val(out(half, "x"))).toEqual(changes(a, "month"));
  });
  it("uses the latest 120 values of a Slot and no more", () => {
    const long = wobble(RECIPE_POINTS + 50, 3);
    const mean = rec([{ id: "q", fn: "quantile", of: "slot1", percent: 50 }], [{ step: "q", label: "q", shows: "value", unit: "metric" }], 1);
    const full = runRecipe2(mean, [input("A", long)], ctx);
    const last = runRecipe2(mean, [{ ...input("A", []), points: at(long).slice(-RECIPE_POINTS) }], ctx);
    expect(val(out(full, "q"))).toBe(val(out(last, "q")));
    expect(val(out(full, "q"))).not.toBe(quantile(at(long), 0.5));
    // The 120th value from the end is used, the 121st is not: one step either side.
    const edge = rec([{ id: "q", fn: "quantile", of: "slot1", percent: 99 }], [{ step: "q", label: "q", shows: "value", unit: "metric" }], 1);
    const pts = (n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? 1000 : i));
    expect(val(out(runRecipe2(edge, [input("A", pts(RECIPE_POINTS + 1))], ctx), "q"))).toBe(quantile(at(pts(RECIPE_POINTS + 1)).slice(1), 0.99));
    expect(val(out(runRecipe2(edge, [input("A", pts(RECIPE_POINTS))], ctx), "q"))).toBe(quantile(at(pts(RECIPE_POINTS)), 0.99));
  });
  it("tells names apart even where a suffix is a real name, and the Takeaway of a fit finds each driver", () => {
    const r = runRecipe2(rec([{ id: "m", fn: "fit", of: "slot1", drivers: ["slot2", "slot3"] }], [{ step: "m", label: "m", shows: "takeaway" }]), [input("Visits", va), input("Visits", vb), input("Visits (2)", vc)], ctx);
    const model = r.steps.m as { input: { target: { name: string }; drivers: { name: string }[] } };
    expect([model.input.target.name, ...model.input.drivers.map((d) => d.name)]).toEqual(["Visits", "Visits (2)", "Visits (2) (2)"]);
    expect(((out(r, "m") as Extract<RunOutput, { shows: "takeaway" }>).takeaway).kind).toBe("answer");
  });
  it("does not fit again for the importance table", () => {
    const x = wobble(30, 3);
    const r = runRecipe2(rec([{ id: "m", fn: "fit", of: "slot1", drivers: ["slot2"] }, { id: "w", fn: "importance", of: "m" }], [{ step: "w", label: "w", shows: "table" }], 2), [input("Y", x.map((v, i) => v * 2 + (i % 3))), input("X", x)], ctx);
    const f = (r.steps.m as { fit: { ok: true; drivers: { name: string; share: number }[] } }).fit;
    expect((out(r, "w") as Extract<RunOutput, { shows: "table" }>).rows).toEqual(f.drivers.map((d) => ({ label: d.name, value: d.share })));
  });
  it("refuses a fit of a Metric built from its own driver, as the question does", () => {
    const rev = { slug: "revenue", name: "Revenue", formula: "{price} * {volume}", period: "month" as const, aggregation: "sum" as const };
    const mk = (n: string, slug: string) => ({ slug, name: n, formula: null, period: "month" as const, aggregation: "sum" as const });
    const r = runRecipe2(rec([{ id: "m", fn: "fit", of: "slot1", drivers: ["slot2", "slot3"] }], [{ step: "m", label: "m", shows: "takeaway" }]), [{ ...input("Revenue", va), meta: rev }, { ...input("Price", vb), meta: mk("Price", "price") }, { ...input("Volume", vc), meta: mk("Volume", "volume") }], ctx);
    expect(((out(r, "m") as Extract<RunOutput, { shows: "takeaway" }>).takeaway).kind).toBe("refusal");
  });
  it("tells the fit what its Metrics are only where it knows every one of them", () => {
    const mk = (n: string, slug: string) => ({ slug, name: n, formula: null, period: "month" as const, aggregation: "sum" as const });
    const run = (metas: (ReturnType<typeof mk> | undefined)[]) => {
      const r = runRecipe2(rec([{ id: "m", fn: "fit", of: "slot1", drivers: ["slot2"] }], [{ step: "m", label: "m", shows: "takeaway" }], 2), [{ ...input("A", va), meta: metas[0] }, { ...input("B", vb), meta: metas[1] }], ctx);
      return (r.steps.m as { input: { metrics?: { name: string; slug: string }[] } }).input.metrics;
    };
    expect(run([mk("A", "a"), mk("B", "b")])).toEqual([{ ...mk("A", "a") }, { ...mk("B", "b") }]);
    expect(run([mk("A", "a"), undefined])).toBeUndefined();
    expect(run([undefined, mk("B", "b")])).toBeUndefined();
  });
  it("tells two Slots of one name apart, so a fit never takes them for one driver", () => {
    const r = runRecipe2(rec([{ id: "m", fn: "fit", of: "slot1", drivers: ["slot2", "slot3"] }], [{ step: "m", label: "m", shows: "takeaway" }]), [input("Sales", va), input("Sales", vb), input("Sales", vc)], ctx);
    const model = r.steps.m as { input: { target: { name: string }; drivers: { name: string }[] } };
    expect([model.input.target.name, ...model.input.drivers.map((d) => d.name)]).toEqual(["Sales", "Sales (2)", "Sales (3)"]);
  });
  it("gives no number that is not finite and does not fail on the hostile series a Metric can hold", () => {
    const hostile = [
      [NaN, Infinity, -Infinity, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [], [5], Array(20).fill(7), [1e308, -1e308, 1e-320, 5e-324, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      Array.from({ length: 20 }, (_, i) => i * 1e30), Array.from({ length: 20 }, (_, i) => (i % 2 ? 0 : 1)),
    ];
    for (const vs of hostile) {
      const dupes = [...at(vs), ...at(vs).slice(0, 3)].reverse();
      for (const pts of [at(vs), dupes]) {
        const r = runRecipe2(all, [{ ...input("A", []), points: pts }, { ...input("B", []), points: pts.map((p) => ({ ...p, value: p.value * 2 })) }], ctx);
        const numbers: number[] = [];
        for (const o of r.outputs) {
          if (o.shows === "series") numbers.push(...(o.result.kind === "series" ? o.result.points.map((p) => p.value) : []));
          if (o.shows === "value" && o.result.kind === "value" && o.result.value !== null) numbers.push(o.result.value);
          if (o.shows === "table") numbers.push(...o.rows.flatMap((x) => (x.value === null ? [] : [x.value])));
          if (o.shows === "takeaway") expect(words(o.takeaway)).not.toMatch(FORBIDDEN);
        }
        expect(numbers.every(Number.isFinite), JSON.stringify(vs).slice(0, 60)).toBe(true);
      }
    }
  });
  it("is the same on every run and does not change what it was given", () => {
    const given = JSON.stringify(slots);
    const one = runRecipe2(all, slots.slice(0, 2), ctx);
    expect(JSON.stringify(runRecipe2(all, slots.slice(0, 2), ctx))).toBe(JSON.stringify(one));
    expect(JSON.stringify(slots)).toBe(given);
  });
  it("answers the biggest recipe the checks allow within a few seconds", () => {
    const many = Array.from({ length: 4 }, (_, k) => input(`M${k}`, wobble(RECIPE_POINTS + 30, k + 2)));
    const big = rec(
      [
        { id: "m1", fn: "fit", of: "slot1", drivers: ["slot2", "slot3", "slot4"] }, { id: "m2", fn: "fit", of: "slot2", drivers: ["slot1", "slot3", "slot4"] },
        { id: "i1", fn: "importance", of: "m1" }, { id: "i2", fn: "importance", of: "m2" },
        ...Array.from({ length: 4 }, (_, k) => ({ id: `l${k}`, fn: "laggedCorrelation" as const, of: "slot1" as const, with: "slot2" as const, maxLag: 6 })),
        ...Array.from({ length: 4 }, (_, k) => ({ id: `p${k}`, fn: "partialCorrelation" as const, of: "slot1" as const, with: "slot2" as const, controls: ["slot3", "slot4"] })),
      ],
      [{ step: "m1", label: "a", shows: "takeaway" }, { step: "m2", label: "b", shows: "takeaway" }, { step: "l0", label: "c", shows: "takeaway" }, { step: "p0", label: "d", shows: "takeaway" }],
      4,
    );
    const started = Date.now();
    runRecipe2(big, many, ctx);
    expect(Date.now() - started).toBeLessThan(15_000);
  });
});

describe("what a recipe may be asked to work out", () => {
  const one = (vs: number[]) => runRecipe2(rec([{ id: "u", fn: "usualRange", of: "slot1" }, { id: "c", fn: "changes", of: "slot1" }], [{ step: "u", label: "u", shows: "takeaway" }, { step: "c", label: "c", shows: "series", unit: "metric" }], 1), [input("Sales", vs)], ctx);
  const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it("works on up to 30 decimal places and refuses the 31st, in words, with no number", () => {
    expect(MOST_PLACES).toBe(30);
    expect(tooWide(at([1e-30]))).toBe(false);
    expect(tooWide(at([1e-31]))).toBe(true);
    expect(tooWide(at([1.5e-29]))).toBe(false);
    expect(tooWide(at([1.5e-30]))).toBe(true);
    expect(tooWide(at([0.12345678901234567]))).toBe(false);
    const ok = one([...base, 1e-30]);
    expect(val(out(ok, "c"))).not.toEqual([]);
    const wide = one([...base, 1e-31]);
    expect(val(out(wide, "c"))).toEqual([]);
    expect(takeawayOf(wide, "u").kind).toBe("refusal");
    expect(takeawayOf(wide, "u").refusal).toBe("Sales hold values this recipe cannot work out exactly: more than 30 decimal places, or a value above 1,000,000,000,000,000. Round the values or leave out the far-off ones.");
  });
  it("works on values up to 1e15 and refuses the first double above it", () => {
    expect(MOST_SIZE).toBe(1e15);
    expect(tooWide(at([1e15, -1e15]))).toBe(false);
    expect(tooWide(at([1e15 + 0.125]))).toBe(true);
    expect(tooWide(at([-1e15 - 0.125]))).toBe(true);
    expect(tooWide(at([1e300]))).toBe(true);
    expect(takeawayOf(one([...base, 1e15]), "u").kind).toBe("answer");
    expect(takeawayOf(one([...base, 1e15 + 0.125]), "u").kind).toBe("refusal");
  });
  it("refuses the same for every kind of step, and a fit says why in its own words", () => {
    const r = runRecipe2(rec([{ id: "m", fn: "fit", of: "slot1", drivers: ["slot2"] }, { id: "s", fn: "spearman", of: "slot1", with: "slot2" }], [{ step: "m", label: "m", shows: "takeaway" }, { step: "s", label: "s", shows: "takeaway" }], 2), [input("A", [...va, 1e-31]), input("B", vb)], ctx);
    expect(takeawayOf(r, "m").refusal).toContain("cannot work out exactly");
    expect(takeawayOf(r, "s").refusal).toContain("cannot work out exactly");
    expect(r.steps.s).toEqual({ kind: "value", value: null });
    expect((r.steps.m as { fit: { ok: boolean } }).fit.ok).toBe(false);
  });
  it("stops at the same step on every machine when the work is spent, one step either side", () => {
    expect(WORK_BUDGET).toBe(100_000);
    // A lagged correlation of 6 delays on 120 values costs 120 × 7 × 2 = 1,680 units: 59 of them are 99,120, the 60th goes over.
    const long = (k: number) => input(`M${k}`, wobble(RECIPE_POINTS, k));
    const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, fn: "laggedCorrelation" as const, of: "slot1", with: "slot2", maxLag: 6 }));
    const run = (n: number, shows: AnalysisRecipe2["outputs"] = [{ step: "l0", label: "l", shows: "table" }]) => runRecipe2(rec(steps(n), shows, 2), [long(3), long(5)], ctx);
    const at59 = run(59);
    expect((at59.steps.l58 as { rows: unknown[] }).rows.length).toBe(7);
    const at60 = run(60);
    expect((at60.steps.l58 as { rows: unknown[] }).rows.length).toBe(7);
    expect((at60.steps.l59 as { rows: unknown[] }).rows).toEqual([]);
    expect(JSON.stringify(run(60))).toBe(JSON.stringify(at60));
    // A Takeaway counts too: a lagged one costs its step's work again.
    const t = (n: number) => takeawayOf(run(n, [{ step: "l0", label: "t", shows: "takeaway" }]), "l0");
    expect(t(29).kind).toBe("answer");
    // 29 steps are 48,720 units and the Takeaway 1,680 more; 58 steps alone are 97,440, and with the Takeaway they are 99,120: still within.
    expect(t(58).kind).toBe("answer");
    // 59 steps are 99,120 and the Takeaway takes it to 100,800: over.
    expect(t(59).kind).toBe("refusal");
    expect(t(59).refusal).toBe("This recipe asks for more work than one result may take, so it stops here. Leave out some steps.");
    // Steps that are not lagged: a fit of 3 drivers on 120 values is 1,920 units, a partial correlation with 2 controls 1,920, a Takeaway of the usual range 8 passes.
    const fits = (n: number) => runRecipe2(rec(Array.from({ length: n }, (_, i) => ({ id: `m${i}`, fn: "fit" as const, of: "slot1", drivers: ["slot2", "slot3", "slot4"] })), [{ step: "m0", label: "m", shows: "table" }], 4), [1, 2, 3, 4].map((k) => input(`M${k}`, wobble(RECIPE_POINTS, k + 2))), ctx);
    expect((fits(52).steps.m51 as { fit: { ok: boolean } }).fit.ok).toBe(true);
    expect((fits(53).steps.m52 as { fit: { ok: boolean; refusals?: { case: string }[] } }).fit).toMatchObject({ ok: false, refusals: [{ case: "recipe-too-much" }] });
    const partials = (n: number) => runRecipe2(rec(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, fn: "partialCorrelation" as const, of: "slot1", with: "slot2", controls: ["slot3", "slot4"] })), [{ step: "p0", label: "m", shows: "value", unit: "number" }], 4), [1, 2, 3, 4].map((k) => input(`M${k}`, wobble(RECIPE_POINTS, k + 2))), ctx);
    expect((partials(52).steps.p51 as { value: number | null }).value).not.toBeNull();
    expect((partials(53).steps.p52 as { value: number | null }).value).toBeNull();
  });
  it("counts every step, and a Takeaway by its Method, to the unit: the budget is spent at 100,000 and not before", () => {
    // 100 values in the longest Slot: a plain step costs 100 units, so 1,000 of them are exactly the budget and the 1,001st is over.
    const hundred = (k: number) => input(`M${k}`, wobble(100, k));
    const plain = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, fn: "changes" as const, of: "slot1" }));
    const fitStepOf = (): AnalysisRecipe2["steps"][number] => ({ id: "f", fn: "fit", of: "slot1", drivers: ["slot2", "slot3", "slot4"] });
    const run = (steps: AnalysisRecipe2["steps"], shows: AnalysisRecipe2["outputs"]) => runRecipe2(rec(steps, shows, 4), [1, 2, 3, 4].map((k) => hundred(k + 2)), ctx);
    const last = (r: ReturnType<typeof run>, id: string) => (r.steps[id] as { points: unknown[] }).points.length;
    const keep: AnalysisRecipe2["outputs"] = [{ step: "c0", label: "c", shows: "series", unit: "metric" }];
    expect(last(run(plain(1000), keep), "c999")).toBeGreaterThan(0);
    expect(last(run(plain(1001), keep), "c1000")).toBe(0);
    // A Takeaway of a step that works on one series costs 8 passes of the series: 999 plain steps and a usual range are 99,900, and 800 more is over.
    const usual: AnalysisRecipe2["steps"] = [...plain(992), { id: "u", fn: "usualRange", of: "slot1" }];
    expect(run(usual, [{ step: "u", label: "t", shows: "takeaway" }]).outputs[0]).toMatchObject({ takeaway: { kind: "refusal" } });
    expect(run(usual.slice(0, 980).concat(usual.slice(-1)), [{ step: "u", label: "t", shows: "takeaway" }]).outputs[0]).toMatchObject({ takeaway: { kind: "answer" } });
    const sp: AnalysisRecipe2["steps"] = [...plain(992), { id: "s", fn: "spearman", of: "slot1", with: "slot2" }];
    expect(run(sp, [{ step: "s", label: "t", shows: "takeaway" }]).outputs[0]).toMatchObject({ takeaway: { kind: "refusal" } });
    // Exactly the budget is not over it: 991 plain steps and a rank correlation are 99,200, its Takeaway 800 more.
    expect(run([...plain(991), sp[992]], [{ step: "s", label: "t", shows: "takeaway" }]).outputs[0]).toMatchObject({ takeaway: { kind: "answer" } });
    expect(run(usual, [{ step: "u", label: "t", shows: "takeaway" }]).outputs[0]).toMatchObject({ takeaway: { refusal: "This recipe asks for more work than one result may take, so it stops here. Leave out some steps." } });
    const spent = run([...plain(1001), fitStepOf()], keep);
    expect((spent.steps.f as { fit: unknown }).fit).toEqual({ ok: false, refusals: [{ case: "recipe-too-much", slots: { names: "M3, M4, M5, M6" } }] });
    // A lagged correlation (6 delays: 1,400 units) and a partial correlation (2 controls: 1,600) cost their step's work again in a Takeaway; a fit's Takeaway costs nothing more.
    const lag: AnalysisRecipe2["steps"] = [...plain(977), { id: "l", fn: "laggedCorrelation", of: "slot1", with: "slot2", maxLag: 6 }];
    expect(run(lag, [{ step: "l", label: "t", shows: "takeaway" }]).outputs[0]).toMatchObject({ takeaway: { kind: "refusal" } });
    expect(run([...plain(800), lag[977]], [{ step: "l", label: "t", shows: "takeaway" }]).outputs[0]).toMatchObject({ takeaway: { kind: "answer" } });
    const par: AnalysisRecipe2["steps"] = [...plain(975), { id: "p", fn: "partialCorrelation", of: "slot1", with: "slot2", controls: ["slot3", "slot4"] }];
    expect(run(par, [{ step: "p", label: "t", shows: "takeaway" }]).outputs[0]).toMatchObject({ takeaway: { kind: "refusal" } });
    expect(run([...plain(800), par[975]], [{ step: "p", label: "t", shows: "takeaway" }]).outputs[0]).toMatchObject({ takeaway: { kind: "answer" } });
    const fitStep = fitStepOf();
    expect(run([...plain(980), fitStep], [{ step: "f", label: "t", shows: "takeaway" }]).outputs[0]).toMatchObject({ takeaway: { kind: "answer" } });
  });
  it("answers the hostile recipe on the widest values it accepts in a few seconds, as on ordinary values", () => {
    const r7 = (x: number) => Number(x.toPrecision(7));
    const wide = (k: number) => Array.from({ length: RECIPE_POINTS }, (_, i) => r7(i % 2 ? 4.87654321e14 * (1 + ((i * 7 + k) % 13) / 13) : 1.23456789e-23 * (1 + ((i * 5 + k) % 11) / 11)));
    const four = (gen: (k: number) => number[]) => [1, 2, 3, 4].map((k) => input(`M${k}`, gen(k + 2)));
    const big = rec(
      [
        { id: "m1", fn: "fit", of: "slot1", drivers: ["slot2", "slot3", "slot4"] }, { id: "m2", fn: "fit", of: "slot2", drivers: ["slot1", "slot3"] }, { id: "w", fn: "importance", of: "m1" },
        { id: "l", fn: "laggedCorrelation", of: "slot1", with: "slot2", maxLag: 6 }, { id: "p", fn: "partialCorrelation", of: "slot1", with: "slot2", controls: ["slot3", "slot4"] },
        { id: "u", fn: "usualRange", of: "slot1" }, { id: "s", fn: "spearman", of: "slot1", with: "slot2" },
      ],
      ["m1", "m2", "l", "p", "s"].map((step) => ({ step, label: step, shows: "takeaway" as const })),
      4,
    );
    for (const gen of [wide, (k: number) => wobble(RECIPE_POINTS, k)]) {
      const started = Date.now();
      const r = runRecipe2(big, four(gen), ctx);
      expect(Date.now() - started).toBeLessThan(3000);
      expect(r.outputs.every((o) => o.shows === "takeaway" && o.takeaway.kind === "answer")).toBe(true);
    }
  });
});

describe("a pair is compared on the same basis in the table, the value and the Takeaway", () => {
  const grow = (k: number, n = 36) => wobble(n, k).map((v, i) => v + i * 30);
  const flat = (k: number, n = 36) => wobble(n, k);
  const steps: AnalysisRecipe2["steps"] = [{ id: "s", fn: "spearman", of: "slot1", with: "slot2" }, { id: "l", fn: "laggedCorrelation", of: "slot1", with: "slot2", maxLag: 6 }];
  const outputs: AnalysisRecipe2["outputs"] = [{ step: "s", label: "s", shows: "value", unit: "number" }, { step: "l", label: "l", shows: "table" }, { step: "s", label: "ts", shows: "takeaway" }, { step: "l", label: "tl", shows: "takeaway" }];
  const go = (x: number[], y: number[]) => runRecipe2(rec(steps, outputs, 2), [input("A", x), input("B", y)], ctx);
  const rows = (r: ReturnType<typeof go>) => (out(r, "l") as Extract<RunOutput, { shows: "table" }>).rows;
  const tk = (r: ReturnType<typeof go>, step: string) => (r.outputs.find((o) => o.step === step && o.shows === "takeaway") as Extract<RunOutput, { shows: "takeaway" }>).takeaway;

  it("two growing series are compared by change: a shared trend is not a link, and the output says so", () => {
    const r = go(grow(3), grow(5));
    const direct = spearman(changes(at(grow(3)), "month"), changes(at(grow(5)), "month"))!.rho;
    expect(r.outputs.find((o) => o.shows === "value")).toMatchObject({ result: { value: direct } });
    expect(Math.abs(direct)).toBeLessThan(0.9);
    expect(rows(r).map((x) => x.value)).toEqual(laggedCorrelation(changes(at(grow(3)), "month"), changes(at(grow(5)), "month"), "month", 6).lags.map((l) => l.r));
    for (const o of r.outputs.filter((x) => x.shows !== "takeaway")) expect((o as { basis?: string }).basis).toBe("compared by change, growth removed");
    expect(tk(r, "s").basis).toContain("growth removed");
    expect(tk(r, "l").basis).toContain("growth removed");
  });
  it("flat series, and a growing one beside a flat one, are compared by value", () => {
    for (const [x, y] of [[flat(3), flat(5)], [grow(3), flat(5)]]) {
      const r = go(x, y);
      expect(r.outputs.find((o) => o.shows === "value")).toMatchObject({ result: { value: spearman(at(x), at(y))!.rho }, basis: "compared by value" });
      expect(rows(r)[0].value).toBe(laggedCorrelation(at(x), at(y), "month", 6).lags[0].r);
      expect(tk(r, "s").basis).not.toContain("growth removed");
    }
  });
  it("two series that grow by exactly the same step each month have no change to compare: no number, and a refusal in words", () => {
    const line = (k: number) => Array.from({ length: 36 }, (_, i) => 100 + i * k);
    const r = go(line(5), line(7));
    expect(r.outputs.find((o) => o.shows === "value")).toMatchObject({ result: { value: null } });
    expect(rows(r).every((x) => x.value === null)).toBe(true);
    expect(tk(r, "s").kind).toBe("refusal");
    expect(tk(r, "s").refusal).toContain("hardly changed");
  });
});
