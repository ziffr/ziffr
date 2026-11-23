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
import { runRecipe, runRecipe2, type RunOutput } from "./recipe-run";
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
  it("spearman is worked out by hand: one pair swapped in eight is 1 − 6·2 ÷ 504 = 41/42", () => {
    const run = (x: number[], y: number[]) => runRecipe2(rec([{ id: "s", fn: "spearman", of: "slot1", with: "slot2" }], [{ step: "s", label: "s", shows: "value", unit: "number" }], 2), [input("A", x), input("B", y)], ctx);
    expect(val(out(run([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 8, 7]), "s"))).toBeCloseTo(41 / 42, 14);
    expect(val(out(run([1, 2, 3, 4, 5, 6, 7, 8], [8, 7, 6, 5, 4, 3, 2, 1]), "s"))).toBe(-1);
    expect(val(out(run([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]), "s"))).toBe(1);
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
  it("leaves out a result too large to be a number, from a change and from a detrended series", () => {
    const big = 1.7e308;
    const r = runRecipe2(rec([{ id: "d", fn: "detrended", of: "slot1" }, { id: "c", fn: "changes", of: "slot1" }], [{ step: "d", label: "d", shows: "series", unit: "metric" }, { step: "c", label: "c", shows: "series", unit: "metric" }], 1), [input("A", [big, -big, big])], ctx);
    // The middle value of the straight line's miss is −Infinity, and both changes are ±Infinity: none of these is written as a number.
    expect(val(out(r, "d"))).toEqual([{ period: "2020-01-01", value: 1.1333333333333334e308 }, { period: "2020-03-01", value: 1.1333333333333334e308 }]);
    expect(val(out(r, "c"))).toEqual([]);
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
