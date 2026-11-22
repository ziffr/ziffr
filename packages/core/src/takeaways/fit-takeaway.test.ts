// The Takeaways of a multiple fit and the Recipes "What moves B?" and "What does B need?" (spec 0041, ticket 4): the sentences
// in the Metrics' own units with every number the Method's, the share words at their thresholds, "held the same", "treat it as
// a guess" outside what was seen, cautions above the answer and never "strong" with one, a refusal that carries nothing,
// no forbidden word, one footer, and the Recipes over Metrics of different periods, built from one another or hidden.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolverFrom } from "../compare";
import { formatNumber, formatValue } from "../format";
import { fit, needs, predict, type Fit } from "../methods/fit";
import { NUMBER_STYLES } from "../number-style";
import { numbersIn } from "../numbers";
import { metric, months } from "../test/fixtures";
import { runs } from "../test/reference/check";
import type { Metric, Point } from "../types";
import { FIT_RECIPES, movesTakeaway, needsTakeaway, predictTakeaway, shareWord, SHARE_WORDS, whatMoves, whatNeeds } from "./fit-takeaway";
import { footerText, type Takeaway, type TakeawayContext } from "./takeaway";
import { LANGUAGES, WORDING, type CaseKey } from "./wording";

const { numRuns, seed } = runs();
const ctx: TakeawayContext = { style: "1,234.5" };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const FOOTER = "This shows what has gone together, not what caused what.";

const [R, V, P, T] = [
  metric({ id: 1, slug: "revenue", name: "Revenue", unit: "€", unit_position: "after", decimals: 0, period: "month", aggregation: "sum" }),
  metric({ id: 2, slug: "visits", name: "Visits", unit: "", unit_position: "after", decimals: 0, period: "month", aggregation: "sum" }),
  metric({ id: 3, slug: "price", name: "Price", unit: "€", unit_position: "after", decimals: 2, period: "month", aggregation: "last" }),
  metric({ id: 4, slug: "tickets", name: "Support tickets", unit: "", unit_position: "after", decimals: 0, period: "month", aggregation: "sum" }),
];

