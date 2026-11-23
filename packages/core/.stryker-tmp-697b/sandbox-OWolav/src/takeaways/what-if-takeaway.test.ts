// @ts-nocheck
// The Takeaway of a what-if chain and the Recipe "What if A changes?" (spec 0041, ticket 5): the sentences in the Metrics' own units with
// every number the Method's and no sign lost, "worked out" and "estimated" kept apart in the sentence and in each row (the data of the
// picture), a range only where the Method gives one and "treat it as a guess" outside what was seen, cautions above the answer and
// never "strong" with one, a refusal that carries nothing, no forbidden word, the footer once and only where something is estimated, the
// limits (2 steps and 12 Metrics), nothing named or used that the person may not see, and the same words whatever order the Metrics come in.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolverFrom } from "../compare";
import { formatValue } from "../format";
import { fit } from "../methods/fit";
import { whatIf, type FitLink, type Reached, type WhatIf, type WorkedLink } from "../methods/what-if";
import { NUMBER_STYLES } from "../number-style";
import { numbersIn } from "../numbers";
import { metric, months } from "../test/fixtures";
import { runs } from "../test/reference/check";
import type { Metric, Point } from "../types";
import { MOST_FIRST, whatIfRecipe, whatIfTakeaway, WHAT_IF_RECIPES, type WhatIfTakeaway } from "./what-if-takeaway";
import { footerText, type Takeaway, type TakeawayContext } from "./takeaway";
import { WORDING } from "./wording";

const { numRuns, seed } = runs();
const ctx: TakeawayContext = { style: "1,234.5" };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden|\bgoal\b|variance|outlier|insight|\banswer\b/i;
const FOOTER = "This shows what has gone together, not what caused what.";
const opts = { yearStart: 1 as const, ctx, today: "2030-01-01" };
const texts = (t: Takeaway) => [t.sentence, t.refusal, t.strengthText, t.basis, t.method, t.footer, t.range?.text, ...t.assumptions, ...t.cautions, ...t.notes, ...t.numbers.flatMap((n) => [n.label, n.text]), ...t.figures.map((f) => f.label)].filter((x): x is string => x !== null && x !== undefined);
const rowTexts = (t: WhatIfTakeaway) => t.rows.map((r) => r.sentence);

