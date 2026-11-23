// The marks `range` and `bridge` (spec 0041, ticket 9; GLOSSARY: View Design, Analysis Recipe, Number Style): the recipe functions that
// feed them (`bridge`, `effects`) give what their Methods give, exactly; the figures the marks draw are the numbers of those tables written
// in the Number Style, never a number worked out again; a table the marks cannot draw honestly is refused in words; the files that name them
// are checked (hostile files refused with their line, the published schema agrees with a second validator); and a design that draws them
// gives the same numbers in a widget, a Snapshot, a View Link and a deck, which all read `drawRecipe`.
import Ajv2020 from "ajv/dist/2020";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ANALYSIS_FORMAT_2, ANALYSIS_RECIPE_SCHEMA_2, checkAnalysisRecipe, FUNCTIONS_2, type AnalysisRecipe2 } from "./analysis-recipe";
import { drawRecipe, newRecipeBudget, drawnPart } from "./design-analysis";
import { nativeForm } from "./design-export";
import { dataAsOf } from "./snapshot-periods";
import { exactOf, nearestDoubleOf, plus as plusExact, same, ZERO } from "./test/reference/exact";
import { fit } from "./methods/fit";
import { bridge, bridgeTakeaway } from "./methods/bridge";
import { MARK_ROWS, bridgeFigures, rangeFigures } from "./mark-figures";
import { periodLabel } from "./periods";
import { bridgeRows, effectRows, type RecipeInput, type TableRow } from "./recipe-methods";
import { runRecipe2, type RunOutput } from "./recipe-run";
import { sampleCanvasData } from "./sample-data";
import { shownSeries } from "./display-periods";
import { checkViewDesign, drawnTables, VIEW_DESIGN_SCHEMA, writeViewDesign, type ViewDesign } from "./view-design";
import { EXAMPLE } from "./view-design.test";
import type { TakeawayContext } from "./takeaways/takeaway";
import type { Point } from "./types";