/** A pseudo-random generator from a seed, and normal noise from it. */
function lcg(start: number) {
  let x = start;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/** Revenue = 2.4 × Visits − 9,000 × Price + noise over n months, the levels flat (no trend), so they are compared by value. */
function world(n = 30, over: { visitsEffect?: number; priceEffect?: number; ticketsEffect?: number; noise?: number } = {}) {
  const r = lcg(7);
  const [ve, pe, te, nz] = [over.visitsEffect ?? 2.4, over.priceEffect ?? -9000, over.ticketsEffect ?? 0, over.noise ?? 5000];
  const visits = Array.from({ length: n }, () => 40000 + Math.round(r() * 20000));
  const price = Array.from({ length: n }, () => 8 + Math.round(r() * 30) / 10);
  const tickets = Array.from({ length: n }, () => Math.round(r() * 200));
  const revenue = visits.map((v, i) => Math.round(v * ve + price[i] * pe + tickets[i] * te + gauss(r) * nz));
  return { visits, price, tickets, revenue, series: { revenue: months("2024-01", revenue), visits: months("2024-01", visits), price: months("2024-01", price), tickets: months("2024-01", tickets) } };
}
const opts = { yearStart: 1 as const, ctx, today: "2030-01-01" };
const texts = (t: Takeaway) => [t.sentence, t.refusal, t.strengthText, t.basis, t.method, t.footer, t.range?.text, ...t.assumptions, ...t.cautions, ...t.notes, ...t.numbers.flatMap((n) => [n.label, n.text]), ...t.figures.map((f) => f.label)].filter((x): x is string => x !== null && x !== undefined);
const fitOf = (w: ReturnType<typeof world>, drivers: Metric[] = [V, P, T]) => {
  const slugs = { 2: "visits", 3: "price", 4: "tickets" } as Record<number, string>;
  const f = fit({ target: { name: R.name, points: w.series.revenue }, drivers: drivers.map((d) => ({ name: d.name, points: (w.series as Record<string, Point[]>)[slugs[d.id]] })), span: "month", basis: "values" });
  return f;
};
const ok = (f: ReturnType<typeof fit>): Fit => {
  if (!f.ok) throw new Error(JSON.stringify(f.refusals));
  return f;
};

describe("the share words", () => {
  it("come from one table, each one step either side of its threshold", () => {
    expect(SHARE_WORDS.map(([from]) => from)).toEqual([0.85, 0.6, 0.4, 0.27, 0.18, 0.08, 0]);
    for (const [from, key] of SHARE_WORDS) {
      expect(shareWord(from), `${from}`).toBe(key);
      if (from > 0) expect(shareWord(from - 1e-9)).not.toBe(key);
    }
    expect(shareWord(1)).toBe("share-nearly-all");
    expect(shareWord(0)).toBe("share-little");
  });
  it("name the words that exist in every language", () => {
    for (const language of LANGUAGES) for (const [, key] of SHARE_WORDS) expect(WORDING[language][key as CaseKey]).toBeTruthy();
  });
});

describe("a fit's Takeaway (What moves B?)", () => {
  const w = world();
  const f = ok(fitOf(w));
  const t = movesTakeaway(R, [V, P, T], f, ctx);
  it("names the drivers that moved with the target the most, up to three, and says the others were held the same", () => {
    expect(t.kind).toBe("answer");
    expect(t.sentence).toBe("Over 30 months, Visits and Price moved with Revenue the most, with the others held the same.");
    expect(t.rows.map((r) => r.name)).toEqual(["Visits", "Price", "Support tickets"]);
  });
  it("gives each driver's share of what moved in words, its strength word, and its effect with its range, in the Metrics' units", () => {
    const [visits, price] = [f.drivers[0], f.drivers[1]];
    const step = 10 ** Math.floor(Math.log10(visits.spread));
    const row = t.rows.find((r) => r.name === "Visits")!;
    expect(row.share).toBe(["nearly all", "most", "about half", "about a third", "about a quarter", "some", "little"][SHARE_WORDS.findIndex(([from]) => visits.share >= from)]);
    expect(row.sentence).toBe(`When Visits goes up by ${formatNumber(step, 0, ctx.style)}, Revenue has gone up by about ${formatValue(R, visits.effect * step, ctx.style)} (likely between ${formatValue(R, visits.lo * step, ctx.style)} and ${formatValue(R, visits.hi * step, ctx.style)}), with Price and Support tickets held the same.`);
    const priceRow = t.rows.find((r) => r.name === "Price")!;
    expect(priceRow.sentence).toContain("Revenue has gone down by about");
    expect(price.effect).toBeLessThan(0);
    expect(priceRow.strength).toBe("strong");
  });
  it("is a Takeaway like any: a strength, the basis it was compared on, the footer once, the periods and the numbers", () => {
    expect(t.strength).toBe(t.rows[0].strength);
    expect(t.basis).toBe("compared by value, over 30 months");
    expect(t.footer).toBe(FOOTER);
    expect(texts(t).filter((x) => x === FOOTER)).toHaveLength(1);
    expect(t.numbers.find((n) => n.label === "Method")!.text).toBe("Straight line through several Metrics, by least squares");
    expect(t.numbers.find((n) => n.label === "Periods")!.text).toBe("2024-01-01 – 2026-06-01");
    expect(t.numbers.find((n) => n.label === "How much of the movement the line explains")!.text).toBe(`${formatNumber(f.explained * 100, 0, ctx.style)} %`);
    expect(t.numbers.some((n) => n.label.startsWith("Visits: Share of what is explained"))).toBe(true);
  });
  it("says a driver whose link cannot be told from chance as that, and does not name it in the sentence", () => {
    const row = t.rows.find((r) => r.name === "Support tickets")!;
    expect(row.strength).toBe("cant-tell");
    expect(row.sentence).toBe("Support tickets: it cannot be told whether Revenue goes up or down with it.");
    expect(t.sentence).not.toContain("Support tickets");
  });
  it("has the top driver's range as the Takeaway's range, and no number outside what the Method gave", () => {
    const top = f.drivers.reduce((a, d) => (d.share > a.share ? d : a));
    const step = 10 ** Math.floor(Math.log10(top.spread));
    expect(t.range).toEqual({ lo: top.lo * step, hi: top.hi * step, text: `${formatValue(R, top.lo * step, ctx.style)} – ${formatValue(R, top.hi * step, ctx.style)}` });
    for (const x of [t.sentence!, ...t.rows.map((r) => r.sentence).filter((s): s is string => s !== null)]) {
      for (const n of numbersIn(x, ctx.style)) expect(t.figures.some((fg) => fg.text.includes(n.text)), `${n.text} in "${x}"`).toBe(true);
    }
    for (const fg of t.figures) expect(texts(t).some((x) => x.includes(fg.text))).toBe(true);
  });
  it("uses no forbidden word, anywhere", () => {
    for (const x of texts(t)) if (x !== FOOTER) expect(x).not.toMatch(FORBIDDEN);
  });
  it("names one driver alone without 'the others', and none when none can be told from chance", () => {
    const one = ok(fitOf(world(), [V]));
    expect(movesTakeaway(R, [V], one, ctx).sentence).toBe("Over 30 months, Visits moved with Revenue the most.");
    expect(movesTakeaway(R, [V], one, ctx).rows[0].sentence).not.toContain("held the same");
    const none = world(30, { visitsEffect: 0, priceEffect: 0, noise: 5000 });
    const nf = ok(fitOf(none, [T]));
    const nt = movesTakeaway(R, [T], nf, ctx);
    expect(nt.sentence).toBe("Over 30 months, none of the other Metrics clearly moved with Revenue: can't tell from chance.");
    expect(nt.strength).toBe("cant-tell");
    expect(nt.range).toBeNull();
  });
  it("is never strong with a caution, and says the caution above the answer, quoting the effect without the far-off months", () => {
    const x = world();
    const bad = { ...x.series, revenue: x.series.revenue.map((p, i) => (i === 11 ? { ...p, value: p.value - 400000 } : p)) };
    const bf = ok(fitOf({ ...x, series: bad }));
    const bt = movesTakeaway(R, [V, P, T], bf, ctx);
    expect(bt.cautions.length).toBeGreaterThanOrEqual(1);
    expect(bt.cautions.find((c) => c.startsWith("This result is pulled"))).toMatch(/^This result is pulled by 1 month far from the rest; without them it reads .+ per .+\.$/);
    expect(bt.strength).not.toBe("strong");
    expect(bt.rows.every((r) => r.strength !== "strong")).toBe(true);
  });
  it("says drivers treated as one, naming them", () => {
    const x = world();
    const twin = x.visits.map((v) => v * 2);
    const f2 = ok(
      fit({ target: { name: R.name, points: x.series.revenue }, drivers: [{ name: "Visits", points: x.series.visits }, { name: "Sessions", points: months("2024-01", twin) }, { name: "Price", points: x.series.price }], span: "month", basis: "values" }),
    );
    const t2 = movesTakeaway(R, [V, metric({ id: 9, slug: "sessions", name: "Sessions", unit: "" }), P], f2, ctx);
    expect(t2.notes).toEqual(["Visits and Sessions move so closely that Ziffr cannot tell which matters; treated as one."]);
    expect(t2.rows.map((r) => r.name)).not.toContain("Sessions");
  });
  it("is a refusal, with words only, where the fit refused: no sentence, strength, range, numbers or footer", () => {
    const short = movesTakeaway(R, [V], fit({ target: { name: "Revenue", points: months("2024-01", [1, 2, 3]) }, drivers: [{ name: "Visits", points: months("2024-01", [3, 1, 2]) }], span: "month" }), ctx);
    expect(short.kind).toBe("refusal");
    expect(short.refusal).toBe("Not enough months yet: 3 of 12 needed.");
    expect([short.sentence, short.strength, short.strengthText, short.range, short.footer, short.basis]).toEqual([null, null, null, null, null, null]);
    expect(short.numbers).toEqual([]);
    expect(short.figures).toEqual([]);
    expect(short.rows).toEqual([]);
  });
  it("writes numbers in every Number Style, and the unit on its side", () => {
    for (const style of NUMBER_STYLES) {
      const s = movesTakeaway(R, [V, P, T], f, { style });
      const step = 10 ** Math.floor(Math.log10(f.drivers[0].spread));
      expect(s.rows.find((r) => r.name === "Visits")!.sentence).toContain(`by ${formatNumber(step, 0, style)}`);
      expect(s.rows.find((r) => r.name === "Visits")!.sentence).toContain(formatValue(R, f.drivers[0].effect * step, style));
      expect(s.sentence).toContain(`Over ${formatNumber(30, 0, style)} months`);
    }
  });
  it("shows a small effect to two significant digits, never rounded away to 0", () => {
    const r = lcg(3);
    const x = Array.from({ length: 30 }, () => Math.round(r() * 1000));
    const y = x.map((v) => Math.round((v * 0.0007 + gauss(r) * 0.00002) * 1e6) / 1e6 + 10);
    const small = metric({ id: 1, slug: "revenue", name: "Rate", unit: "%", unit_position: "after", decimals: 0, period: "month", aggregation: "sum" });
    const f3 = ok(fit({ target: { name: "Rate", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: months("2024-01", x) }], span: "month", basis: "values" }));
    const t3 = movesTakeaway(small, [V], f3, ctx);
    expect(t3.rows[0].sentence).not.toMatch(/about 0 %/);
    expect(t3.rows[0].sentence).toMatch(/about \d\.\d+ %/);
  });
  it("is the same words twice", () => {
    expect(JSON.stringify(movesTakeaway(R, [V, P, T], f, ctx))).toBe(JSON.stringify(t));
  });
});

