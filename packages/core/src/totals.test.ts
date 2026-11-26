// Totals (spec 0058, "Team totals"; GLOSSARY: Total) against the reference on generated parts, then worked by hand:
// parts that join and leave, a missing value, who is given a period, targets added up, longer periods, formulas that
// read a Total, and that nothing is worked out for a reader nobody named.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { shownSeries, resolverFrom, valueOver } from "./display-periods";
import { checkFormula, inputsProblem } from "./formula";
import { treeFromData } from "./formula-tree";
import { buildSeries } from "./series";
import { shownData } from "./view-links";
import { canvas, metric, months } from "./test/fixtures";
import { runs, valueText } from "./test/reference/check";
import { isNearestDouble } from "./test/reference/exact";
import { referenceTotal, referenceTotalTargets, type ReferencePart } from "./test/reference/totals";
import { whatIfRecipe } from "./takeaways/what-if-takeaway";
import { countedParts, mayShow, restsOnTotal, totalUnapproved, type TotalPart, type TotalsRead } from "./totals";
import type { Metric, Observation, Point } from "./types";

const { numRuns, seed } = runs();
const PERIODS = months("2026-01", [0, 0, 0, 0, 0, 0]).map((p) => p.period);

const ana = metric({ id: 1, slug: "ana", name: "Commit, Ana", aggregation: "last", target_min: 100, target_max: null });
const ben = metric({ id: 2, slug: "ben", name: "Commit, Ben", aggregation: "last", target_min: 50, target_max: null });
const eva = metric({ id: 3, slug: "eva", name: "Commit, Eva", aggregation: "last", target_min: null, target_max: null });
const total = (over: Partial<Metric> = {}, targets: "own" | "parts" = "own", open = false) =>
  metric({ id: 9, slug: "team", name: "Commit", aggregation: "last", target_min: null, target_max: null, formula: "{ana} {ben} {eva}", total: { targets, open }, ...over });
const PARTS: TotalPart[] = [{ part: 1, first: "2026-01-01", last: null }, { part: 2, first: "2026-01-01", last: "2026-03-01" }, { part: 3, first: "2026-03-01", last: null }];
const read = (seen: number[], over: Partial<TotalsRead> = {}): TotalsRead => ({ parts: { 9: PARTS }, sees: (id) => seen.includes(id), ...over });
const obs = (m: Metric, points: Point[]) => points.map((p) => ({ metric_id: m.id, period_start: p.period, value: p.value }) as Observation);
const VALUES = [...obs(ana, months("2026-01", [10, 11, 12, 13, 14])), ...obs(ben, months("2026-01", [1, 2, 3, 4])), ...obs(eva, months("2026-01", [900, 901, 5, 6]))];

describe("a Total against the reference", () => {
  const given = fc.array(
    fc.record({
      first: fc.nat({ max: 5 }), length: fc.option(fc.nat({ max: 5 }), { nil: null }), seen: fc.boolean(),
      values: fc.array(fc.tuple(fc.nat({ max: 5 }), valueText.map(Number)), { maxLength: 14 }),
      min: fc.option(valueText.map(Number), { nil: null }), max: fc.option(valueText.map(Number), { nil: null }),
      series: fc.array(fc.tuple(fc.nat({ max: 5 }), fc.oneof({ weight: 9, arbitrary: valueText.map(Number) }, { weight: 1, arbitrary: fc.constant(NaN) })), { maxLength: 6 }),
    }),
    { minLength: 1, maxLength: 4 },
  );
  it(`gives each reader the same periods, sums and added-up targets, open or not (${numRuns} totals, seed ${seed})`, () => {
    let compared = 0;
    fc.assert(
      fc.property(given, fc.boolean(), fc.boolean(), (raw, open, same) => {
        const parts: ReferencePart[] = raw.map((r) => ({
          first: PERIODS[r.first], last: r.length === null ? null : PERIODS[Math.min(5, r.first + r.length)], seen: r.seen,
          // With `same`, every part has a value in every period, so sums are compared often.
          values: same ? PERIODS.map((period, i) => ({ period, value: r.values[i]?.[1] ?? i })) : r.values.map(([at, value]) => ({ period: PERIODS[at], value })),
          min: r.min, max: same ? null : r.max, series: r.series.map(([at, value]) => ({ period: PERIODS[at], value })),
        }));
        const ms = parts.map((p, i) => metric({ id: i + 1, slug: `p${i}`, name: `P${i}`, target_min: p.min, target_max: p.max }));
        const t = total({ formula: ms.map((m) => `{${m.slug}}`).join(" ") }, "parts", open);
        const aims: Record<number, Point[]> = {};
        const targets = Object.fromEntries(parts.map((p, i) => [i + 1, p.series]));
        const reader: TotalsRead = { parts: { 9: parts.map((p, i) => ({ part: i + 1, first: p.first, last: p.last })) }, sees: (id) => parts[id - 1].seen, aims };
        const built = buildSeries([t, ...ms], parts.flatMap((p, i) => obs(ms[i], [...p.values])), targets, reader);
        for (const [got, want] of [[built.team, referenceTotal(parts, open)], [aims[9], referenceTotalTargets(parts, open)]] as const) {
          expect(got.map((p) => p.period)).toEqual(want.map((w) => w.period));
          got.forEach((p, i) => expect(isNearestDouble(p.value, want[i].value), `${p.period}: ${p.value}`).toBe(true));
          compared += got.length;
        }
      }),
      { numRuns: numRuns * 3, seed },
    );
    expect(compared).toBeGreaterThan(numRuns);
  });
});