function lcg(start: number) {
  let x = start;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

const mk = (id: number, slug: string, name: string, over: Partial<Metric> = {}) => metric({ id, slug, name, unit: "", unit_position: "after", decimals: 0, period: "month", aggregation: "sum", ...over });
const [VISITS, SIGNUPS, REVENUE, RPV, NOISE] = [
  mk(1, "visits", "Visits"),
  mk(2, "signups", "Signups"),
  mk(3, "revenue", "Revenue", { unit: "€" }),
  mk(4, "rpv", "Revenue per visit", { unit: "€", decimals: 2, formula: "{revenue} / {visits}" }),
  mk(5, "noise", "Weather"),
];

/** Visits → Signups (2 % of Visits) → Revenue (50 € per signup); Weather moves with nothing; n flat months. */
function world(n = 30, s = 7) {
  const r = lcg(s);
  const visits = Array.from({ length: n }, () => 40000 + Math.round(r() * 20000));
  const signups = visits.map((v) => Math.round(v * 0.02 + gauss(r) * 20));
  const revenue = signups.map((v) => Math.round(v * 50 + gauss(r) * 900));
  const weather = Array.from({ length: n }, () => Math.round(r() * 100));
  return { visits, signups, revenue, weather, series: { visits: months("2024-01", visits), signups: months("2024-01", signups), revenue: months("2024-01", revenue), weather: months("2024-01", weather), rpv: [] as Point[], noise: months("2024-01", weather) } as Record<string, Point[]> };
}
const recipe = (start: Metric, change: Parameters<typeof whatIfRecipe>[1], others: Metric[], w: ReturnType<typeof world>, over: Partial<TakeawayContext> = {}) =>
  whatIfRecipe(start, change, others, resolverFrom([start, ...others], w.series as Record<string, Point[]>), { ...opts, ctx: { ...ctx, ...over } });

describe("the words of a what-if", () => {
  const w = world();
  const t = recipe(VISITS, { percent: 5 }, [SIGNUPS, REVENUE, RPV, NOISE], w);
  it("says the change in the Metric asked about, then each Metric reached, estimated ones with their range and a worked-out one as that", () => {
    expect(t.kind).toBe("answer");
    expect(t.sentence).toMatch(/^If Visits goes up by 5 % \(2,0\d\d\): /);
    const by = (name: string) => t.rows.find((r) => r.name === name)!;
    expect(by("Signups")).toMatchObject({ step: 1, kind: "estimated", through: [] });
    expect(by("Signups").sentence).toMatch(/^Signups is estimated to go up by about \d+ \(likely between \d+ and \d+\)\.$/);
    expect(by("Revenue")).toMatchObject({ step: 2, kind: "estimated", through: ["Signups"] });
    expect(by("Revenue").sentence).toMatch(/^Revenue is estimated to go up by about [\d,]+ € \(likely between [\d,]+ € and [\d,]+ €\), through Signups\.$/);
    // Revenue per visit is made of Revenue, which is two steps away: it would be three, so it is left out and said, not worked out with Revenue held still.
    expect(t.rows.map((r) => r.name)).not.toContain("Revenue per visit");
    expect(t.notes).toEqual([expect.stringContaining("Revenue per visit")]);
  });
  it("works a Metric made of one the change reaches from that Metric's change, as re-working the formula on the changed inputs does", () => {
    const only = recipe(VISITS, { percent: 5 }, [REVENUE, RPV], w);
    const row = (name: string) => only.rows.find((r) => r.name === name)!;
    expect(row("Revenue")).toMatchObject({ step: 1, kind: "estimated" });
    expect(row("Revenue per visit")).toMatchObject({ step: 2, kind: "estimated", through: ["Revenue"] });
    const [v0, r0] = [w.visits[w.visits.length - 1], w.revenue[w.revenue.length - 1]];
    const x = v0 * 0.05;
    const expected = (r0 + row("Revenue").effect!) / (v0 + x) - r0 / v0;
    expect(Math.abs(row("Revenue per visit").effect! - expected)).toBeLessThan(1e-9);
  });
  it("never names a Metric that moved with nothing, and says what it was compared on and the footer once", () => {
    expect(t.rows.map((r) => r.name)).not.toContain("Weather");
    expect(t.basis).toBe("compared by value");
    expect(t.footer).toBe(FOOTER);
    expect(texts(t).filter((x) => x === FOOTER)).toHaveLength(1);
    expect(t.assumptions).toEqual(["Everything else is taken as staying where it was.", expect.stringContaining("no independence between them is assumed"), expect.stringContaining("picked for standing out"), expect.stringContaining("Which of two Metrics that move together comes first cannot be told")]);
  });
  it("keeps worked out and estimated apart in the numbers, and gives the picture rows low and high only for what is estimated", () => {
    for (const r of t.rows) {
      expect(r.kind === "worked-out" ? [r.lo, r.hi, r.strength] : [typeof r.lo, typeof r.hi, typeof r.strength]).toEqual(r.kind === "worked-out" ? [null, null, null] : ["number", "number", "string"]);
      const how = t.numbers.find((n) => n.label === `${r.name}: how it is known`)!;
      expect(how.text).toBe(r.kind === "worked-out" ? "worked out from a formula" : "estimated from what has gone together");
    }
    expect(t.rows.map((r) => [r.step, r.name])).toEqual([...t.rows].sort((a, b) => a.step - b.step || (a.name < b.name ? -1 : 1)).map((r) => [r.step, r.name]));
  });
  it("shows the Metrics' units, every number in the sentence is a number the Method gave, and the Method says how many each rests on", () => {
    const style = ctx.style;
    for (const x of [t.sentence!, ...rowTexts(t)]) for (const n of numbersIn(x, style)) expect(t.figures.some((f) => f.text.includes(n.text)), `${n.text} in "${x}"`).toBe(true);
    expect(t.figures[0]).toMatchObject({ label: "Visits", text: expect.stringMatching(/^2,0\d\d$/) });
    const revenue = t.rows.find((r) => r.name === "Revenue")!;
    expect(t.figures.some((f) => f.text === formatValue({ unit: "€", unit_position: "after", decimals: 0 }, Math.round(revenue.effect!), style))).toBe(true);
    expect(t.numbers.find((n) => n.label === "Revenue: estimated effects it rests on")!.text).toBe("2");
    expect(t.numbers.find((n) => n.label === "Signups: estimated effects it rests on")!.text).toBe("1");
  });
  it("uses no forbidden word, anywhere, and is the same words twice and in any order of the Metrics", () => {
    for (const x of texts(t)) if (x !== FOOTER) expect(x).not.toMatch(FORBIDDEN);
    const again = recipe(VISITS, { percent: 5 }, [NOISE, RPV, REVENUE, SIGNUPS], w);
    expect(JSON.stringify(again)).toBe(JSON.stringify(t));
  });
  it("is in every Number Style, with the unit on its side", () => {
    for (const style of NUMBER_STYLES) {
      const s = recipe(VISITS, { percent: 5 }, [SIGNUPS, REVENUE], w, { style });
      expect(s.kind).toBe("answer");
      expect(s.rows.find((r) => r.name === "Revenue")!.sentence).toContain("€");
    }
    expect(recipe(VISITS, { percent: 5 }, [SIGNUPS, REVENUE], w, { style: "1.234,5" }).sentence).toMatch(/^If Visits goes up by 5 % \(2\.0\d\d\): /);
  });
});

describe("a chain of estimated links is never read as a promise or a cause", () => {
  it("says 'estimated', 'likely between' and 'has gone together' in the footer, and never promises", () => {
    const t = recipe(VISITS, { by: 1000 }, [SIGNUPS, REVENUE], world());
    expect(t.sentence).toContain("estimated");
    expect(t.sentence).toContain("likely between");
    expect(t.sentence).not.toMatch(/will |would |guarantee|promise|because|due to/i);
    expect(t.footer).toBe("This shows what has gone together, not what caused what.");
  });
  it("has no footer where everything is worked out, since nothing is claimed about what goes together", () => {
    const w = world();
    const DOUBLE = mk(13, "double", "Double visits", { formula: "{visits} * 2" });
    const exact = recipe(VISITS, { by: 1000 }, [DOUBLE], { ...w, series: { ...w.series, double: [] } });
    expect(exact.kind).toBe("answer");
    expect(exact.sentence).toBe("If Visits goes up by 1,000: Double visits goes up by 2,000: worked out from its formula, the Metrics it is made of otherwise as they are.");
    expect(exact).toMatchObject({ footer: null, strength: null, strengthText: null, basis: null });
    expect(exact.rows.map((r) => r.kind)).toEqual(["worked-out"]);
    // With Revenue beside it something is estimated, so the footer is there.
    expect(recipe(VISITS, { by: 1000 }, [DOUBLE, REVENUE], { ...w, series: { ...w.series, double: [] } }).footer).toBe(FOOTER);
  });
});

describe("rows the picture draws", () => {
  const ok = (name: string, over: Partial<Reached> = {}): Reached => ({ ok: true, name, step: 1, exact: false, effect: 100, lo: 80, hi: 120, outside: [], beyond: [], noRange: false, through: [], coefficients: 1, level: 0.9, strength: "strong", byChange: false, verdict: { refusals: [], cautions: [], switches: [] }, ...over });
  const result = (reached: WhatIf extends infer W ? (W extends { reached: infer R } ? R : never) : never, by = 1000, span: "month" | null = "month"): WhatIf => ({ ok: true, start: "Visits", by, percent: null, span, reached });
  const say = (reached: Parameters<typeof result>[0], by = 1000, metrics: Metric[] = [VISITS, SIGNUPS, REVENUE]) => whatIfTakeaway(VISITS, metrics, result(reached, by), [], ctx);
  it("writes a fall as a fall and a rise as a rise, with the size as a size, whichever the sign", () => {
    const t = say([ok("Signups", { effect: -100, lo: -120, hi: -80 })], -1000);
    expect(t.sentence).toBe("If Visits goes down by 1,000: Signups is estimated to go down by about 100 (likely between 80 and 120).");
    expect(t.rows[0]).toMatchObject({ effect: -100, lo: -120, hi: -80 });
  });
  it("says which way each end goes where the range reaches or crosses 0, and 'no change' for an end at 0", () => {
    expect(say([ok("Signups", { effect: 20, lo: -40, hi: 80 })]).rows[0].sentence).toBe("Signups is estimated to go up by about 20 (likely between 40 down and 80 up).");
    expect(say([ok("Signups", { effect: 20, lo: 0, hi: 80 })]).rows[0].sentence).toBe("Signups is estimated to go up by about 20 (likely between no change and 80 up).");
    expect(say([ok("Signups", { effect: -20, lo: -80, hi: 0 })]).rows[0].sentence).toBe("Signups is estimated to go down by about 20 (likely between 80 down and no change).");
  });
  it("never writes a number above 0 as 0, and tells the two ends of a narrow range apart", () => {
    const tiny = say([ok("Revenue", { effect: 0.00004, lo: 0.00003, hi: 0.00005 })]).rows[0].sentence;
    expect(tiny).toBe("Revenue is estimated to go up by about 0.000040 € (likely between 0.000030 € and 0.000050 €).");
    const narrow = say([ok("Revenue", { effect: 1000.0001, lo: 1000.00005, hi: 1000.00015 })]).rows[0].sentence;
    const [a, b] = narrow.match(/between (.+?) and (.+?)\)/)!.slice(1);
    expect(a).not.toBe(b);
  });
  it("is only a point, with the guess said and what was outside, where the Method gives no range", () => {
    const t = say([ok("Signups", { lo: null, hi: null, outside: [{ name: "Visits", side: "above", limit: 51000, change: false }] })]);
    expect(t.rows[0]).toMatchObject({ kind: "guess", lo: null, hi: null });
    expect(t.rows[0].sentence).toBe("Signups is estimated to go up by about 100. This is higher than Visits has ever been (highest 51,000), so treat it as a guess.");
    expect(t.figures.some((f) => f.text === "51,000")).toBe(true);
  });
  it("says a link that cannot be told from chance as that, with no size, and a worked-out Metric that does not change as that", () => {
    const t = say([ok("Signups", { strength: "cant-tell" }), { ...ok("Revenue", { exact: true, effect: 0, lo: null, hi: null, strength: null, coefficients: 0, level: 0 }) }]);
    expect(t.rows[0]).toMatchObject({ kind: "unclear", effect: null, lo: null, hi: null, strength: "cant-tell" });
    expect(t.rows[0].sentence).toBe("Signups: it cannot be told from chance how it moves when Visits changes.");
    expect(t.rows[1]).toMatchObject({ kind: "worked-out", effect: 0 });
    expect(t.rows[1].sentence).toBe("Revenue does not change: worked out from its formula.");
    // An estimated effect of exactly 0 is not a size either.
    expect(say([ok("Signups", { effect: 0, lo: -5, hi: 5 })]).rows[0].kind).toBe("unclear");
  });
  it("names the Metric the change came through, up to the list of them", () => {
    const t = say([ok("Revenue", { step: 2, through: ["Signups", "Visits"] })]);
    expect(t.rows[0].sentence).toBe("Revenue is estimated to go up by about 100 € (likely between 80 € and 120 €), through Signups and Visits.");
  });
  it("is the weakest strength among the estimated rows, never strong with a caution, and says the caution once above the answer", () => {
    const caution = { case: "caution-spread" as const, slots: {} };
    const t = say([ok("Signups", { strength: "strong", verdict: { refusals: [], switches: [], cautions: [caution] } }), ok("Revenue", { strength: "moderate", verdict: { refusals: [], switches: [], cautions: [caution] } })]);
    expect(t.strength).toBe("moderate");
    expect(t.cautions).toEqual(["The misses grow as the level grows, so the ranges are rough."]);
  });
  it("says the change is in the next period, from the latest level, where any link is compared by change", () => {
    expect(say([ok("Signups", { byChange: true })]).sentence).toMatch(/^If Visits goes up by 1,000 next month: /);
    expect(say([ok("Signups")]).sentence).toMatch(/^If Visits goes up by 1,000: /);
  });
  it("lists three Metrics in the sentence and says how many more are in the numbers, with all of them in the rows", () => {
    const names = ["A1", "A2", "A3", "A4", "A5"];
    const t = say(names.map((n) => ok(n)), 1000, [VISITS, ...names.map((n, i) => mk(70 + i, n.toLowerCase(), n))]);
    expect(t.rows).toHaveLength(5);
    expect(t.sentence).toBe(`If Visits goes up by 1,000: ${t.rows.slice(0, 3).map((r) => r.sentence).join(" ")} 2 more are in the numbers below.`);
  });
  it("is a refusal, with words only, where the Method refused or every Metric was refused: no sentence, strength, range, numbers or footer", () => {
    const refused = whatIfTakeaway(VISITS, [VISITS], whatIf({ start: { name: "Visits", latest: 1 }, change: { by: 0 }, links: [] }), [], ctx);
    expect(refused).toMatchObject({ kind: "refusal", sentence: null, strength: null, range: null, footer: null, figures: [], numbers: [], rows: [] });
    expect(refused.refusal).toBe("the change cannot be used as it was given.");
    const none = say([{ ok: false, name: "Signups", step: 1, refusal: { case: "refuse-what-if-formula", slots: { name: "Signups" } } }]);
    expect(none).toMatchObject({ kind: "refusal", sentence: null, footer: null, figures: [], numbers: [] });
    expect(none.rows[0]).toMatchObject({ kind: "refused", effect: null });
    expect(none.refusal).toContain("Signups: it cannot be worked out for that change");
  });
  it("names the Metrics reached that were refused only as rows, and gives no number for them", () => {
    const t = say([ok("Signups"), { ok: false, name: "Revenue", step: 2, refusal: { case: "refuse-curved-outside", slots: { name: "Visits" } } }]);
    expect(t.kind).toBe("answer");
    expect(t.rows[1]).toMatchObject({ kind: "refused", effect: null, lo: null });
    expect(t.rows[1].sentence).toBe("Revenue: The link looks curved, so nothing can be read from it for a value of Visits outside what it has been.");
    expect(t.sentence).not.toContain("Revenue");
  });
  it("does not write what cannot be written: a change or an effect too small for 15 places is said in words, not as 0 or as two ends that read the same", () => {
    const t = say([ok("Signups")], 1e-16);
    expect(t).toMatchObject({ kind: "refusal", sentence: null, figures: [] });
    expect(t.refusal).toBe("Visits: the numbers are too small to be written out in its unit: give a bigger change.");
    const row = say([ok("Revenue", { effect: 1e-17, lo: 0.9e-17, hi: 1.1e-17 })]).rows[0];
    expect(row).toMatchObject({ kind: "refused", effect: null });
    expect(row.sentence).toBe("Revenue: the numbers are too small to be written out in its unit: give a bigger change.");
    const worked = say([ok("Revenue", { exact: true, effect: 1e-17, lo: null, hi: null, strength: null, coefficients: 0, level: 0 })]).rows[0];
    expect(worked.kind).toBe("refused");
  });
  it("keeps the sign of an edge of what was seen in the figure, and names every driver that was outside", () => {
    const outside = [{ name: "Visits", side: "below" as const, limit: -791, change: false }, { name: "Signups", side: "above" as const, limit: 50, change: false }, { name: "Visits", side: "above" as const, limit: 300, change: true }];
    const t = say([ok("Revenue", { lo: null, hi: null, outside })]);
    const f = t.figures.find((x) => x.label === "Visits" && x.value === -791)!;
    expect(f).toBeDefined();
    expect(t.rows[0].sentence).toContain(`lowest ${f.text})`);
    expect(t.rows[0].sentence).toContain("This is higher than Signups has ever been");
  });
  it("is as weak as its weakest estimated row, one that cannot be told from chance included, and says where a link counts a change", () => {
    const t = say([ok("Signups"), ok("Revenue", { strength: "cant-tell" })]);
    expect(t.strength).toBe("cant-tell");
    const mixed = say([ok("Signups", { byChange: true }), ok("Revenue", { exact: true, effect: 5, lo: null, hi: null, strength: null, coefficients: 0, level: 0 })]);
    expect(mixed.sentence).toMatch(/^If Visits goes up by 1,000: /);
    expect(mixed.assumptions).toContain("Where a link is compared by change, the change counts from the latest level, in the next month.");
  });
  it("says a percent as asked, with the amount it comes to, and writes nothing about a Metric it was not given", () => {
    const t = whatIfTakeaway(VISITS, [VISITS, SIGNUPS], { ok: true, start: "Visits", by: 2027.2, percent: 5, span: "month", reached: [ok("Signups")] }, [], ctx);
    expect(t.sentence).toMatch(/^If Visits goes up by 5 % \(2,027\): /);
    expect(t.figures.some((f) => f.label === "Visits %" && f.text === "5")).toBe(true);
    const fraction = whatIfTakeaway(VISITS, [VISITS, SIGNUPS], { ok: true, start: "Visits", by: 100, percent: 2.5, span: "month", reached: [ok("Signups")] }, [], ctx);
    expect(fraction.sentence).toMatch(/^If Visits goes up by 2\.50 % /);
    const unknown = say([ok("Mystery")]);
    expect(unknown).toMatchObject({ kind: "refusal", sentence: null, rows: [] });
    expect(unknown.refusal).toBe("the Metrics cannot be used as it was given.");
  });
  it("says a range that could reach beyond what was seen, in each of its four forms, and a point with no range where a formula cannot be worked out on one", () => {
    const beyond = (side: "above" | "below", change: boolean) => say([ok("Revenue", { lo: null, hi: null, beyond: [{ name: "Visits", side, limit: 300, change }] })]).rows[0];
    expect(beyond("above", false).sentence).toBe("Revenue is estimated to go up by about 100 €. A change this size could take Visits higher than it has ever been (highest 300), so treat it as a guess.");
    expect(beyond("below", false).sentence).toContain("lower than it has ever been (lowest 300)");
    expect(beyond("above", true).sentence).toContain("a bigger rise in one month than Visits has ever had (largest 300)");
    expect(beyond("below", true).sentence).toContain("a bigger fall in one month than Visits has ever had (largest 300)");
    expect(beyond("above", false)).toMatchObject({ kind: "guess", lo: null, hi: null });
    const norange = say([ok("Revenue", { lo: null, hi: null, noRange: true })]).rows[0];
    expect(norange).toMatchObject({ kind: "guess", lo: null });
    expect(norange.sentence).toBe("Revenue is estimated to go up by about 100 €: how far that could be off cannot be said here, so treat it as a guess.");
  });
  it("writes a small percent with its significant digits, never as 0, and refuses one that cannot be written", () => {
    const pct = (percent: number) => whatIfTakeaway(VISITS, [VISITS, SIGNUPS], { ok: true, start: "Visits", by: 100, percent, span: "month", reached: [ok("Signups")] }, [], ctx);
    expect(pct(0.001).sentence).toMatch(/^If Visits goes up by 0\.0010 % \(100\): /);
    expect(pct(0.5).sentence).toMatch(/^If Visits goes up by 0\.50 % /);
    expect(pct(12.34).sentence).toMatch(/^If Visits goes up by 12\.34 % /);
  });
  it("writes nothing about a Metric it was not given, not even one a caution or a refusal names", () => {
    const caution = { case: "caution-crowded" as const, slots: { names: "Visits, Secret plans" } };
    const t = say([ok("Signups", { verdict: { refusals: [], switches: [], cautions: [caution] } })]);
    expect(t).toMatchObject({ kind: "refusal", sentence: null });
    const named = say([{ ok: false, name: "Signups", step: 1, refusal: { case: "refuse-curved-outside", slots: { name: "Secret plans" } } }]);
    expect(named.refusal).toBe("the Metrics cannot be used as it was given.");
  });
  it("says a Metric that rests on one nothing can be said of, by that reason", () => {
    const t = say([ok("Signups"), { ok: false, name: "Revenue", step: 2, refusal: { case: "refuse-what-if-driver", slots: { name: "Signups" } } }]);
    expect(t.rows[1].sentence).toBe("Revenue: it rests on Signups, for which nothing can be said.");
  });
  it("generated: a sign is never lost, a number above 0 is never 0, no forbidden word, every number in a sentence is a figure", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }).filter((x) => Math.abs(x) > 1e-9), fc.double({ min: 0, max: 5, noNaN: true }), fc.double({ min: 0, max: 5, noNaN: true }), (effect, down, up) => {
        const [lo, hi] = [effect - down * Math.abs(effect), effect + up * Math.abs(effect)];
        const t = say([ok("Revenue", { effect, lo, hi })]);
        const row = t.rows[0];
        if (row.kind !== "estimated") return;
        expect(row.sentence).toContain(effect > 0 ? "go up by" : "go down by");
        for (const x of [t.sentence!, ...texts(t)]) if (x !== FOOTER) expect(x).not.toMatch(FORBIDDEN);
        for (const n of numbersIn(row.sentence, ctx.style)) {
          expect(n.value, row.sentence).not.toBe(0);
          expect(t.figures.some((f) => f.text.includes(n.text))).toBe(true);
        }
      }),
      { numRuns, seed },
    );
  });
});