describe("a value read from a fit", () => {
  const f = ok(fitOf(world(), [V, P]));
  it("says what the target is likely to be for the values given, with its range", () => {
    const p = predict(f, [50000, 9]);
    const t = predictTakeaway(R, [V, P], f, [50000, 9], p, ctx);
    if (!p.ok) throw new Error("refused");
    expect(t.sentence).toBe(`With Visits at 50,000 and Price at 9.00 €, Revenue is likely between ${formatValue(R, p.lo!, ctx.style)} and ${formatValue(R, p.hi!, ctx.style)}.`);
    expect(t.range!.text).toBe(`${formatValue(R, p.lo!, ctx.style)} – ${formatValue(R, p.hi!, ctx.style)}`);
    expect(t.footer).toBe(FOOTER);
    expect(t.strength).toBeNull();
    expect(texts(t).every((x) => x === FOOTER || !FORBIDDEN.test(x))).toBe(true);
  });
  it("says only the point, and to treat it as a guess, for a value outside what the driver has been", () => {
    const high = f.drivers[0].high;
    const p = predict(f, [high + 5000, 9]);
    const t = predictTakeaway(R, [V, P], f, [high + 5000, 9], p, ctx);
    expect(t.range).toBeNull();
    expect(t.sentence).toMatch(new RegExp(`^With Visits at ${formatNumber(high + 5000, 0, ctx.style)} and Price at 9.00 €, Revenue comes to about .+\\. This is higher than Visits has ever been \\(highest ${formatNumber(high, 0, ctx.style)}\\), so treat it as a guess\\.$`));
    const low = f.drivers[1].low;
    const q = predict(f, [50000, low - 1]);
    expect(predictTakeaway(R, [V, P], f, [50000, low - 1], q, ctx).sentence).toContain("lower than Price has ever been (lowest");
  });
  it("is a refusal for values that cannot be used", () => {
    const t = predictTakeaway(R, [V, P], f, [NaN, 9], predict(f, [NaN, 9]), ctx);
    expect(t.kind).toBe("refusal");
    expect(t.refusal).toBe("Visits cannot be used as it was given.");
    expect([t.sentence, t.range, t.footer]).toEqual([null, null, null]);
  });
  it("says a caution above it where the link looks curved, and refuses outside what was seen", () => {
    const x = Array.from({ length: 30 }, (_, i) => i + 1);
    const r = lcg(2);
    const y = x.map((v) => Math.round((v * v) / 5 + gauss(r) * 0.4));
    const c = ok(fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: months("2024-01", x) }], span: "month", basis: "values" }));
    const inside = predictTakeaway(R, [V], c, [15], predict(c, [15]), ctx);
    expect(inside.cautions).toEqual(["The link looks curved, so a straight-line reading is rough."]);
    const outside = predictTakeaway(R, [V], c, [40], predict(c, [40]), ctx);
    expect(outside.refusal).toBe("The link looks curved, so nothing can be read from it for a value of Visits outside what it has been.");
    expect(outside.sentence).toBeNull();
  });
});