describe("a Total worked by hand", () => {
  const all = [ana, ben, eva, total()];
  const values = (reader?: TotalsRead, metrics: Metric[] = all) => buildSeries(metrics, VALUES, {}, reader).team.map((p) => [p.period.slice(5, 7), p.value]);

  it("adds up the parts counting in each period: one that joins, one that leaves, and none where one is missing", () => {
    // Jan, Feb: Ana + Ben (Eva's earlier values do not count). Mar: all three. Apr: Ana + Eva. May: Eva is missing.
    expect(values(read([1, 2, 3]))).toEqual([["01", 11], ["02", 13], ["03", 20], ["04", 19]]);
    expect(countedParts(PARTS, "2026-03-01")).toEqual([1, 2, 3]);
    expect(countedParts(PARTS, "2025-12-01")).toEqual([]);
  });
  it("is given only for periods whose every counted part the reader sees, unless the Total is open", () => {
    expect(values(read([1, 2]))).toEqual([["01", 11], ["02", 13]]);
    expect(values(read([1, 3]))).toEqual([["04", 19]]);
    expect(values(read([]))).toEqual([]);
    expect(values(read([]), [ana, ben, eva, total({}, "own", true)])).toEqual([["01", 11], ["02", 13], ["03", 20], ["04", 19]]);
    expect([mayShow(true, [], () => true), mayShow(false, [], () => true), mayShow(true, [1], () => false), mayShow(false, [1], () => false)]).toEqual([false, false, true, false]);
  });
  it("has no value for a reader nobody named, nor has a formula that reads it", () => {
    const share = metric({ id: 10, slug: "share", formula: "{team} / {ana}", aggregation: "none" });
    const built = buildSeries([...all, share], VALUES, {});
    expect(built.team).toEqual([]);
    expect(built.share).toEqual([]);
  });
  it("has none while its inputs cannot be combined: a part counted by another period, or one its owner may not share", () => {
    expect(values(read([1, 2, 3]), [{ ...ana, period: "week" }, ben, eva, total()])).toEqual([]);
    expect(values(read([1, 2, 3]), [ana, ben, eva, total({ inputs_withheld: true })])).toEqual([]);
    // Nor does it hand back a target, whatever is stored under its own name.
    const aims: Record<number, Point[]> = {};
    const gap = metric({ id: 10, slug: "gap", formula: "target({team})", aggregation: "none" });
    expect(buildSeries([ana, ben, eva, total({ inputs_withheld: true }, "parts"), gap], VALUES, { 9: months("2026-01", [1, 1]) }, read([1, 2, 3], { aims })).gap).toEqual([]);
    expect(aims[9]).toEqual([]);
    // A part that is not among the Metrics, and a Total without parts, give nothing.
    expect(values(read([1, 2, 3]), [ana, ben, total()])).toEqual([["01", 11], ["02", 13]]);
    expect(buildSeries([total({ id: 8 })], VALUES, {}, read([1])).team).toEqual([]);
  });
  it("is read by a formula, which has a value exactly where the reader is given the Total's", () => {
    const share = metric({ id: 10, slug: "share", formula: "{team} - {ana}", aggregation: "none" });
    expect(inputsProblem(share, [...all, share])).toBeNull();
    expect(checkFormula("{team} - {ana}", [ana, total()])).toBeNull();
    expect(buildSeries([...all, share], VALUES, {}, read([1, 2])).share).toEqual([{ period: "2026-01-01", value: 1 }, { period: "2026-02-01", value: 2 }]);
  });
  it("takes its own target, or its parts' added up where each has one", () => {
    const gap = metric({ id: 10, slug: "gap", formula: "target({team}) - {team}", aggregation: "none" });
    const own = total({ target_min: 30 });
    expect(buildSeries([ana, ben, eva, own, gap], VALUES, {}, read([1, 2, 3])).gap.map((p) => p.value)).toEqual([19, 17, 10, 11]);
    const aims: Record<number, Point[]> = {};
    const added = buildSeries([ana, ben, eva, total({}, "parts"), gap], VALUES, { 3: [{ period: "2026-04-01", value: 7 }] }, read([1, 2, 3], { aims }));
    // Jan and Feb: 100 + 50. Mar: Eva has no target, so none. Apr: 100 + 7.
    expect(aims[9]).toEqual([{ period: "2026-01-01", value: 150 }, { period: "2026-02-01", value: 150 }, { period: "2026-04-01", value: 107 }]);
    expect(added.gap).toEqual([{ period: "2026-01-01", value: 139 }, { period: "2026-02-01", value: 137 }, { period: "2026-04-01", value: 88 }]);
    // A formula reads them also where the reader asked for none to be handed back, and a part that is not among the
    // Metrics adds nothing.
    expect(buildSeries([ana, ben, total({}, "parts"), gap], VALUES, {}, read([1, 2, 3])).gap.map((p) => p.value)).toEqual([139, 137]);
    // Without the Target Series, no target is added up.
    const unread: Record<number, Point[]> = {};
    buildSeries([ana, ben, eva, total({}, "parts")], VALUES, undefined, read([1, 2, 3], { aims: unread }));
    expect(unread[9]).toEqual([]);
  });
  it("combines over longer periods as a Metric does, from its own periods", () => {
    const t = total();
    const data = canvas(all, buildSeries(all, VALUES, {}, read([1, 2, 3])), { today: "2026-08-01" });
    const quarters = shownSeries(t, data, "quarter");
    expect(quarters.combined).toBe(true);
    // Last value: March's total, and April's for the second quarter, which holds one of its three months and is not counted.
    expect(quarters.points.map((p) => [p.period, p.value, p.held])).toEqual([["2026-01-01", 20, 3]]);
    expect(valueOver("team", "2026-01-01", "2026-02-01", resolverFrom(all, data.series, data), 2)).toBe(13);
    // Its parts need not be on the canvas for it.
    expect(shownSeries(t, canvas([t], { team: data.series.team }, { today: "2026-08-01" }), "quarter").points.map((p) => p.value)).toEqual([20]);
  });
  it("names the periods not approved yet: those in which a counted part's is open", () => {
    const shown = months("2026-01", [1, 1, 1, 1]);
    expect(totalUnapproved(PARTS, { 2: ["2026-02-01", "2026-04-01"], 3: ["2026-01-01"] }, shown)).toEqual(["2026-02-01"]);
  });
  it("is not drawn as a formula tree, and What if does not follow it", () => {
    const t = total();
    const data = canvas(all, buildSeries(all, VALUES, {}, read([1, 2, 3])));
    expect(treeFromData(t, data)).toEqual({ ok: false, refusal: "Not drawn: Commit is a Total, which adds up a list of Metrics and has no formula to draw." });
    const long = months("2024-01", Array.from({ length: 30 }, (_, i) => 10 + i));
    const series = { ana: long, team: long.map((p) => ({ ...p, value: p.value * 2 })) };
    const answer = whatIfRecipe(ana, { by: 1 }, [total({ formula: "{ana}" })], resolverFrom([ana, total({ formula: "{ana}" })], series), { yearStart: 1, ctx: { style: "1,234.5" } });
    expect(JSON.stringify(answer)).not.toContain("worked out from its formula");
  });
  it("goes out with no view, nor does a formula that reads it", () => {
    const share = metric({ id: 10, slug: "share", name: "Share", formula: "{team} - {ana}", aggregation: "none", reads_total: true });
    expect([total(), share, ana].map(restsOnTotal)).toEqual([true, true, false]);
    const series = buildSeries([...all, share], VALUES, {}, read([1, 2, 3]));
    const full = canvas([...all, share], series, { targets: { 9: months("2026-01", [5]), 10: months("2026-01", [5]), 1: months("2026-01", [5]) }, pending: { 9: ["2026-01-01"] } });
    const sent = shownData(full, new Set([1, 9, 10]), null);
    expect(Object.keys(sent.series)).toEqual(["ana"]);
    expect(Object.keys(sent.targets)).toEqual(["1"]);
    expect(sent.pending).toEqual({});
  });
});