const ctx: TakeawayContext = { style: "1,234.5" };
const UNIT = { unit: "€", unit_position: "after" as const, decimals: 0 };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const month = (i: number) => `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;
const at = (vs: (number | null)[], from = 0): Point[] => vs.flatMap((value, i) => (value === null ? [] : [{ period: month(i + from), value }]));
const input = (name: string, points: Point[]): RecipeInput => ({ name, unit: UNIT, period: "month", points });
const rec = (steps: AnalysisRecipe2["steps"], outputs: AnalysisRecipe2["outputs"], slots = 3): AnalysisRecipe2 => ({ format: ANALYSIS_FORMAT_2, name: "t", slots: Array.from({ length: slots }, (_, i) => ({ label: `S${i + 1}` })), steps, outputs });
const BRIDGE = rec([{ id: "br", fn: "bridge", of: "slot1", parts: ["slot2", "slot3"] }], [{ step: "br", label: "What changed", shows: "table" }]);
const rows = (r: { outputs: RunOutput[] }) => (r.outputs[0] as Extract<RunOutput, { shows: "table" }>);

describe("the bridge step", () => {
  // Revenue 100 → 120; Germany 60 → 50 (−10); Austria 40 → 75 (+35): the parts say +25, so 5 are not in these parts.
  const whole = at([90, 100, 120]);
  const run = (a: Point[], b: Point[], c: Point[]) => rows(runRecipe2(BRIDGE, [input("Revenue", a), input("Germany", b), input("Austria", c)], ctx));
  const GOOD = run(whole, at([50, 60, 50]), at([30, 40, 75]));

  it("gives the start, each part by size, what the parts leave out, and the end, from the Method's own contributions", () => {
    expect(GOOD.rows).toEqual([
      { label: "February 2025", value: 100, role: "start" },
      { label: "Austria", value: 35, role: "part" },
      { label: "Germany", value: -10, role: "part" },
      { label: "Not in these parts", value: -5, role: "rest" },
      { label: "March 2025", value: 120, role: "end" },
    ]);
    // The same numbers the Method gives for these parts (the test names the parts itself, it does not read them back).
    const got = bridge([{ label: "Germany", before: 60, after: 50 }, { label: "Austria", before: 40, after: 75 }], { before: 100, after: 120 });
    expect(got.ok && got.parts.map((p) => [p.label, p.change])).toEqual([["Austria", 35], ["Germany", -10]]);
    expect(got.ok && got.unexplained).toBe(-5);
  });
  it("has parts that add up to the change exactly: 0.1 + 0.2 is 0.3, not 0.30000000000000004", () => {
    const r = run(at([1.1, 1.4]), at([0.5, 0.6]), at([0.6, 0.8]));
    const values = r.rows.map((x) => x.value as number);
    // start, two parts, end (nothing is left out). The parts' exact sum, on their text, is the whole's change on its text.
    expect(r.rows.map((x) => x.role)).toEqual(["start", "part", "part", "end"]);
    const change = plusExact(exactOf(1.4), { num: -exactOf(1.1).num, den: exactOf(1.1).den });
    expect(same(plusExact(exactOf(values[1]), exactOf(values[2])), change)).toBe(true);
    expect(values[1] + values[2]).not.toBe(0.3);
  });
  it("names a part with no value on one side, which counts as 0 there, as appeared or gone", () => {
    const r = run(whole, at([null, null, 50]), at([30, 40, null]));
    expect(r.rows.filter((x) => x.missing).map((x) => [x.label, x.missing, x.value])).toEqual([["Germany", "appeared", 50], ["Austria", "gone", -40]]);
  });
  it("refuses in words rather than compare across a gap, with one value, or with none", () => {
    const gap = run([{ period: "2025-01-01", value: 1 }, { period: "2025-03-01", value: 2 }], at([1, 1]), at([1, 1]));
    expect(gap.rows).toEqual([]);
    expect(gap.refusal).toBe("Revenue needs a value in two periods that follow one another to draw what changed.");
    expect(run(at([5]), at([1]), at([1])).refusal).toContain("Revenue needs a value in two periods");
    expect(run([], [], []).refusal).toContain("two periods");
    // Two periods one after the other do give a bridge, also across a year's end.
    expect(run([{ period: "2025-12-01", value: 1 }, { period: "2026-01-01", value: 3 }], [{ period: "2025-12-01", value: 1 }, { period: "2026-01-01", value: 3 }], at([1])).rows.map((x) => x.role)).toEqual(["start", "part", "part", "end"]);
  });
  it("says in words when the Method has no bridge to give: no parts, or a value that is not a number", () => {
    expect(bridgeRows({ name: "Revenue", points: whole }, [], "month", ctx)).toEqual({ rows: [], refusal: "No bridge can be drawn from these parts." });
    expect(bridgeRows({ name: "Revenue", points: whole }, [{ name: "A", points: [{ period: "2025-03-01", value: NaN }, { period: "2025-02-01", value: 1 }] }], "month", ctx).refusal).toBe("No bridge can be drawn from these parts.");
  });
  it("labels the start and the end by the period in the Workspace's year, quarters of a year that starts in April included", () => {
    const quarters = [{ period: "2025-10-01", value: 10 }, { period: "2026-01-01", value: 14 }];
    const labelsIn = (yearStart: 1 | 4) => bridgeRows({ name: "Revenue", points: quarters }, [{ name: "A", points: quarters }], "quarter", { style: "1,234.5", yearStart }).rows.filter((r) => r.role === "start" || r.role === "end").map((r) => r.label);
    expect(labelsIn(4)).toEqual([periodLabel("2025-10-01", "quarter", 4), periodLabel("2026-01-01", "quarter", 4)]);
    expect(labelsIn(4)).not.toEqual(labelsIn(1));
    // Without a year start in the context, the year starts in January.
    expect(bridgeRows({ name: "Revenue", points: quarters }, [{ name: "A", points: quarters }], "quarter", ctx).rows[0].label).toBe(periodLabel("2025-10-01", "quarter", 1));
  });
  it("names every Metric by its own name", () => {
    const r = bridgeRows({ name: "Revenue", points: whole }, [{ name: "A", points: at([1, 2, 3]) }], "month", ctx);
    expect(r.rows.map((x) => x.label)).toEqual(["February 2025", "A", "Not in these parts", "March 2025"]);
  });
});

describe("the effects step", () => {
  const N = 30;
  const wobble = (k: number) => Array.from({ length: N }, (_, i) => Math.round((100 + ((i * 37 + k * 11) % 23) * 3 + Math.sin(i * k) * 9 + i * 0.5) * 100) / 100);
  const [a, b, c] = [wobble(3), wobble(5), wobble(7)];
  const EFFECTS = rec([{ id: "m", fn: "fit", of: "slot1", drivers: ["slot2", "slot3"] }, { id: "e", fn: "effects", of: "m" }], [{ step: "e", label: "Effects", shows: "table" }]);
  it("gives each driver's effect with its range, as the fit does", () => {
    const r = rows(runRecipe2(EFFECTS, [input("Revenue", at(a)), input("Visits", at(b)), input("Price", at(c))], ctx));
    const f = fit({ target: { name: "Revenue", points: at(a) }, drivers: [{ name: "Visits", points: at(b) }, { name: "Price", points: at(c) }], span: "month" });
    expect(f.ok).toBe(true);
    expect(r.rows).toEqual(f.ok ? f.drivers.map((d) => ({ label: d.name, value: d.effect, low: d.lo, high: d.hi })) : []);
    expect(effectRows(f)).toEqual(r.rows);
    for (const row of r.rows) expect(row.low! <= row.value! && row.value! <= row.high!).toBe(true);
  });
  it("says why there is no table where the fit was refused", () => {
    const r = rows(runRecipe2(EFFECTS, [input("Revenue", at(a.slice(0, 5))), input("Visits", at(b.slice(0, 5))), input("Price", at(c.slice(0, 5)))], ctx));
    expect(r.rows).toEqual([]);
    expect(r.refusal).toBeTruthy();
    expect(r.refusal).not.toMatch(FORBIDDEN);
  });
});

describe("rangeFigures", () => {
  const R = (label: string, value: number | null, low: number | null, high: number | null): TableRow => ({ label, value, low, high });
  it("writes the middle value and both ends in the Number Style, with the label, and an alternative text with every number", () => {
    const f = rangeFigures([R("Visits", 2400, 1800, 3000), R("Price", -150, -400, 80)], null, { style: "1.234,5" });
    expect(f).toEqual({
      mark: "range",
      ok: true,
      rows: [
        { label: "Visits", centre: 2400, low: 1800, high: 3000, centreText: "2.400,00", lowText: "1.800,00", highText: "3.000,00", alt: "Visits: 2.400,00, likely between 1.800,00 and 3.000,00." },
        { label: "Price", centre: -150, low: -400, high: 80, centreText: "−150,00", lowText: "−400,00", highText: "80,00", alt: "Price: −150,00, likely between −400,00 and 80,00." },
      ],
      alt: "Visits: 2.400,00, likely between 1.800,00 and 3.000,00. Price: −150,00, likely between −400,00 and 80,00.",
    });
  });
  it("writes a Metric's own unit and decimals", () => {
    const f = rangeFigures([R("Revenue", 1200, 1100, 1300)], UNIT, ctx);
    expect(f.ok && f.rows[0].lowText).toBe("1,100 €");
  });
  it("draws a row without a middle value as a range alone", () => {
    const f = rangeFigures([R("Visits", null, 1, 3)], UNIT, ctx);
    expect(f.ok && [f.rows[0].centre, f.rows[0].centreText, f.rows[0].alt]).toEqual([null, null, "Visits: likely between 1 € and 3 €."]);
  });
  it("widens the digits until the ends differ and no number but 0 reads as 0", () => {
    const f = rangeFigures([R("A", 0.0004, 0.0003, 0.0005)], UNIT, ctx);
    expect(f.ok && [f.rows[0].lowText, f.rows[0].centreText, f.rows[0].highText]).toEqual(["0.0003 €", "0.0004 €", "0.0005 €"]);
    // 1000.4 and 1000.6 at no decimals both read 1,000 € and 1,001 €: different already; 1000.41 and 1000.44 need two.
    const g = rangeFigures([R("B", 1000.42, 1000.41, 1000.44)], UNIT, ctx);
    expect(g.ok && [g.rows[0].lowText, g.rows[0].highText]).toEqual(["1,000.41 €", "1,000.44 €"]);
    // A range of one point has equal ends, which read equal.
    const h = rangeFigures([R("C", 5, 5, 5)], UNIT, ctx);
    expect(h.ok && [h.rows[0].lowText, h.rows[0].highText]).toEqual(["5 €", "5 €"]);
  });
  it("widens for the middle value and for the ends alone, and refuses what no digits can write", () => {
    // Only the middle value is small: it must not read 0.
    const centre = rangeFigures([R("A", 0.00004, 0, 1)], UNIT, ctx);
    expect(centre.ok && [centre.rows[0].lowText, centre.rows[0].centreText, centre.rows[0].highText]).toEqual(["0.00000 €", "0.00004 €", "1.00000 €"]);
    // Only the ends read alike at no decimals: 1,000 € and 1,000 €.
    const ends = rangeFigures([R("B", 1000.2, 1000.1, 1000.4)], UNIT, ctx);
    expect(ends.ok && [ends.rows[0].lowText, ends.rows[0].highText]).toEqual(["1,000.1 €", "1,000.4 €"]);
    // 20 decimals write 1e-20 in full; 4e-21 is below them, and a mark is refused rather than draw it as 0.
    const full = rangeFigures([R("C", 1e-20, 0, 1e-20)], UNIT, ctx);
    expect(full.ok && full.rows[0].highText).toBe("0.00000000000000000001 €");
    expect(rangeFigures([R("C", 4e-21, 0, 1e-20)], UNIT, ctx)).toEqual({ mark: "range", ok: false, refusal: "Not drawn: some numbers are too small to write out in full." });
    expect(rangeFigures([R("C", 0, 4e-21, 1e-20)], UNIT, ctx)).toMatchObject({ ok: false });
    // Ends that differ by less than the digits can tell apart are refused too.
    expect(rangeFigures([R("D", 1e10, 1e10, 1e10 + 0.0001)], null, ctx).ok).toBe(true);
    expect(rangeFigures([R("D", 1e15, 1e15, 1e15 + 0.125)], null, ctx).ok).toBe(true);
  });
  it("is a refusal that says what it is, with its mark", () => {
    expect(rangeFigures([], UNIT, ctx)).toEqual({ mark: "range", ok: false, refusal: "There is nothing to draw: the analysis gave no rows." });
    expect(bridgeFigures([], UNIT, ctx)).toEqual({ mark: "bridge", ok: false, refusal: "There is nothing to draw: the analysis gave no rows." });
    expect(rangeFigures([R("A", 2, 1, 3)], UNIT, ctx)).toMatchObject({ mark: "range", ok: true });
  });
  it("refuses, in words, what it cannot draw honestly", () => {
    const words = (t: TableRow[]) => {
      const f = rangeFigures(t, UNIT, ctx);
      return f.ok ? null : f.refusal;
    };
    expect(words([])).toBe("There is nothing to draw: the analysis gave no rows.");
    expect(words([R("A", 1, 3, 2)])).toBe("Not drawn: the range of A has its low end above its high end.");
    expect(words([R("A", 5, 1, 3)])).toBe("Not drawn: the middle value of A lies outside its range.");
    expect(words([R("A", 0, 1, 3)])).toBe("Not drawn: the middle value of A lies outside its range.");
    for (const bad of [NaN, Infinity, -Infinity, null]) {
      expect(words([R("A", 2, bad, 3)]), `low ${bad}`).toBe("Not drawn: A has a value that is not a number.");
      expect(words([R("A", 2, 1, bad)]), `high ${bad}`).toBe("Not drawn: A has a value that is not a number.");
    }
    expect(words([R("A", NaN, 1, 3)])).toBe("Not drawn: A has a value that is not a number.");
    expect(words([{ label: "A", value: 2 }])).toBe("Not drawn: A has a value that is not a number.");
    const many = (n: number) => Array.from({ length: n }, (_, i) => R(`R${i}`, 2, 1, 3));
    expect(words(many(MARK_ROWS))).toBeNull();
    expect(words(many(MARK_ROWS + 1))).toBe("Not drawn: 13 rows are more than the 12 that read clearly in a chart.");
  });
  it("accepts a middle value at either end", () => {
    expect(rangeFigures([R("A", 1, 1, 3), R("B", 3, 1, 3)], UNIT, ctx).ok).toBe(true);
  });
});

describe("bridgeFigures", () => {
  const T = (label: string, value: number, role: TableRow["role"], extra: Partial<TableRow> = {}): TableRow => ({ label, value, role, ...extra });
  const GOOD: TableRow[] = [T("February 2025", 100, "start"), T("Austria", 35, "part"), T("Germany", -10, "part"), T("Not in these parts", -5, "rest"), T("March 2025", 120, "end")];
  it("writes each part with its sign, draws a down part the other way, and keeps the numbers the table gave", () => {
    const f = bridgeFigures(GOOD, UNIT, ctx);
    expect(f).toMatchObject({ mark: "bridge", ok: true, notes: [] });
    expect(f.ok && f.steps).toEqual([
      { kind: "start", label: "February 2025", value: 100, text: "100 €", from: 0, to: 100, direction: "level" },
      { kind: "part", label: "Austria", value: 35, text: "+35 €", from: 100, to: 135, direction: "up" },
      { kind: "part", label: "Germany", value: -10, text: "−10 €", from: 135, to: 125, direction: "down" },
      { kind: "rest", label: "Not in these parts", value: -5, text: "−5 €", from: 125, to: 120, direction: "down" },
      { kind: "end", label: "March 2025", value: 120, text: "120 €", from: 0, to: 120, direction: "level" },
    ]);
    expect(f.ok && f.alt).toBe("From February 2025 100 € to March 2025 120 €: Austria +35 €, Germany −10 €, Not in these parts −5 €.");
  });
  it("draws a part of 0, written as 0", () => {
    const f = bridgeFigures([T("A", 10, "start"), T("Same", 0, "part"), T("B", 10, "end")], UNIT, ctx);
    expect(f.ok && f.steps[1]).toMatchObject({ text: "0 €", direction: "flat", from: 10, to: 10 });
  });
  it("never writes a change that is not 0 as 0: the digits widen for every part", () => {
    const f = bridgeFigures([T("A", 1000.4, "start"), T("Up", 0.4, "part"), T("Down", -0.2, "part"), T("B", 1000.6, "end")], UNIT, ctx);
    expect(f.ok && f.steps.map((s) => s.text)).toEqual(["1,000.4 €", "+0.4 €", "−0.2 €", "1,000.6 €"]);
    const tiny = bridgeFigures([T("A", 1, "start"), T("Up", 0.00004, "part"), T("B", 1.00004, "end")], UNIT, ctx);
    expect(tiny.ok && tiny.steps[1].text).toBe("+0.00004 €");
    // A plain number has two decimals to begin with.
    const plain = bridgeFigures(GOOD, null, ctx);
    expect(plain.ok && plain.steps[1].text).toBe("+35.00");
  });
  it("names a part that had no value in one of the two periods, in the Method's own words", () => {
    const f = bridgeFigures([T("A", 10, "start"), T("Germany", 5, "part", { missing: "appeared" }), T("Austria", -3, "part", { missing: "gone" }), T("Rest", 0, "part"), T("B", 12, "end")], UNIT, ctx);
    expect(f.ok && f.notes).toEqual(["Germany and Austria had no value in one of the two periods; a missing value counts as 0."]);
    expect(f.ok && f.steps.map((s) => s.missing)).toEqual([undefined, "appeared", "gone", undefined, undefined]);
    expect(f.ok && f.alt).toBe("From A 10 € to B 12 €: Germany +5 €, Austria −3 €, Rest 0 €. Germany and Austria had no value in one of the two periods; a missing value counts as 0.");
    const none = bridgeFigures(GOOD, UNIT, ctx);
    expect(none.ok && none.notes).toEqual([]);
  });
  it("widens for the change the parts add up to, which no part shows alone", () => {
    const f = bridgeFigures([T("A", 5000, "start"), T("Up", 100.0001, "part"), T("Down", -100, "part"), T("B", 5000.0001, "end")], UNIT, ctx);
    expect(f.ok && f.steps.map((s) => s.text)).toEqual(["5,000.0000 €", "+100.0001 €", "−100.0000 €", "5,000.0001 €"]);
  });
  it("says no change in words when there are no parts to name", () => {
    const f = bridgeFigures([T("A", 10, "start"), T("B", 10, "end")], UNIT, ctx);
    expect(f.ok && f.alt).toBe("From A 10 € to B 10 €: no change.");
  });
  it("refuses, in words, a table it cannot draw honestly", () => {
    const words = (t: TableRow[]) => {
      const f = bridgeFigures(t, UNIT, ctx);
      return f.ok ? null : f.refusal;
    };
    expect(words([])).toBe("There is nothing to draw: the analysis gave no rows.");
    expect(words([T("A", 1, "start"), T("B", 1, "part")])).toBe("Not drawn: the rows do not hold a start and an end.");
    expect(words([T("A", 1, "part"), T("B", 1, "end")])).toBe("Not drawn: the rows do not hold a start and an end.");
    expect(words([T("A", 1, "start"), T("X", 1, "end"), T("B", 1, "end")])).toBe("Not drawn: the rows do not hold a start and an end.");
    expect(words([T("A", 1, "start"), { label: "X", value: 1 }, T("B", 1, "end")])).toBe("Not drawn: the rows do not hold a start and an end.");
    for (const bad of [NaN, Infinity, null]) expect(words([T("A", 1, "start"), T("Germany", bad as number, "part"), T("B", 1, "end")])).toBe("Not drawn: Germany has a value that is not a number.");
    expect(words([T("A", 1, "start"), ...Array.from({ length: MARK_ROWS - 1 }, (_, i) => T(`P${i}`, 1, "part")), T("B", 1, "end")])).toBe("Not drawn: 13 rows are more than the 12 that read clearly in a chart.");
    expect(words([T("A", 1, "start"), ...Array.from({ length: MARK_ROWS - 2 }, (_, i) => T(`P${i}`, 1, "part")), T("B", 1, "end")])).toBeNull();
  });
  it("is deterministic, and its numbers are the table's (property)", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.array(fc.double({ min: -1e4, max: 1e4, noNaN: true }), { minLength: 1, maxLength: 8 }), (start, parts) => {
        const table = [T("S", start, "start"), ...parts.map((p, i) => T(`P${i}`, p, "part")), T("E", start, "end")];
        const a = bridgeFigures(table, UNIT, ctx);
        expect(bridgeFigures(table, UNIT, ctx)).toEqual(a);
        // A number too small to write out in full is refused in words, never written as 0.
        if (!a.ok) {
          expect(a.refusal).toBe("Not drawn: some numbers are too small to write out in full.");
          return;
        }
        a.steps.forEach((s, i) => expect(s.value).toBe(table[i].value));
        // A part is never written without its sign and a down part never with a plus; a non-zero is never written as zero.
        a.steps.slice(1, -1).forEach((s) => {
          if (s.value > 0) expect(s.text.startsWith("+")).toBe(true);
          if (s.value < 0) expect(s.text.startsWith("−")).toBe(true);
          if (s.value !== 0) expect(s.text).not.toMatch(/^[+−]?0(\.0+)? €$/);
        });
      }),
      { numRuns: 200 },
    );
  });
});

// ---- the files ----
const slotsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `S${i + 1}` }));
const OK_RECIPE = { format: ANALYSIS_FORMAT_2, name: "t", slots: slotsOf(3), steps: [{ id: "br", fn: "bridge", of: "slot1", parts: ["slot2", "slot3"] }, { id: "m", fn: "fit", of: "slot1", drivers: ["slot2", "slot3"] }, { id: "e", fn: "effects", of: "m" }], outputs: [{ step: "br", label: "What changed", shows: "table" }, { step: "e", label: "Effects", shows: "table" }] };
const text = (v: unknown) => JSON.stringify(v, null, 2);
const withStep = (i: number, patch: Record<string, unknown>) => text({ ...OK_RECIPE, steps: OK_RECIPE.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
const lineAt = (file: string, marker: string, last = false) => file.slice(0, last ? file.lastIndexOf(marker) : file.indexOf(marker)).split("\n").length;
const ajv = new Ajv2020({ strict: false }).compile(ANALYSIS_RECIPE_SCHEMA_2 as object);
// A problem with a step as a whole (a missing field) is named on the line that opens the step, one above its first field.
const above = (name: string) => (/without parts$/.test(name) ? 1 : 0);

describe("a recipe with a bridge and effects", () => {
  it("passes the checks, with the new functions' kinds", () => {
    const res = checkAnalysisRecipe(text(OK_RECIPE));
    expect(res.ok ? [] : res.problems).toEqual([]);
    expect([FUNCTIONS_2.bridge.gives, FUNCTIONS_2.effects.gives, FUNCTIONS_2.effects.of, FUNCTIONS_2.bridge.of]).toEqual(["table", "table", "model", "series"]);
  });
  const HOSTILE: [string, string, string, string, "schema" | "meaning"][] = [
    ["a bridge without parts", text({ ...OK_RECIPE, steps: [{ id: "br", fn: "bridge", of: "slot1" }, ...OK_RECIPE.steps.slice(1)] }), "needs the field “parts”", '"id": "br"', "schema"],
    ["a bridge with no parts", withStep(0, { parts: [] }), "must not be empty", "[]", "schema"],
    ["a bridge with seven parts", withStep(0, { parts: ["slot2", "slot3", "slot4", "a", "b", "c", "d"] }), "has 7 entries; at most 6 are allowed", '"parts"', "schema"],
    ["a part named twice", withStep(0, { parts: ["slot2", "slot2"] }), "“slot2” is listed twice", '"parts"', "schema"],
    ["parts as a text", withStep(0, { parts: "slot2" }), "must be a list, not a text", '"slot2"', "schema"],
    ["a part by a Metric's name", withStep(0, { parts: ["metric:revenue"] }), "a Slot (slot1 to slot4) or the id of an earlier step", '"metric:revenue"', "schema"],
    ["a weight a bridge does not take", withStep(0, { weights: [1, -1] }), "is not a field here", '"weights"', "schema"],
    ["parts on a step that takes none", withStep(2, { parts: ["slot2"] }), "is not a field here", '"parts"', "schema"],
    ["a driver on an effects step", withStep(2, { drivers: ["slot2"] }), "is not a field here", '"drivers"', "schema"],
    ["a whole listed among its parts", withStep(0, { parts: ["slot1", "slot2"] }), "lists “slot1”, which is the whole", '"parts"', "meaning"],
    ["a part that is a step, not a Slot", text({ ...OK_RECIPE, slots: slotsOf(3), steps: [{ id: "chg", fn: "changes", of: "slot2" }, { id: "br", fn: "bridge", of: "slot1", parts: ["chg"] }], outputs: [{ step: "br", label: "x", shows: "table" }] }), "A bridge is worked out from Slots only", '"parts"', "meaning"],
    ["a whole that is a step, not a Slot", text({ ...OK_RECIPE, steps: [{ id: "chg", fn: "changes", of: "slot2" }, { id: "br", fn: "bridge", of: "chg", parts: ["slot3"] }], outputs: [{ step: "br", label: "x", shows: "table" }] }), "A bridge is worked out from Slots only", '"parts"', "meaning"],
    ["a part that gives a value", text({ ...OK_RECIPE, steps: [{ id: "mean", fn: "mean", of: "slot2" }, { id: "br", fn: "bridge", of: "slot1", parts: ["mean"] }], outputs: [{ step: "br", label: "x", shows: "table" }] }), "“mean” gives one value; bridge needs a series", '"mean"', "meaning"],
    ["a Slot it does not have", withStep(0, { parts: ["slot4"] }), "“slot4” is neither a Slot of this recipe nor an earlier step", '"slot4"', "meaning"],
    ["effects of a series", withStep(2, { of: "slot2" }), "“slot2” gives a series; effects needs a fit", '"of": "slot2"', "meaning"],
    ["effects of a table", withStep(2, { of: "br" }), "“br” gives a table; effects needs a fit", '"of": "br"', "meaning"],
    ["a bridge shown as a series", text({ ...OK_RECIPE, outputs: [{ step: "br", label: "x", shows: "series", unit: "metric" }] }), "“br” gives a table, not a series", '"series"', "meaning"],
    ["a unit on the table of a bridge", text({ ...OK_RECIPE, outputs: [{ step: "br", label: "x", shows: "table", unit: "metric" }] }), "is for a series or one value, not a table", '"unit"', "meaning"],
    ["a Takeaway of a bridge", text({ ...OK_RECIPE, outputs: [{ step: "br", label: "x", shows: "takeaway" }] }), "bridge has no Takeaway", '"takeaway"', "meaning"],
    ["a Takeaway of effects", text({ ...OK_RECIPE, outputs: [{ step: "e", label: "x", shows: "takeaway" }] }), "effects has no Takeaway", '"takeaway"', "meaning"],
    ["a title on a bridge's table", text({ ...OK_RECIPE, outputs: [{ step: "br", label: "x", shows: "table", title: "t" }] }), "is for a Takeaway", '"title"', "meaning"],
    ["HTML in a label", text({ ...OK_RECIPE, outputs: [{ step: "br", label: "<b>x</b>", shows: "table" }] }), "without markup or web addresses", "<b>", "schema"],
  ];
  it.each(HOSTILE)("refuses %s, at its line", (name, file, message, marker) => {
    const res = checkAnalysisRecipe(file);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.problems.map((p) => p.message).join(" | ")).toContain(message);
    expect(res.problems.find((p) => p.message.includes(message))?.line).toBe(lineAt(file, marker, /takes none|effects step|gives a value/.test(name)) - above(name) + (/named twice/.test(name) ? 2 : 0));
  });
  it("is refused by a second validator wherever the schema can say so", () => {
    for (const [name, file, , , kind] of HOSTILE) {
      if (kind === "meaning") expect(ajv(JSON.parse(file)), `${name}: only the checks can say it`).toBeTruthy();
      else expect(ajv(JSON.parse(file)), name).toBe(false);
    }
  });
  it("holds the parts to the inputs it names: 40 inputs in all, one step either side", () => {
    const bridges = (n: number) => ({ ...OK_RECIPE, steps: Array.from({ length: n }, (_, i) => ({ id: `b${i}`, fn: "bridge", of: "slot1", parts: ["slot2", "slot3", "slot4"] })), outputs: [{ step: "b0", label: "x", shows: "table" }], slots: slotsOf(4) });
    // 4 inputs a step (the whole and 3 parts): ten steps are exactly 40, which the limit allows.
    expect(checkAnalysisRecipe(text(bridges(10))).ok).toBe(true);
    const over = checkAnalysisRecipe(text({ ...bridges(10), steps: [...bridges(10).steps, { id: "g", fn: "growth", of: "slot1" }] }));
    expect(over.ok).toBe(false);
    expect(!over.ok && over.problems.map((p) => p.message).join()).toContain("name 41 inputs in all");
  });
  it("round trips with the parts in the format's order", () => {
    const res = checkAnalysisRecipe(text(OK_RECIPE));
    expect(res.ok).toBe(true);
  });
});

// ---- the marks in a design ----
const RECIPE: AnalysisRecipe2 = {
  format: ANALYSIS_FORMAT_2,
  name: "What changed",
  slots: [{ label: "Revenue" }, { label: "Orders" }, { label: "Cost" }, { label: "Churn" }],
  steps: [{ id: "br", fn: "bridge", of: "slot1", parts: ["slot2", "slot3"] }, { id: "m", fn: "fit", of: "slot1", drivers: ["slot2", "slot3", "slot4"] }, { id: "ef", fn: "effects", of: "m" }, { id: "lags", fn: "laggedCorrelation", of: "slot1", with: "slot2", maxLag: 2 }],
  outputs: [{ step: "br", label: "What changed", shows: "table" }, { step: "ef", label: "Effects", shows: "table" }, { step: "lags", label: "By delay", shows: "table" }],
};
const DESIGN: ViewDesign = {
  ...EXAMPLE,
  name: "What changed",
  kind: "analysis",
  slots: [{ label: "Revenue", metrics: "one" }, { label: "Orders", metrics: "one" }, { label: "Cost", metrics: "one" }, { label: "Churn", metrics: "one" }],
  analysis: RECIPE,
  parts: [{ mark: "bridge", show: "recipe.br" }, { mark: "group", direction: "column", parts: [{ mark: "range", show: "recipe.ef", tone: "accent" }] }],
};
const withParts = (parts: unknown[]) => text({ ...DESIGN, parts });
const designProblems = (file: string) => {
  const res = checkViewDesign(file);
  return res.ok ? null : res.problems;
};

describe("a design that draws a bridge and a range", () => {
  it("passes the checks and is written back as it was", () => {
    const res = checkViewDesign(text(DESIGN));
    expect(res.ok ? [] : res.problems).toEqual([]);
    const written = writeViewDesign(DESIGN);
    const again = checkViewDesign(written);
    expect(again.ok && writeViewDesign(again.design)).toBe(written);
    const plot = { mark: "plot", axes: "regular", scale: "padded", marks: [{ mark: "line", show: "forecast", dash: true }, { mark: "range", show: "forecast.range", centre: true, tone: "muted" }] };
    expect(checkViewDesign(text({ ...EXAMPLE, parts: [plot] })).ok).toBe(true);
    expect(writeViewDesign({ ...EXAMPLE, parts: [plot as never] })).toContain('"centre": true');
  });
  it("names the tables its marks draw, in order", () => {
    expect(drawnTables(DESIGN)).toEqual([{ step: "br", mark: "bridge" }, { step: "ef", mark: "range" }]);
    expect(drawnTables(EXAMPLE)).toEqual([]);
  });
  const CASES: [string, unknown[], string, string][] = [
    ["a range of a bridge's table", [{ mark: "range", show: "recipe.br" }], "“recipe.br” is the table of bridge; a range mark draws the table of effects.", '"recipe.br"'],
    ["a bridge of the effects table", [{ mark: "bridge", show: "recipe.ef" }], "“recipe.ef” is the table of effects; a bridge mark draws the table of bridge.", '"recipe.ef"'],
    ["a bridge of a lag table", [{ mark: "bridge", show: "recipe.lags" }], "“recipe.lags” is the table of laggedCorrelation; a bridge mark draws the table of bridge.", '"recipe.lags"'],
    ["a range of nothing", [{ mark: "range", show: "recipe.nothing" }], "“nothing” is not an output of the design's analysis.", '"recipe.nothing"'],
    ["a bridge of a model", [{ mark: "bridge", show: "recipe.m" }], "“m” is not an output of the design's analysis.", '"recipe.m"'],
    ["a range with a computed value", [{ mark: "range", show: "values" }], "“recipe.” and a step of the design's analysis", '"values"'],
    ["a range with markup", [{ mark: "range", show: "recipe.<b>" }], "“recipe.” and a step of the design's analysis", '"recipe.<b>"'],
    ["a bridge with a colour", [{ mark: "bridge", show: "recipe.br", tone: "bad" }], "is not a field here", '"tone"'],
    ["a range with a colour of its own", [{ mark: "range", show: "recipe.ef", tone: "#ff0000" }], "must be one of “data”", "#ff0000"],
    ["a bridge with a limit", [{ mark: "bridge", show: "recipe.br", limit: 99 }], "is not a field here", '"limit"'],
    ["a bridge with a style", [{ mark: "bridge", show: "recipe.br", css: "x" }], "is not a field here", '"css"'],
    ["a range with a prototype key", [{ mark: "range", show: "recipe.ef", __proto__: { x: 1 } }, { mark: "range", constructor: 1, show: "recipe.ef" }], "is not a field here", "constructor"],
    ["a line of a table", [{ mark: "plot", axes: "none", marks: [{ mark: "line", show: "recipe.br" }] }], "“recipe.br” is a table, a fit or a Takeaway, or has no unit; marks draw a series or one value.", '"recipe.br"'],
    ["a plot range of a recipe", [{ mark: "plot", axes: "none", marks: [{ mark: "range", show: "recipe.ef" }] }], "must be “forecast.range”", '"recipe.ef"'],
    ["a plot range with a text for centre", [{ mark: "plot", axes: "none", marks: [{ mark: "range", show: "forecast.range", centre: "yes" }] }], "must be true or false", '"yes"'],
    ["a range of a table in a design with no analysis", [{ mark: "range", show: "recipe.ef" }], "but the design has no analysis", '"recipe.ef"'],
  ];
  it.each(CASES)("refuses %s", (name, parts, message, marker) => {
    const file = name.includes("no analysis") ? text({ ...DESIGN, analysis: undefined, parts }) : withParts(parts);
    const problems = designProblems(file);
    expect(problems, "refused").not.toBeNull();
    expect(problems!.map((p) => p.message).join(" | ")).toContain(message);
    expect(problems!.find((p) => p.message.includes(message))?.line).toBe(lineAt(file, marker));
  });
  it("refuses a table of a recipe in the first format, and a table that is not an output", () => {
    const one = text({ ...DESIGN, analysis: { format: "ziffr.analysis/1", name: "x", slots: [{ label: "A" }], steps: [{ id: "avg", fn: "mean", of: "slot1" }], outputs: [{ step: "avg", label: "a", unit: "metric" }] }, parts: [{ mark: "bridge", show: "recipe.avg" }] });
    expect(designProblems(one)!.map((p) => p.message).join()).toContain("“recipe.avg” is not a table; a bridge mark draws the table of bridge.");
    const series = text({ ...DESIGN, analysis: { ...RECIPE, outputs: [{ step: "br", label: "a", shows: "table" }, { step: "m", label: "m", shows: "takeaway" }] }, parts: [{ mark: "range", show: "recipe.m" }] });
    expect(designProblems(series)!.map((p) => p.message).join()).toContain("“recipe.m” is not a table; a range mark draws the table of effects.");
  });
  it("is refused by a second validator wherever the schema can say so", () => {
    const v = new Ajv2020({ strict: false, allErrors: true }).compile(VIEW_DESIGN_SCHEMA as object);
    expect(v(JSON.parse(text(DESIGN)))).toBe(true);
    for (const [name, parts, , marker] of CASES) {
      if (/schema/.test(name)) continue;
      const file = withParts(parts);
      const ok = v(JSON.parse(file));
      // Only the checks can say which step a table is the table of; every other case is the schema's too.
      if (/bridge's table|effects table|lag table|nothing|model|no analysis|table of a|a table$/.test(name) || marker === '"recipe.br"' || marker === '"recipe.ef"' || marker === '"recipe.lags"' || marker === '"recipe.m"' || marker === '"recipe.nothing"') continue;
      expect(ok, name).toBe(false);
    }
  });
});

// ---- the same number everywhere ----
const data = { ...sampleCanvasData("v", "1.234,5"), today: "2026-06-20" };
const metrics = data.metrics.slice(0, 4);
const series = (m: (typeof metrics)[number], d = data) => shownSeries(m, d, undefined, {}).points.map((p) => ({ period: p.period, value: p.value }));

describe("the number drawn is the number the Method gave", () => {
  const figures = (d = data, settings = {}) => drawRecipe(DESIGN, metrics, d, settings);
  it("draws only the tables its marks name, and the steps they need", () => {
    expect(drawnPart(RECIPE, ["br", "ef"]).steps.map((s) => s.id)).toEqual(["br", "m", "ef"]);
    expect(drawnPart(RECIPE, ["br"]).steps.map((s) => s.id)).toEqual(["br"]);
    expect(drawnPart(RECIPE).outputs).toEqual([]);
    // A name that is not a table output of the recipe is ignored.
    expect(drawnPart(RECIPE, ["m", "nothing"]).outputs).toEqual([]);
    expect(Object.keys(figures().figures)).toEqual(["br", "ef"]);
  });
  it("writes a bridge's parts as the bridge Method's Takeaway writes them", () => {
    const [rev, ord, cost] = metrics;
    const got = figures().figures.br;
    expect(got.ok).toBe(true);
    if (!got.ok || got.mark !== "bridge") return;
    // The Takeaway is worked out here from the Slots' series and the two periods, by the test, not read back from the mark.
    const [a, b] = series(rev).slice(-2);
    const pick = (s: Point[], p: string) => s.find((x) => x.period === p)?.value ?? null;
    const parts = [ord, cost].map((m) => ({ label: m.name, before: pick(series(m), a.period), after: pick(series(m), b.period) }));
    const take = bridgeTakeaway(rev.name, parts, rev, { style: data.numberStyle }, { before: a.value, after: b.value });
    const partSteps = got.steps.filter((s) => s.kind === "part");
    for (const s of partSteps) expect(take.numbers.find((n) => n.label === s.label)?.text, s.label).toBe(s.text);
    // The whole's change is the start and the end, and the parts and what they leave out add up to it exactly.
    expect(got.steps[0].value).toBe(a.value);
    expect(got.steps[got.steps.length - 1].value).toBe(b.value);
    const sum = got.steps.slice(1, -1).reduce((t, s) => plusExact(t, exactOf(s.value)), ZERO);
    expect(Math.abs(nearestDoubleOf(sum) - (b.value - a.value))).toBeLessThan(1e-9 * Math.max(1, Math.abs(b.value)));
    expect(got.alt).toContain(got.steps[0].text);
  });
  it("is the same in a widget, a Snapshot, a View Link and a deck", () => {
    const live = figures();
    // A Snapshot of the latest period: the data as of that day, as a Snapshot keeps it, with the widget's asOf.
    const last = series(metrics[0]).at(-1)!.period;
    const day = data.metrics.length ? "2026-06-30" : last;
    const snapshot = drawRecipe(DESIGN, metrics, dataAsOf(data, day), { asOf: day });
    // A View Link carries only the widget's own Metrics, nothing else of the Workspace.
    const link = { ...data, metrics, series: Object.fromEntries(metrics.map((m) => [m.slug, data.series[m.slug]])) };
    expect(drawRecipe(DESIGN, metrics, link, {})).toEqual(live);
    // A deck draws the widget as the app draws it (a picture of it): the design is not left out for PowerPoint's own charts.
    expect(nativeForm(DESIGN, {})).toBe("picture");
    expect(nativeForm({ ...DESIGN, parts: [{ mark: "plot", axes: "regular", scale: "padded", marks: [{ mark: "line", show: "values" }, { mark: "range", show: "forecast.range" }] }] }, {})).toBe("picture");
    expect(nativeForm({ ...DESIGN, parts: [{ mark: "plot", axes: "regular", scale: "padded", marks: [{ mark: "line", show: "values" }, { mark: "area", show: "forecast.range" }] }] }, {})).toBe("line");
    expect(JSON.stringify(snapshot.figures)).toBe(JSON.stringify(drawRecipe(DESIGN, metrics, dataAsOf(data, day), { asOf: day }).figures));
    // A Snapshot of an earlier day says what changed up to then, not what changed since: a different pair of periods.
    const earlier = drawRecipe(DESIGN, metrics, dataAsOf(data, "2026-03-31"), { asOf: "2026-03-31" }).figures.br;
    expect(earlier.ok && live.figures.br.ok && earlier.alt !== live.figures.br.alt).toBe(true);
  });
  it("does not read a Metric the Slots did not give: a missing Slot is a gap, never the next Metric moved up", () => {
    const live = figures().figures.br;
    const gap = drawRecipe(DESIGN, [metrics[0], undefined as never, metrics[2]], data, {}).figures.br;
    expect(gap.ok && live.ok).toBe(true);
    if (!gap.ok || !live.ok || gap.mark !== "bridge" || live.mark !== "bridge") return;
    // The Metric in the third Slot is still the third: its part is what it was; the empty Slot's part is 0, with nothing said about a value it never had.
    const part = (f: typeof gap, label: string) => f.steps.find((s) => s.label === label);
    expect(part(gap, metrics[2].name)?.text).toBe(part(live, metrics[2].name)?.text);
    expect(part(gap, "Orders")).toMatchObject({ value: 0, text: "0 €", direction: "flat" });
    expect(part(gap, "Orders")?.missing).toBeUndefined();
  });
  it("refuses in words when the page has spent its share, and charges the budget", () => {
    const budget = newRecipeBudget();
    const first = drawRecipe(DESIGN, metrics, data, {}, budget);
    expect(first.refusal).toBeNull();
    expect(budget.left).toBeLessThan(50_000);
    expect(drawRecipe(DESIGN, metrics, data, {}, { left: 0 })).toMatchObject({ results: null, figures: {}, refusal: expect.stringContaining("Too much analysis on this page") });
  });
  it("says why a table is not drawn, in words, when the recipe has nothing to draw", () => {
    const short = { ...data, series: Object.fromEntries(Object.entries(data.series).map(([k, v]) => [k, v.slice(0, 1)])) };
    const got = drawRecipe(DESIGN, metrics, short, {}).figures;
    expect(got.br).toEqual({ mark: "bridge", ok: false, refusal: `${metrics[0].name} needs a value in two periods that follow one another to draw what changed.` });
    expect(got.ef.ok).toBe(false);
    for (const f of Object.values(got)) expect(f.ok ? "" : f.refusal).not.toMatch(FORBIDDEN);
  });
  it("leaves a recipe in the first format with no figures", () => {
    const old = { ...DESIGN, analysis: { format: "ziffr.analysis/1" as const, name: "x", slots: [{ label: "A" }], steps: [{ id: "avg", fn: "mean" as const, of: "slot1" }], outputs: [{ step: "avg", label: "a", unit: "metric" as const }] }, parts: [{ mark: "text" as const, content: [{ show: "recipe.avg" as const }] }] };
    expect(drawRecipe(old, metrics, data, {}).figures).toEqual({});
  });
});