describe("what a driver needs to be (What does B need?)", () => {
  const w = world();
  const f = ok(fitOf(w, [V, P]));
  it("says the value, its range and how far it is from today", () => {
    const mid = predict(f, [50000, f.last.x[1]]);
    if (!mid.ok) throw new Error("refused");
    const goal = Math.round(mid.value);
    const n = needs(f, { goal, driver: 0 });
    const t = needsTakeaway(R, V, f, goal, n, ctx, [V, P]);
    if (!n.ok) throw new Error("refused");
    const pct = ((n.value - n.current) / Math.abs(n.current)) * 100;
    expect(t.sentence).toMatch(/^To reach [\d,]+ €, Visits would need to be around [\d,]+ \(likely between [\d,]+ and [\d,]+\), \d+ % (above|below) today\.$/);
    expect(t.sentence!.startsWith(`To reach ${formatNumber(goal, 0, ctx.style)} €`)).toBe(true);
    expect(t.sentence).toContain(`${formatNumber(Math.abs(pct), 0, ctx.style)} % ${pct > 0 ? "above" : "below"} today`);
    expect(t.range).not.toBeNull();
    expect(t.footer).toBe(FOOTER);
  });
  it("says to treat it as a guess when the value is higher than the driver has ever been, with the highest it has been", () => {
    const n = needs(f, { goal: 400000, driver: 0 });
    const t = needsTakeaway(R, V, f, 400000, n, ctx, [V, P]);
    expect(t.range).toBeNull();
    expect(t.sentence).toMatch(/^To reach 400,000 €, Visits would need to be around [\d,]+, \d+ % above today\. This is higher than Visits has ever been \(highest [\d,]+\), so treat it as a guess\.$/);
    const low = needsTakeaway(R, V, f, 1, needs(f, { goal: 1, driver: 0 }), ctx, [V, P]);
    expect(low.sentence).toContain("This is lower than Visits has ever been (lowest");
  });
  it("is one step either side of the highest value: at the highest a range, a step above only the point and the sentence", () => {
    const high = f.drivers[0].high;
    const at = predict(f, [high, f.last.x[1]]);
    const above = predict(f, [high + 1, f.last.x[1]]);
    if (!at.ok || !above.ok) throw new Error("refused");
    const [a, b] = [needs(f, { goal: at.value, driver: 0 }), needs(f, { goal: above.value, driver: 0 })];
    expect(needsTakeaway(R, V, f, at.value, a, ctx, [V, P]).sentence).not.toContain("guess");
    expect(needsTakeaway(R, V, f, above.value, b, ctx, [V, P]).sentence).toContain("so treat it as a guess");
  });
  it("says to treat it as a guess, without a range, where the driver's effect cannot be told from chance", () => {
    const flat = world(30, { visitsEffect: 0, priceEffect: -9000 });
    const ff = ok(fitOf(flat, [V, P]));
    // A goal read from the fit at the middle of what Visits has been: inside what was seen, with an effect that is not clear.
    const mid = predict(ff, [(ff.drivers[0].low + ff.drivers[0].high) / 2, ff.last.x[1]]);
    if (!mid.ok) throw new Error("refused");
    const goal = Math.round(mid.value);
    const n = needs(ff, { goal, driver: 0 });
    const t = needsTakeaway(R, V, ff, goal, n, ctx, [V, P]);
    if (!n.ok) throw new Error("refused");
    expect(n.lo).toBeNull();
    expect(t.sentence).toMatch(/how far off that could be cannot be told from the data, so treat it as a guess\.$/);
    expect(t.strength).toBe("cant-tell");
  });
  it("compares with today in words: above, below, the same, and from nothing", () => {
    const base = { ok: true as const, lo: null, hi: null, outside: [], verdict: { refusals: [], cautions: [], switches: [] } };
    const say = (value: number, current: number) => needsTakeaway(R, V, f, 100, { ...base, value, current }, ctx, [V]).sentence!;
    expect(say(112, 100)).toContain("12 % above today");
    expect(say(88, 100)).toContain("12 % below today");
    expect(say(100, 100)).toContain("the same as today");
    expect(say(5, 0)).toContain("against 0 today");
    expect(say(-112, -100)).toContain("12 % above today".replace("above", "below"));
  });
  it("is a refusal in words where the fit cannot give it: no effect, a curved link outside what was seen, a bad goal", () => {
    const x = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6];
    const y = [5, 3, 1, 4, 2, 6, 6, 2, 4, 1, 3, 5];
    const flat = ok(fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: months("2024-01", x) }], span: "month", basis: "values" }));
    const t = needsTakeaway(R, V, flat, 3, needs(flat, { goal: 3, driver: 0 }), ctx, [V]);
    expect(t.refusal).toBe("Revenue has not moved with Visits at all, so no value of Visits reaches the goal.");
    expect([t.sentence, t.range, t.strength, t.footer]).toEqual([null, null, null, null]);
    const bad = needsTakeaway(R, V, f, NaN, needs(f, { goal: NaN, driver: 0 }), ctx, [V, P]);
    expect(bad.kind).toBe("refusal");
  });
});