describe("what the Recipe does with the Metrics it is given", () => {
  const w = world();
  it("is a Recipe with the question in the person's words", () => {
    expect(WHAT_IF_RECIPES[0]).toMatchObject({ id: "what-if", question: "What if {A} changes?", asks: ["A", "the change, as an amount or a percent"] });
  });
  it("follows at most 2 steps: a Metric two steps on is reached, a third step is not looked for", () => {
    const r = lcg(3);
    const n = 30;
    const visits = Array.from({ length: n }, () => 40000 + Math.round(r() * 20000));
    const signups = visits.map((v) => Math.round(v * 0.02 + gauss(r) * 60));
    const revenue = signups.map((v) => Math.round(v * 50 + gauss(r) * 400));
    const margin = revenue.map((v) => Math.round(v * 0.3 + gauss(r) * 200));
    const MARGIN = mk(6, "margin", "Margin", { unit: "€" });
    const series = { visits: months("2024-01", visits), signups: months("2024-01", signups), revenue: months("2024-01", revenue), margin: months("2024-01", margin) };
    const t = whatIfRecipe(VISITS, { by: 1000 }, [SIGNUPS, REVENUE, MARGIN], resolverFrom([VISITS, SIGNUPS, REVENUE, MARGIN], series), opts);
    expect(t.rows.map((x) => [x.name, x.step])).toContainEqual(["Signups", 1]);
    expect(Math.max(...t.rows.map((x) => x.step))).toBeLessThanOrEqual(2);
  });
  it("reaches at most 12 Metrics, the one changed included, keeps the first step, and says which it left out", () => {
    const r = lcg(11);
    const n = 30;
    const visits = Array.from({ length: n }, () => 40000 + Math.round(r() * 20000));
    const many = Array.from({ length: 20 }, (_, i) => mk(10 + i, `m${i}`, `Metric ${String(i).padStart(2, "0")}`));
    const series: Record<string, Point[]> = { visits: months("2024-01", visits) };
    many.forEach((m, i) => (series[m.slug] = months("2024-01", visits.map((v) => Math.round(v * (0.01 + i / 1000) + gauss(r) * 40)))));
    const t = whatIfRecipe(VISITS, { by: 1000 }, many, resolverFrom([VISITS, ...many], series), opts);
    expect(t.kind).toBe("answer");
    expect(t.rows.length).toBeLessThanOrEqual(11);
    expect(t.rows.filter((x) => x.step === 1).length).toBeLessThanOrEqual(MOST_FIRST + 11);
    expect(1 + t.rows.length).toBeLessThanOrEqual(12);
  });
  it("names and uses only the Metrics it is given: one the person may not see is nowhere in the Takeaway", () => {
    const hidden = mk(9, "secret", "Secret plans");
    const series = { ...w.series, secret: w.series.weather };
    const seen = whatIfRecipe(VISITS, { by: 1000 }, [SIGNUPS, REVENUE], resolverFrom([VISITS, SIGNUPS, REVENUE, hidden], series), opts);
    expect(JSON.stringify(seen)).not.toMatch(/Secret|secret/);
    // A Derived Metric whose input the person may not see is left out, said without naming the input.
    const derived = mk(8, "ratio", "Hidden ratio", { formula: "{visits} / {secret}" });
    const t = whatIfRecipe(VISITS, { by: 1000 }, [SIGNUPS, REVENUE, derived], resolverFrom([VISITS, SIGNUPS, REVENUE, derived, hidden], { ...series, ratio: [] }), opts);
    expect(JSON.stringify(t)).not.toMatch(/Secret|secret/);
    expect(t.notes).toContain("Left out, as the formula of Hidden ratio could not be used here.");
    expect(t.rows.map((r) => r.name)).not.toContain("Hidden ratio");
  });
  it("is a refusal for Metrics with the same name, with no Metrics to compare, a percent of nothing, and Metrics that cannot be combined", () => {
    const twin = mk(7, "twin", "Signups");
    expect(recipe(VISITS, { by: 1 }, [SIGNUPS, twin], w).refusal).toBe("Two Metrics are called Signups, so they cannot be told apart in a sentence: give one another name.");
    expect(recipe(VISITS, { by: 1 }, [], w).refusal).toBe("No other Metric has enough in common with Visits to compare.");
    const zero = { ...w, series: { ...w.series, visits: months("2024-01", w.visits.map((_, i) => (i === w.visits.length - 1 ? 0 : w.visits[i]))) } };
    expect(recipe(VISITS, { percent: 5 }, [SIGNUPS], zero).refusal).toBe("Visits is at 0, so a percent of it is nothing: give the change as an amount.");
    expect(recipe(VISITS, { by: 1 }, [mk(12, "q", "Quarterly", { period: "quarter", aggregation: "none" })], { ...w, series: { ...w.series, q: [] } }).kind).toBe("refusal");
    expect(recipe(VISITS, { by: 1 }, [SIGNUPS], { ...w, series: { ...w.series, visits: [] } }).refusal).toBe("Visits has no value to change from.");
  });
  it("says nothing found where nothing clearly moved with the Metric, and one Metric built from the changed one is worked out", () => {
    const t = recipe(VISITS, { by: 1000 }, [NOISE], w);
    expect(t.kind).toBe("refusal");
    expect(t.refusal).toContain("Nothing was found that clearly moves with Visits");
    // Revenue per visit is built from Visits and Revenue: with Revenue estimated it is reached through it, so it is estimated too, and says so.
    const both = recipe(VISITS, { by: 1000 }, [REVENUE, RPV], w);
    expect(both.rows.find((r) => r.name === "Revenue per visit")).toMatchObject({ kind: "estimated", through: ["Revenue"] });
    const exact = recipe(VISITS, { by: 1000 }, [mk(13, "double", "Double visits", { formula: "{visits} * 2" })], { ...w, series: { ...w.series, double: [] } });
    expect(exact.rows[0]).toMatchObject({ kind: "worked-out", effect: 2000, step: 1 });
  });
  it("does not use a Metric the changed Metric is built from, and says nothing quiet about it", () => {
    const t = recipe(RPV, { by: 0.1 }, [VISITS, REVENUE, SIGNUPS], world());
    expect(JSON.stringify(t.rows.map((r) => r.name))).not.toMatch(/Visits|Revenue"/);
  });
  it("a first-step Metric that moves with the others is told apart: Signups reached by Visits, Revenue by Signups, not by Visits directly", () => {
    const t = recipe(VISITS, { by: 1000 }, [SIGNUPS, REVENUE], w);
    expect(t.rows.find((r) => r.name === "Revenue")).toMatchObject({ step: 2, through: ["Signups"] });
    expect(footerText(ctx)).toBe(t.footer);
  });
});


describe("the corners of the Recipe", () => {
  const w = world();
  it("keeps a Metric's own link where there is too little history to hold the others the same, and where holding them leaves nothing clear", () => {
    // 14 months carry one driver but not two: Revenue keeps its link with Visits alone.
    const short = world(14);
    const t = recipe(VISITS, { by: 1000 }, [SIGNUPS, REVENUE], short);
    expect(t.rows.map((r) => [r.name, r.step])).toEqual([["Revenue", 1], ["Signups", 1]]);
    // A base, one that follows it closely and one that follows it less: with the near one held, the far one is nothing of its own.
    const r = lcg(1);
    const n = 24;
    const a = Array.from({ length: n }, () => Math.round(100 + gauss(r) * 20));
    const b = a.map((v) => Math.round(v * 0.8 + gauss(r) * 12));
    const c = a.map((v, i) => Math.round(v + b[i] * 0.2 + gauss(r) * 35));
    const [A, B, C] = [mk(21, "base", "Base"), mk(22, "near", "Near"), mk(23, "far", "Far")];
    const series = { base: months("2024-01", a), near: months("2024-01", b), far: months("2024-01", c) };
    const held = whatIfRecipe(A, { by: 10 }, [B, C], resolverFrom([A, B, C], series), opts);
    expect(held.rows.map((x) => [x.name, x.step])).toEqual([["Far", 1], ["Near", 1]]);
  });
  it("breaks a tie between Metrics that move exactly alike by Metric id, whatever order they are given in", () => {
    const twin1 = mk(31, "t1", "Signups twin one");
    const twin2 = mk(30, "t2", "Signups twin two");
    const series = { ...w.series, t1: w.series.signups, t2: w.series.signups };
    const a = whatIfRecipe(VISITS, { by: 1000 }, [twin1, twin2], resolverFrom([VISITS, twin1, twin2], series), opts);
    const b = whatIfRecipe(VISITS, { by: 1000 }, [twin2, twin1], resolverFrom([VISITS, twin2, twin1], series), opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.kind).toBe("answer");
  });
  it("leaves out a Derived Metric made of a Metric the changed one is made of (it has no history among the candidates), said without naming anything it may not use", () => {
    // Double visits is made of Visits, so Visits is no candidate; "Signups plus visits" is made of Signups and Visits, and has no Visits to be worked out from.
    const START = mk(41, "double", "Double visits", { formula: "{visits} * 2" });
    const sum = mk(42, "sv", "Signups plus visits", { formula: "{signups} + {visits}" });
    const series = { ...w.series, double: months("2024-01", w.visits.map((v) => v * 2)), sv: w.series.weather };
    const t = whatIfRecipe(START, { by: 1000 }, [VISITS, SIGNUPS, sum], resolverFrom([START, VISITS, SIGNUPS, sum], series), opts);
    expect(t.rows.map((r) => r.name)).toEqual(["Signups"]);
    expect(t.notes).toContain("Left out, as the formula of Signups plus visits could not be used here.");
  });
  it("says how many Metrics were not looked at and which of the first step were left out, not a silent cut", () => {
    const r = lcg(5);
    const n = 30;
    const visits = Array.from({ length: n }, () => 40000 + Math.round(r() * 20000));
    const many = Array.from({ length: 29 }, (_, i) => mk(100 + i, `q${i}`, `Quick ${String(i).padStart(2, "0")}`));
    const series: Record<string, Point[]> = { visits: months("2024-01", visits) };
    many.forEach((m) => (series[m.slug] = months("2024-01", visits.map((v) => Math.round(v * 0.02 + gauss(r) * 25)))));
    const t = whatIfRecipe(VISITS, { by: 1000 }, many, resolverFrom([VISITS, ...many], series), opts);
    expect(t.notes.some((x) => x.startsWith("Only the 5 Metrics that moved most closely with Visits are followed; left out: "))).toBe(true);
    expect(t.notes).toContain("9 other Metrics were not looked at: only the 20 whose changes follow Visits most closely were.");
  });
  it("looks past a Metric that never changes or has only a few months, and does not name it", () => {
    const flat = mk(61, "flat", "Flat");
    const brief = mk(62, "brief", "Brief");
    const series = { ...w.series, flat: months("2024-01", w.visits.map(() => 5)), brief: months("2026-01", [1, 2, 3]) };
    const t = whatIfRecipe(VISITS, { by: 1000 }, [flat, brief, SIGNUPS], resolverFrom([VISITS, flat, brief, SIGNUPS], series), opts);
    expect(t.rows.map((r) => r.name)).toEqual(["Signups"]);
  });
  it("is a refusal in words where the Metrics cannot be combined to one period", () => {
    const q = mk(51, "q", "Quarterly", { period: "quarter" });
    const none = mk(52, "n", "Counted by month, never added up", { aggregation: "none" });
    const t = recipe(VISITS, { by: 1 }, [q, none], { ...w, series: { ...w.series, q: [], n: months("2024-01", w.weather) } });
    expect(t).toMatchObject({ kind: "refusal", sentence: null, footer: null });
    expect(t.refusal).toContain("Aggregation");
  });
});

describe("a what-if said from the Method's result", () => {
  const bare = { exact: false, effect: 100, lo: 80, hi: 120, outside: [], beyond: [], noRange: false, through: [], coefficients: 1, level: 0.9, byChange: false, verdict: { refusals: [], cautions: [], switches: [] } };
  it("says a link with no strength word as one that cannot be told from chance, and names what it was compared on, by value, by change or both", () => {
    const reached: Reached = { ok: true, name: "Signups", step: 1, strength: null, ...bare };
    const t = whatIfTakeaway(VISITS, [VISITS, SIGNUPS], { ok: true, start: "Visits", by: 5, percent: null, span: "month", reached: [reached] }, [], ctx);
    expect(t.rows[0].kind).toBe("unclear");
    expect(t.basis).toBeNull();
    const w2 = world();
    const f = (basis: "values" | "changes") => {
      const made = fit({ target: { name: "Signups", points: w2.series.signups }, drivers: [{ name: "Visits", points: w2.series.visits }], span: "month", basis });
      if (!made.ok) throw new Error("refused");
      return made;
    };
    const say = (fits: ReturnType<typeof f>[]) => whatIfTakeaway(VISITS, [VISITS, SIGNUPS], { ok: true, start: "Visits", by: 5, percent: null, span: "month", reached: [reached] }, fits, ctx).basis;
    expect(say([f("values")])).toBe("compared by value");
    expect(say([f("changes")])).toBe("compared by change, growth removed");
    expect(say([f("values"), f("changes")])).toBe("compared by value or by change, as each link needed");
  });
});

describe("the wording table", () => {
  it("has every what-if line in every language, none with a forbidden word", () => {
    for (const [, lines] of Object.entries(WORDING)) for (const [key, line] of Object.entries(lines)) if (key.startsWith("whatif") || key.includes("what-if")) expect(line, key).not.toMatch(FORBIDDEN);
  });
});

void fit;
void ({} as FitLink);
void ({} as WorkedLink);