describe("compared by change", () => {
  // Two Metrics that both grow: compared by how each changed from the month before, and said so.
  const r = lcg(13);
  const trend = Array.from({ length: 36 }, (_, i) => 100 + 4 * i);
  const visits = trend.map((v) => Math.round(v * 100 + gauss(r) * 300));
  const revenue = visits.map((v, i) => Math.round(v * 2 + (i > 0 ? (visits[i] - visits[i - 1]) * 3 : 0) + gauss(r) * 400));
  const f = ok(fit({ target: { name: "Revenue", points: months("2024-01", revenue) }, drivers: [{ name: "Visits", points: months("2024-01", visits) }], span: "month" }));
  it("says growth was removed, and counts the periods of change", () => {
    expect(f.basis).toBe("changes");
    const t = movesTakeaway(R, [V], f, ctx);
    expect(t.basis).toBe("compared by change, growth removed, over 35 months");
    expect(t.numbers.find((n) => n.label === "Compared on")!.text).toBe("compared by change, growth removed, over 35 months");
  });
  it("says a one-month change bigger than the driver has ever had as that, not as a level, on either side", () => {
    const up = predict(f, [f.last.x[0] + 10 * (f.drivers[0].high + 1)]);
    const t = predictTakeaway(R, [V], f, [f.last.x[0] + 10 * (f.drivers[0].high + 1)], up, ctx);
    expect(t.sentence).toMatch(/This is a bigger rise in one month than Visits has ever had \(largest [\d,]+\), so treat it as a guess\.$/);
    expect(t.basis).toBe("compared by change, growth removed, over 35 months");
    const dn = predict(f, [f.last.x[0] + 10 * (f.drivers[0].low - 1)]);
    expect(predictTakeaway(R, [V], f, [f.last.x[0] + 10 * (f.drivers[0].low - 1)], dn, ctx).sentence).toMatch(/This is a bigger fall in one month than Visits has ever had \(largest [\d,]+\)/);
    // The size of the fall is written without its sign: the largest fall is a size.
    expect(predictTakeaway(R, [V], f, [f.last.x[0] + 10 * (f.drivers[0].low - 1)], dn, ctx).sentence).not.toContain("−");
  });
  it("says what a driver would need to be as a level, counted from its latest level", () => {
    const goal = f.last.y + 500;
    const n = needs(f, { goal, driver: 0 });
    const t = needsTakeaway(R, V, f, goal, n, ctx, [V]);
    if (!n.ok) throw new Error("refused");
    expect(t.sentence).toMatch(/^To reach [\d,]+ €, Visits would need to be around [\d,]+/);
    expect(t.basis).toBe("compared by change, growth removed, over 35 months");
    expect(n.current).toBe(f.last.x[0]);
  });
});

describe("a fit with no miss at all", () => {
  it("writes zeros as zeros, and the range of an exact effect as a range of no width", () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    const x2 = [5, 1, 6, 2, 9, 3, 7, 4, 8, 2, 6, 1, 5, 9, 3, 7];
    const y = x.map((v, i) => 3 * v + 2 * x2[i] + 10);
    const e = ok(fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: months("2024-01", x) }, { name: "Price", points: months("2024-01", x2) }], span: "month", basis: "values" }));
    const t = movesTakeaway(R, [V, P], e, ctx);
    expect(t.numbers.find((n) => n.label === "Typical miss")!.text).toBe("0 €");
    expect(t.numbers.find((n) => n.label === "How much of the movement the line explains")!.text).toBe("100 %");
    expect(t.rows.find((r) => r.name === "Visits")!.sentence).toMatch(/Revenue has gone up by about [\d.,]+ € \(likely between [\d.,]+ € and [\d.,]+ €\)/);
  });
});

describe("the Recipes", () => {
  const w = world();
  const metrics = [R, V, P, T];
  const resolve = resolverFrom(metrics, w.series);
  it("lists the two questions with what each asks and what Ziffr fills in", () => {
    expect(FIT_RECIPES.map((r) => [r.question, r.asks])).toEqual([["What moves {B}?", ["B"]], ["What does {B} need?", ["B", "the value you want"]]]);
  });
  it("What moves B? answers with the other Metrics given, as the fit does", () => {
    const t = whatMoves(R, [V, P, T], resolve, opts);
    const direct = movesTakeaway(R, [V, P, T], ok(fitOf(w)), ctx);
    expect(t).toEqual(direct);
    expect(t.sentence).toContain("Visits and Price moved with Revenue the most");
  });
  it("leaves out the target itself and a Metric built from it, as Drivers does", () => {
    const built = metric({ id: 7, slug: "margin", name: "Margin", formula: "{revenue} * 0.2", period: "month", aggregation: "sum" });
    const t = whatMoves(R, [R, built, V, P, T], resolverFrom([...metrics, built], { ...w.series, margin: w.series.revenue.map((p) => ({ ...p, value: p.value * 0.2 })) }), opts);
    expect(t.rows.map((r) => r.name).sort()).toEqual(["Price", "Support tickets", "Visits"]);
  });
  it("says when there is nothing to compare with", () => {
    const t = whatMoves(R, [R], resolve, opts);
    expect(t.refusal).toBe("No other Metric has enough in common with Revenue to compare.");
    expect([t.sentence, t.range, t.strength]).toEqual([null, null, null]);
  });
  it("refuses too many Metrics for the history, in words, and says how many can be weighed", () => {
    const many = Array.from({ length: 7 }, (_, i) => metric({ id: 20 + i, slug: `m${i}`, name: `M${i}`, period: "month", aggregation: "sum" }));
    const r = lcg(5);
    const series: Record<string, Point[]> = { revenue: months("2024-01", Array.from({ length: 40 }, () => Math.round(r() * 100))) };
    for (const m of many) series[m.slug] = months("2024-01", Array.from({ length: 40 }, () => Math.round(r() * 100)));
    const t = whatMoves(R, many, resolverFrom([R, ...many], series), opts);
    expect(t.refusal).toBe("7 Metrics are too many for 40 months: at most 6 can be weighed.");
    expect(t.rows).toEqual([]);
  });
  it("combines a weekly Metric to the month by its Aggregation and says so in the periods it counts", () => {
    const weeks: Point[] = Array.from({ length: 140 }, (_, i) => ({ period: new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10), value: 100 + ((i * 37) % 53) }));
    const weekly = metric({ id: 30, slug: "weekly", name: "Orders", period: "week", aggregation: "sum" });
    const t = whatMoves(R, [weekly, P], resolverFrom([R, weekly, P], { revenue: w.series.revenue, weekly: weeks, price: w.series.price }), opts);
    expect(t.kind).toBe("answer");
    expect(t.sentence).toMatch(/^Over \d+ months, /);
    const none = metric({ id: 31, slug: "weekly", name: "Orders", period: "week", aggregation: "none" });
    const r = whatMoves(R, [none, P], resolverFrom([R, none, P], { revenue: w.series.revenue, weekly: weeks, price: w.series.price }), opts);
    expect(r.kind).toBe("refusal");
    expect(r.refusal).toMatch(/Aggregation/);
  });
  it("What does B need? gives the Takeaway of the driver that explains most, with one for each that moved with the target", () => {
    const t = whatNeeds(R, [V, P, T], 130000, resolve, opts);
    expect(t.kind).toBe("answer");
    const f2 = ok(fitOf(w, [V, P, T]));
    const byShare = [...f2.drivers].sort((a, b) => b.share - a.share).map((d) => d.name).filter((n) => n !== "Support tickets");
    expect(t.rows.map((r) => r.name)).toEqual(byShare);
    expect(t.sentence).toBe(t.rows[0].takeaway.sentence);
    expect(t.sentence).toMatch(new RegExp(`^To reach 130,000 €, ${byShare[0]} would need to be around `));
    for (const x of texts(t)) if (x !== FOOTER) expect(x).not.toMatch(FORBIDDEN);
  });
  it("refuses a goal more than 1,000 times the largest value, one step either side, and one that is not a number", () => {
    const largest = Math.max(...w.revenue);
    const edge = whatNeeds(R, [V, P], 1000 * largest, resolve, opts);
    expect(edge.kind).toBe("answer");
    const over = whatNeeds(R, [V, P], 1000 * largest + 1, resolve, opts);
    expect(over.refusal).toBe(`${formatValue(R, 1000 * largest + 1, ctx.style)} is more than 1,000 times the largest value Revenue has had, so it is not worked out.`);
    expect(whatNeeds(R, [V, P], NaN, resolve, opts).refusal).toBe("The value you want must be a number.");
    expect(whatNeeds(R, [V, P], Infinity, resolve, opts).refusal).toBe("The value you want must be a number.");
    expect(whatNeeds(R, [V, P], -(1000 * largest), resolve, opts).kind).toBe("answer");
  });
  it("says when none of the Metrics moved with the target clearly enough", () => {
    const flat = world(30, { visitsEffect: 0, priceEffect: 0 });
    const t = whatNeeds(R, [T], 100000, resolverFrom(metrics, flat.series), opts);
    expect(t.refusal).toBe("Over 30 months, none of the other Metrics clearly moved with Revenue, so no value of them can be read as reaching 100,000 €.");
  });
  it("says when there is nothing to compare with, for a goal too", () => {
    expect(whatNeeds(R, [R], 100, resolve, opts).refusal).toBe("No other Metric has enough in common with Revenue to compare.");
  });
  it("refuses as the fit does, in words", () => {
    const short = resolverFrom(metrics, { revenue: months("2024-01", [1, 2, 3, 5, 4]), visits: months("2024-01", [3, 1, 2, 5, 4]), price: [], tickets: [] });
    expect(whatNeeds(R, [V], 10, short, opts).refusal).toBe("Not enough months yet: 5 of 12 needed.");
  });
  it("shows nothing it was not given: a Metric left out of `others` is not named anywhere", () => {
    const t = whatMoves(R, [V, P], resolve, opts);
    expect(JSON.stringify(t)).not.toContain("Support tickets");
    const n = whatNeeds(R, [V, P], 120000, resolve, opts);
    expect(JSON.stringify(n)).not.toContain("Support tickets");
  });
});

describe("the invariants over generated data", () => {
  it(`a refusal carries nothing, a caution is never strong, the footer is on once, no forbidden word, the same twice (${numRuns} cases, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 40 }), fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 0, max: 9 }), (n, s, k) => {
        const w2 = world(n, { visitsEffect: k % 2 === 0 ? 0 : 2.4, noise: 1000 + s });
        const t = whatMoves(R, [V, P, T], resolverFrom([R, V, P, T], w2.series), opts);
        expect(JSON.stringify(whatMoves(R, [V, P, T], resolverFrom([R, V, P, T], w2.series), opts))).toBe(JSON.stringify(t));
        for (const x of texts(t)) if (x !== FOOTER) expect(x).not.toMatch(FORBIDDEN);
        if (t.kind === "refusal") {
          expect([t.sentence, t.strength, t.range, t.footer, t.basis]).toEqual([null, null, null, null, null]);
          expect([t.numbers, t.figures, t.rows]).toEqual([[], [], []]);
          expect(t.refusal).toBeTruthy();
          return;
        }
        expect(texts(t).filter((x) => x === footerText(ctx))).toHaveLength(1);
        if (t.cautions.length > 0) expect(t.rows.every((r) => r.strength !== "strong")).toBe(true);
        for (const x of [t.sentence!, ...t.rows.map((r) => r.sentence).filter((q): q is string => q !== null)]) for (const nn of numbersIn(x, ctx.style)) expect(t.figures.some((fg) => fg.text.includes(nn.text)), `${nn.text} in ${x}`).toBe(true);
      }),
      { numRuns: Math.min(numRuns, 100), seed },
    );
  });
  it(`an effect is said only where its range stays on one side of 0 (${numRuns} cases, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 14, max: 40 }), fc.integer({ min: 500, max: 40000 }), (n, noise) => {
        const w2 = world(n, { noise });
        const f = fit({ target: { name: R.name, points: w2.series.revenue }, drivers: [{ name: V.name, points: w2.series.visits }, { name: P.name, points: w2.series.price }], span: "month", basis: "values" });
        if (!f.ok) return;
        const t = movesTakeaway(R, [V, P], f, ctx);
        for (const d of f.drivers) {
          const row = t.rows.find((r) => r.name === d.name)!;
          if (row.sentence?.startsWith("When")) {
            expect(row.strength).not.toBe("cant-tell");
            expect(d.lo * d.hi).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: Math.min(numRuns, 100), seed },
    );
  });
});
