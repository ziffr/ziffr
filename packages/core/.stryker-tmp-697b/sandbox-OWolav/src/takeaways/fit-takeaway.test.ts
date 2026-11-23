// @ts-nocheck
// The Takeaways of a multiple fit and the Recipes "What moves B?" and "What does B need?" (spec 0041, ticket 4): the sentences
// in the Metrics' own units with every number the Method's, the share words at their thresholds, "held the same", "treat it as
// a guess" outside what was seen, cautions above the answer and never "strong" with one, a refusal that carries nothing,
// no forbidden word, one footer, and the Recipes over Metrics of different periods, built from one another or hidden.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolverFrom } from "../compare";
import { formatNumber, formatValue } from "../format";
import { fit, needs, partialPeriods, predict, type Fit } from "../methods/fit";
import { strengthOf } from "./strength";
import { NUMBER_STYLES } from "../number-style";
import { numbersIn } from "../numbers";
import { metric, months } from "../test/fixtures";
import { runs } from "../test/reference/check";
import type { Metric, Point } from "../types";
import { decimalsFor, FIT_RECIPES, stepOf, movesTakeaway, needsTakeaway, predictTakeaway, shareWord, SHARE_WORDS, whatMoves, whatNeeds, written } from "./fit-takeaway";
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
    const step = stepOf(visits.spread);
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
    // Both shares are shown, each with its own label, so that "little" beside 100 % cannot be misread.
    expect(t.numbers.filter((n) => n.label.startsWith("Visits: Share")).map((n) => n.label)).toEqual(["Visits: Share of all the movement", "Visits: Share of what the line explains"]);
  });
  it("says a driver whose link cannot be told from chance as that, and does not name it in the sentence", () => {
    const row = t.rows.find((r) => r.name === "Support tickets")!;
    expect(row.strength).toBe("cant-tell");
    expect(row.sentence).toBe("Support tickets: it cannot be told whether Revenue goes up or down with it.");
    expect(t.sentence).not.toContain("Support tickets");
  });
  it("has the top driver's range as the Takeaway's range, and no number outside what the Method gave", () => {
    const top = f.drivers.reduce((a, d) => (d.share > a.share ? d : a));
    const step = stepOf(top.spread);
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
    const d0 = one.drivers[0];
    const step0 = stepOf(d0.spread);
    expect(movesTakeaway(R, [V], one, ctx).rows[0].sentence).toBe(`When Visits goes up by ${formatNumber(step0, 0, ctx.style)}, Revenue has gone up by about ${formatValue(R, d0.effect * step0, ctx.style)} (likely between ${formatValue(R, d0.lo * step0, ctx.style)} and ${formatValue(R, d0.hi * step0, ctx.style)}).`);
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
    expect(bt.cautions.find((c) => c.startsWith("This result is pulled"))).toMatch(/^This result is pulled by 1 month far from the rest; without them it reads .+ for each step of .+ in .+\.$/);
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
    // Exactly in step, equal links, no ids: the name decides, and the note says whose unit the effect is in.
    expect(t2.notes).toEqual(["Sessions and Visits move so closely that Ziffr cannot tell which matters; treated as one, and the effect is in the unit of Sessions."]);
    expect(t2.rows.map((r) => r.name)).not.toContain("Visits");
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
      const step = stepOf(f.drivers[0].spread);
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
    expect(t.refusal).toBe("Revenue has not moved with Visits at all, so no value of Visits reaches the value you want.");
    expect([t.sentence, t.range, t.strength, t.footer]).toEqual([null, null, null, null]);
    const bad = needsTakeaway(R, V, f, NaN, needs(f, { goal: NaN, driver: 0 }), ctx, [V, P]);
    expect(bad.kind).toBe("refusal");
  });
});

describe("what mutation testing asked for", () => {
  it("writes a value to at least two significant digits of the smallest number beside it, never fewer than the Metric's decimals", () => {
    const eur = { unit: "€", unit_position: "after" as const, decimals: 0 };
    expect(decimalsFor(eur, 2400, 0.8)).toBe(2);
    expect(decimalsFor(eur, 5)).toBe(1);
    expect(decimalsFor({ ...eur, decimals: 1 }, 0)).toBe(1);
    expect(decimalsFor({ ...eur, decimals: 3 }, 2400)).toBe(3);
    expect(decimalsFor(eur, 1e-9)).toBe(10);
    expect(decimalsFor(eur, 1e-30)).toBe(15);
    expect(decimalsFor(eur, 0.0042, 3)).toBe(4);
    expect(written(eur, 0.8, ctx)).toBe("0.80 €");
    expect(written(eur, 1234.5, ctx)).toBe("1,235 €");
    expect(written(eur, 2400, ctx, [2400, 0.8])).toBe("2,400.00 €");
  });
  /** Revenue from Visits, Price, Tickets and Orders with the effects given, so that each can be made to matter. */
  const four = (effects: [number, number, number, number]) => {
    const r = lcg(21);
    const n = 30;
    const cols = [0, 1, 2, 3].map(() => Array.from({ length: n }, () => Math.round(r() * 100)));
    const rev = cols[0].map((_, i) => Math.round(cols.reduce((sum, c, j) => sum + effects[j] * c[i], 500) + gauss(r) * 20));
    const O = metric({ id: 5, slug: "orders", name: "Orders", unit: "", period: "month", aggregation: "sum" });
    const ms = [V, P, T, O];
    const series: Record<string, Point[]> = { revenue: months("2024-01", rev), visits: months("2024-01", cols[0]), price: months("2024-01", cols[1]), tickets: months("2024-01", cols[2]), orders: months("2024-01", cols[3]) };
    return { ms, series, resolve: resolverFrom([R, ...ms], series) };
  };
  it("names the top three of four, and lists three as 'A, B and C', in order of their share", () => {
    const w = four([30, 20, 10, 5]);
    const t = whatMoves(R, w.ms, w.resolve, opts);
    expect(t.sentence).toBe("Over 30 months, Visits, Price and Support tickets moved with Revenue the most, with the others held the same.");
    expect(t.rows.map((r) => r.name)).toEqual(["Visits", "Price", "Support tickets", "Orders"]);
    const flipped = four([5, 10, 20, 30]);
    const u = whatMoves(R, flipped.ms, flipped.resolve, opts);
    expect(u.sentence).toBe("Over 30 months, Orders, Support tickets and Price moved with Revenue the most, with the others held the same.");
    expect(u.rows.map((r) => r.name)).toEqual(["Orders", "Support tickets", "Price", "Visits"]);
    // The Takeaway's own strength and range are the first driver's.
    expect(u.strength).toBe(u.rows[0].strength);
    const n = whatNeeds(R, flipped.ms, 2500, flipped.resolve, opts);
    expect(n.rows.map((r) => r.name)).toEqual(["Orders", "Support tickets", "Price", "Visits"]);
  });
  it("puts a dominant driver first even when it is listed second", () => {
    const w = world(30, { priceEffect: -40000 });
    const t = whatMoves(R, [V, P, T], resolverFrom([R, V, P, T], w.series), opts);
    expect(t.rows.map((r) => r.name).slice(0, 2)).toEqual(["Price", "Visits"]);
    expect(t.sentence).toBe("Over 30 months, Price and Visits moved with Revenue the most, with the others held the same.");
  });
  it("quotes the top driver's effect without the far-off months, per its own step, and caps every strength", () => {
    const x = world(30, { priceEffect: -150000 });
    const bad = { ...x.series, revenue: x.series.revenue.map((p, i) => (i === 11 ? { ...p, value: p.value + 300000 } : p)) };
    const f = ok(fitOf({ ...x, series: bad }));
    const t = movesTakeaway(R, [V, P, T], f, ctx);
    const far = f.verdict.cautions.find((c) => c.case === "caution-far-off")!;
    const top = f.drivers.reduce((a, d) => (d.share > a.share ? d : a));
    expect(top.name).toBe("Price");
    const step = stepOf(top.spread);
    const metric = [V, P, T].find((m) => m.name === top.name)!;
    expect(t.cautions[0]).toBe(`This result is pulled by 1 month far from the rest; without them it reads ${written(R, (far.slots.without as number) * step, ctx)} for each step of ${written(metric, step, ctx)} in ${top.name}.`);
    for (const d of f.drivers) expect(t.rows.find((r) => r.name === d.name)!.strength).toBe(strengthOf(d.partial, partialPeriods(f.n, f.drivers.length), true));
    expect(t.rows.every((r) => r.strength !== "strong")).toBe(true);
  });
  it("lowers a strong link to moderate when a caution is said, for the whole Takeaway and for each driver", () => {
    const x = Array.from({ length: 30 }, (_, i) => i + 1);
    const r = lcg(2);
    const y = x.map((v) => Math.round((v * v) / 5 + gauss(r) * 0.4));
    const c = ok(fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: months("2024-01", x) }], span: "month", basis: "values" }));
    expect(c.drivers[0].strength).toBe("strong");
    const t = movesTakeaway(R, [V], c, ctx);
    expect(t.cautions).toEqual(["The link looks curved, so a straight-line reading is rough."]);
    expect([t.strength, t.rows[0].strength]).toEqual(["moderate", "moderate"]);
  });
  it("says nothing of an effect whose range stays on one side of 0 but that cannot be told from chance", () => {
    let found = 0;
    for (let seed = 1; seed < 400 && found === 0; seed++) {
      const r = lcg(seed);
      const x = Array.from({ length: 14 }, () => Math.round(r() * 100));
      const y = x.map((v) => Math.round(0.12 * v + gauss(r) * 10 + 50));
      const f = fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: months("2024-01", x) }], span: "month", basis: "values" });
      if (!f.ok) continue;
      const d = f.drivers[0];
      if (d.strength !== "cant-tell" || d.lo * d.hi <= 0) continue;
      found++;
      const t = movesTakeaway(R, [V], f, ctx);
      expect(t.rows[0].sentence).toBeNull();
      expect(t.range).toBeNull();
    }
    expect(found).toBe(1);
  });
  it("leaves out a month still under way when a shorter period is combined: today inside the last month drops it, a later today keeps it", () => {
    const w = world();
    const weeks: Point[] = Array.from({ length: 140 }, (_, i) => ({ period: new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10), value: 100 + ((i * 37) % 53) }));
    const weekly = metric({ id: 30, slug: "weekly", name: "Orders", period: "week", aggregation: "sum" });
    const r = resolverFrom([R, weekly, P], { revenue: months("2024-01", [...w.revenue, ...w.revenue, ...w.revenue]), weekly: weeks, price: months("2024-01", [...w.price, ...w.price, ...w.price]) });
    const count = (today: string) => Number(/^Over (\d+) months/.exec(whatMoves(R, [weekly, P], r, { ...opts, today }).sentence!)![1]);
    expect(count("2026-08-15")).toBe(count("2027-06-01") - 1);
  });
  it("refuses two drivers of which one is worked out from the other, naming them", () => {
    const w = world();
    const derived = metric({ id: 8, slug: "double-visits", name: "Double visits", formula: "{visits} * 2", period: "month", aggregation: "sum" });
    const r = resolverFrom([R, V, derived], { ...w.series, "double-visits": w.series.visits.map((p) => ({ ...p, value: p.value * 2 })) });
    const t = whatMoves(R, [V, derived], r, opts);
    expect(t.refusal).toBe("Double visits is worked out from Visits, so comparing them tells nothing.");
  });
  it("writes a small value and its range to two significant digits, and the whole structure of a value read from a fit", () => {
    const r = lcg(5);
    const x = Array.from({ length: 24 }, () => Math.round(r() * 1000) / 100);
    const y = x.map((v) => Math.round((0.1 * v + 0.2 + gauss(r) * 0.05) * 1000) / 1000);
    const rate = metric({ id: 1, slug: "revenue", name: "Rate", unit: "%", unit_position: "after", decimals: 0, period: "month", aggregation: "sum" });
    const f = ok(fit({ target: { name: "Rate", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: months("2024-01", x) }], span: "month", basis: "values" }));
    const p = predict(f, [5]);
    if (!p.ok || p.lo === null) throw new Error("no range");
    const t = predictTakeaway(rate, [V], f, [5], p, ctx);
    const digits = decimalsFor(rate, p.value, p.lo, p.hi!);
    const shown = (v: number) => formatValue({ ...rate, decimals: digits }, v, ctx.style);
    expect(digits).toBeGreaterThan(0);
    expect(t.sentence).toBe(`With Visits at ${written(V, 5, ctx)}, Rate is likely between ${shown(p.lo)} and ${shown(p.hi!)}.`);
    expect(t.range).toEqual({ lo: p.lo, hi: p.hi, text: `${shown(p.lo)} – ${shown(p.hi!)}` });
    expect(t.figures).toEqual([
      { label: "Value read", value: p.value, text: shown(p.value) },
      { label: "Likely between", value: p.lo, text: shown(p.lo) },
      { label: "Likely between", value: p.hi, text: shown(p.hi!) },
    ]);
    expect(t.numbers).toEqual([
      { label: "Method", text: "A value read from that line, with the range of a single period" },
      { label: "Values given", text: `Visits at ${written(V, 5, ctx)}` },
      { label: "Periods", text: `${f.from} – ${f.to}` },
      { label: "Typical miss", text: written(rate, f.miss, ctx) },
    ]);
    expect(t.basis).toBe("compared by value, over 24 months");
    // Outside what was seen: the point, and the same structure without the range.
    const q = predict(f, [50]);
    if (!q.ok) throw new Error("refused");
    const g = predictTakeaway(rate, [V], f, [50], q, ctx);
    expect(g.figures).toEqual([{ label: "Value read", value: q.value, text: written(rate, q.value, ctx, [q.value]) }]);
    expect(g.sentence).toBe(`With Visits at ${written(V, 50, ctx)}, Rate comes to about ${written(rate, q.value, ctx, [q.value])}. This is higher than Visits has ever been (highest ${written(V, f.drivers[0].high, ctx)}), so treat it as a guess.`);
  });
  it("writes every number of a range to the digits its smallest needs: a value 1,200 with a range from 0.8 to 2,400", () => {
    const w = world();
    const f = ok(fitOf(w, [V, P]));
    const none = { refusals: [], cautions: [], switches: [] };
    const p = predictTakeaway(R, [V, P], f, [50000, 9], { ok: true, value: 1200, lo: 0.8, hi: 2400, outside: [], verdict: none }, ctx);
    expect(p.kind).toBe("answer");
    expect(p.sentence).toBe(`With Visits at ${written(V, 50000, ctx)} and Price at 9.00 €, Revenue is likely between 0.80 € and 2,400.00 €.`);
    expect(p.figures.map((x) => x.text)).toEqual(["1,200.00 €", "0.80 €", "2,400.00 €"]);
    const n = needsTakeaway(R, V, f, 1200, { ok: true, value: 1200, lo: 0.8, hi: 2400, current: 100, outside: [], verdict: none }, ctx, [V, P]);
    expect(n.kind).toBe("answer");
    expect(n.sentence).toBe("To reach 1,200 €, Visits would need to be around 1,200.00 (likely between 0.80 and 2,400.00), 1,100 % above today.");
    expect(n.range).toEqual({ lo: 0.8, hi: 2400, text: "0.80 – 2,400.00" });
    // A value with no range is written to the digits of the value alone.
    const g = needsTakeaway(R, V, f, 1200, { ok: true, value: 1200, lo: null, hi: null, current: 100, outside: [], verdict: none }, ctx, [V, P]);
    expect(g.sentence).toContain("around 1,200,");
  });
  it("gives the second driver's own unit and strength where a value is outside what it has been, and a driver that cannot be told from chance as that", () => {
    const w = world(30, { ticketsEffect: 0 });
    const f = ok(fitOf(w, [V, P, T]));
    const low = f.drivers[1].low - 1;
    const q = predict(f, [50000, low, f.last.x[2]]);
    if (!q.ok) throw new Error("refused");
    expect(predictTakeaway(R, [V, P, T], f, [50000, low, f.last.x[2]], q, ctx).sentence).toContain(`This is lower than Price has ever been (lowest ${written(P, f.drivers[1].low, ctx)}), so treat it as a guess.`);
    expect(f.drivers[2].strength).toBe("cant-tell");
    expect(f.drivers[0].strength).not.toBe("cant-tell");
    const mid = predict(f, [50000, f.last.x[1], (f.drivers[2].low + f.drivers[2].high) / 2]);
    if (!mid.ok) throw new Error("refused");
    const n = needs(f, { goal: Math.round(mid.value), driver: 2 });
    expect(needsTakeaway(R, T, f, Math.round(mid.value), n, ctx, [V, P, T]).strength).toBe("cant-tell");
  });
  it("caps a strong link to moderate in What does B need? where a caution is said, and keeps it where none is", () => {
    // Visits in no order, so that the link is compared by value, and a curved link to Revenue.
    const x = Array.from({ length: 30 }, (_, i) => ((i * 7) % 30) + 1);
    const r = lcg(2);
    const y = x.map((v) => Math.round((v * v) / 5 + gauss(r) * 0.4));
    const res = resolverFrom([R, V], { revenue: months("2024-01", y), visits: months("2024-01", x) });
    const t = whatNeeds(R, [V], 45, res, opts);
    expect(t.refusal).toBeNull();
    expect(t.strength).toBe("moderate");
    const straight = x.map((v, i) => 2 * v + ((i * 5) % 7 - 3) / 5);
    const s = whatNeeds(R, [V], 45, resolverFrom([R, V], { revenue: months("2024-01", straight), visits: months("2024-01", x) }), opts);
    expect(s.cautions).toEqual([]);
    expect(s.strength).toBe("strong");
  });
  it("gives what a driver needs as a whole structure, for the second driver, with the strength of that driver and none stronger than moderate with a caution", () => {
    const w = world();
    const f = ok(fitOf(w, [V, P]));
    const mid = predict(f, [f.last.x[0], (f.drivers[1].low + f.drivers[1].high) / 2]);
    if (!mid.ok) throw new Error("refused");
    const goal = Math.round(mid.value);
    const n = needs(f, { goal, driver: 1 });
    if (!n.ok || n.lo === null) throw new Error("no range");
    const t = needsTakeaway(R, P, f, goal, n, ctx, [V, P]);
    const digits = decimalsFor(P, n.value, n.lo, n.hi!);
    const shown = (v: number) => formatValue({ ...P, decimals: digits }, v, ctx.style);
    expect(t.strength).toBe(strengthOf(f.drivers[1].partial, partialPeriods(f.n, 2)));
    expect(t.range).toEqual({ lo: n.lo, hi: n.hi, text: `${shown(n.lo)} – ${shown(n.hi!)}` });
    expect(t.figures).toEqual([
      { label: "Value wanted", value: goal, text: written(R, goal, ctx) },
      { label: "Value needed", value: n.value, text: shown(n.value) },
    ]);
    expect(t.numbers).toEqual([
      { label: "Method", text: "That line turned round for one driver" },
      { label: "Value wanted", text: written(R, goal, ctx) },
      { label: "Value needed", text: shown(n.value) },
      { label: "Periods", text: `${f.from} – ${f.to}` },
      { label: "Compared on", text: "compared by value" },
    ]);
    // A curved link in range is a caution, and the strength is capped.
    const x = Array.from({ length: 30 }, (_, i) => i + 1);
    const r = lcg(2);
    const y = x.map((v) => Math.round((v * v) / 5 + gauss(r) * 0.4));
    const c = ok(fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: months("2024-01", x) }], span: "month", basis: "values" }));
    expect(c.drivers[0].strength).toBe("strong");
    const cn = needs(c, { goal: 45, driver: 0 });
    const ct = needsTakeaway(R, V, c, 45, cn, ctx, [V]);
    expect(ct.cautions).toEqual(["The link looks curved, so a straight-line reading is rough."]);
    expect(ct.strength).toBe("moderate");
  });
  it("gives the point and the guess for what a driver needs, as a whole structure", () => {
    const w = world();
    const f = ok(fitOf(w, [V, P]));
    const goal = 400000;
    const n = needs(f, { goal, driver: 0 });
    if (!n.ok) throw new Error("refused");
    const t = needsTakeaway(R, V, f, goal, n, ctx, [V, P]);
    expect(t.range).toBeNull();
    expect(t.figures).toEqual([
      { label: "Value wanted", value: goal, text: "400,000 €" },
      { label: "Value needed", value: n.value, text: written(V, n.value, ctx, [n.value]) },
    ]);
    expect(t.sentence).toBe(`To reach 400,000 €, Visits would need to be around ${written(V, n.value, ctx, [n.value])}, ${t.sentence!.match(/\d+ % above today/)![0]}. This is higher than Visits has ever been (highest ${written(V, f.drivers[0].high, ctx)}), so treat it as a guess.`);
  });
  it("says to treat a held driver's value outside what it has been as a guess, in that driver's unit", () => {
    const w = world();
    const f = ok(fitOf(w, [V, P]));
    const at = predict(f, [50000, 20]);
    if (!at.ok) throw new Error("refused");
    const n = needs(f, { goal: at.value, driver: 0, held: [0, 20] });
    if (!n.ok) throw new Error("refused");
    expect(n.outside.map((o) => o.name)).toEqual(["Price"]);
    const t = needsTakeaway(R, V, f, at.value, n, ctx, [V, P]);
    expect(t.sentence).toContain(`This is higher than Price has ever been (highest ${written(P, f.drivers[1].high, ctx)})`);
  });
});

describe("what a review asked for", () => {
  it(`never writes a number above 0 as 0, keeps its sign, and keeps a step within the spread (${numRuns} values, seed ${seed})`, () => {
    const m = { unit: "", unit_position: "after" as const, decimals: 0 };
    fc.assert(
      fc.property(fc.integer({ min: -14, max: 9 }), fc.double({ min: 1, max: 9.99, noNaN: true }), fc.boolean(), (e, mantissa, negative) => {
        const v = (negative ? -1 : 1) * mantissa * 10 ** e;
        const t = written(m, v, ctx);
        expect(t, `${v}`).toMatch(/[1-9]/);
        expect(t.startsWith("−")).toBe(negative);
        // And with a small neighbour the digits follow the smaller.
        const t2 = written(m, 1e6, ctx, [1e6, v]);
        expect((t2.split(".")[1] ?? "").length).toBeGreaterThanOrEqual(Math.min(15, Math.max(0, Math.ceil(1 - Math.log10(Math.abs(v))))));
      }),
      { numRuns, seed },
    );
    // A step stays within what the driver has been: at most its spread, and a power of ten more than a tenth of it.
    fc.assert(fc.property(fc.integer({ min: -12, max: 9 }), fc.double({ min: 1, max: 9.99, noNaN: true }), (b, mant) => {
      const spread = mant * 10 ** b;
      const step = stepOf(spread);
      expect(step).toBeLessThanOrEqual(spread * (1 + 1e-12));
      expect(step).toBeGreaterThan(spread / 10);
    }), { numRuns, seed });
  });
  it("says an effect of 0.0000003 per Visit per step within the spread of Visits, to two significant digits, not as 0", () => {
    const r = lcg(31);
    const visits = Array.from({ length: 30 }, () => Math.round(r() * 1e6));
    const conv = visits.map((v) => Math.round((v * 3e-7 + 0.1 + gauss(r) * 0.02) * 1e6) / 1e6);
    const C = metric({ id: 1, slug: "revenue", name: "Conversion", unit: "", unit_position: "after", decimals: 2, period: "month", aggregation: "sum" });
    const f = ok(fit({ target: { name: "Conversion", points: months("2024-01", conv) }, drivers: [{ name: "Visits", points: months("2024-01", visits) }], span: "month", basis: "values" }));
    const t = movesTakeaway(C, [V], f, ctx);
    expect(t.rows[0].sentence).toMatch(/^When Visits goes up by 100,000, Conversion has gone up by about 0\.0\d+ \(likely between 0\.0\d+ and 0\.0\d+\)/);
    expect(t.rows[0].sentence).not.toMatch(/about 0\.0+ /);
  });
  it("words the share by what the driver explains of all the movement, not of what the line explains", () => {
    const r = lcg(8);
    const x = Array.from({ length: 30 }, () => Math.round(r() * 100));
    const weak = x.map((v) => Math.round(0.2 * v + gauss(r) * 40));
    const strong = x.map((v) => Math.round(2 * v + gauss(r) * 2));
    for (const [y, word] of [[weak, "little"], [strong, "nearly all"]] as const) {
      const f = ok(fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: months("2024-01", x) }], span: "month", basis: "values" }));
      const t = movesTakeaway(R, [V], f, ctx);
      expect(f.drivers[0].share).toBe(1);
      expect(t.rows[0].share).toBe(shareWord(f.drivers[0].explains) === "share-little" ? "little" : "nearly all");
      expect(t.rows[0].line).toBe(`Visits: ${word} of the movement in Revenue, ${t.rows[0].strengthText}`);
    }
  });
  it("says all drivers moved with the target, the first the most, when every one is named", () => {
    const w = world();
    const t = whatMoves(R, [V, P], resolverFrom([R, V, P], w.series), opts);
    expect(t.sentence).toBe("Over 30 months, Visits and Price all moved with Revenue, the first the most, with the others held the same.".replace("Visits and Price", t.rows.map((x) => x.name).join(" and ")));
    const three = whatMoves(R, [V, P, T], resolverFrom([R, V, P, T], world(30, { ticketsEffect: 300 }).series), opts);
    expect(three.sentence).toMatch(/^Over 30 months, .+, .+ and .+ all moved with Revenue, the first the most/);
  });
  it("gives the same Takeaway in every order the drivers are listed in, also for drivers exactly in step", () => {
    const w = world();
    const twin = metric({ id: 9, slug: "sessions", name: "Sessions", unit: "", period: "month", aggregation: "sum" });
    const series = { ...w.series, sessions: w.series.visits.map((p) => ({ ...p, value: p.value * 2 })) };
    const res = resolverFrom([R, V, P, T, twin], series);
    const all = [V, P, T, twin];
    const orders = [[0, 1, 2, 3], [3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1], [3, 0, 1, 2], [1, 2, 3, 0]];
    const results = orders.map((o) => whatMoves(R, o.map((i) => all[i]), res, opts));
    for (const t of results) expect(JSON.stringify(t)).toBe(JSON.stringify(results[0]));
    // The lower id (Visits, 2) is the one kept, and the note says whose unit the effect is in.
    expect(results[0].notes).toEqual(["Visits and Sessions move so closely that Ziffr cannot tell which matters; treated as one, and the effect is in the unit of Visits."]);
    const needsResults = orders.map((o) => whatNeeds(R, o.map((i) => all[i]), 100000, res, opts));
    for (const t of needsResults) expect(JSON.stringify(t)).toBe(JSON.stringify(needsResults[0]));
  });
  it("says a missing value and the changes it costs where compared by change, and 'no value' where compared by value", () => {
    const trend = Array.from({ length: 36 }, (_, i) => 100 + 4 * i);
    const r = lcg(13);
    const a = trend.map((v) => Math.round(v * 10 + gauss(r) * 30));
    const y = a.map((v) => Math.round(v * 2 + gauss(r) * 40));
    const holey = months("2024-01", a).filter((_, i) => i !== 10);
    const f = ok(fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: holey }], span: "month" }));
    expect(f.basis).toBe("changes");
    const t = movesTakeaway(R, [V], f, ctx);
    expect(t.cautions[0]).toBe("Visits: no value for November 2024, so the changes into and out of November 2024 could not be worked out and were left out.");
    const byValue = ok(fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: holey }], span: "month", basis: "values" }));
    expect(movesTakeaway(R, [V], byValue, ctx).cautions[0]).toBe("Visits: no value for 1 of 36 months, left out.");
  });
  it("says next month where a value is read from a fit compared by change", () => {
    const r = lcg(13);
    const trend = Array.from({ length: 36 }, (_, i) => 100 + 4 * i);
    const a = trend.map((v) => Math.round(v * 10 + gauss(r) * 30));
    const y = a.map((v) => Math.round(v * 2 + gauss(r) * 40));
    const f = ok(fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: months("2024-01", a) }], span: "month" }));
    const p = predict(f, [f.last.x[0] + 5]);
    expect(predictTakeaway(R, [V], f, [f.last.x[0] + 5], p, ctx).sentence).toMatch(/^Next month, with Visits at [\d,]+, Revenue is likely between/);
    const q = predict(f, [f.last.x[0] + 1e6]);
    expect(predictTakeaway(R, [V], f, [f.last.x[0] + 1e6], q, ctx).sentence).toMatch(/^Next month, with Visits at/);
  });
});

describe("what a second review asked for", () => {
  it("says crowded drivers above the answer, with the ranges as the measure, and never strong", () => {
    const r = lcg(66);
    const free = () => Array.from({ length: 40 }, () => Math.round(r() * 100));
    const [x1, x2, f4] = [free(), free(), free()];
    const noise = Array.from({ length: 40 }, () => gauss(r));
    const y = x1.map((v, i) => Math.round(0.5 * v + 0.5 * x2[i] + 3 * f4[i] + gauss(r) * 5));
    let said = false;
    for (let sd = 4; sd < 40 && !said; sd += 0.5) {
      const x3 = x1.map((v, i) => Math.round(v + x2[i] + noise[i] * sd));
      const f = fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [x1, x2, x3, f4].map((c, i) => ({ name: ["Visits", "Price", "Support tickets", "Orders"][i], points: months("2024-01", c) })), span: "month", basis: "values" });
      if (!f.ok || f.crowded.length === 0) continue;
      said = true;
      const t = movesTakeaway(R, [V, P, T, metric({ id: 5, slug: "orders", name: "Orders", unit: "" })], f, ctx);
      expect(t.cautions).toContain(`${listAnd(f.crowded)} move closely together, so their separate effects are less certain; the ranges show how much.`);
      expect(t.rows.every((x) => x.strength !== "strong")).toBe(true);
    }
    expect(said).toBe(true);
  });
  const listAnd = (names: string[]) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
  it("names up to four months with no value, then how many more, with the changes they cost", () => {
    const r = lcg(13);
    const trend = Array.from({ length: 100 }, (_, i) => 100 + 4 * i);
    const a = trend.map((v) => Math.round(v * 10 + gauss(r) * 30));
    const y = a.map((v) => Math.round(v * 2 + gauss(r) * 40));
    const drop = (idx: number[]) => months("2024-01", a).filter((_, i) => !idx.includes(i));
    const at = (idx: number[]) => ok(fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: drop(idx) }], span: "month" }));
    expect(movesTakeaway(R, [V], at([4, 19, 34]), ctx).cautions[0]).toBe("Visits: no value for May 2024, August 2025 and November 2026, so the changes into and out of May 2024, August 2025 and November 2026 could not be worked out and were left out.");
    expect(movesTakeaway(R, [V], at([4, 19, 34, 49]), ctx).cautions[0]).toContain("no value for May 2024, August 2025, November 2026 and February 2028, so");
    expect(movesTakeaway(R, [V], at([4, 19, 34, 49, 64]), ctx).cautions[0]).toContain("no value for May 2024, August 2025, November 2026 and 2 more, so");
  });
  it("writes the periods of a gap by the Fiscal Year where they are quarters", () => {
    const r = lcg(13);
    const n = 60;
    const trend = Array.from({ length: n }, (_, i) => 100 + 4 * i);
    const a = trend.map((v) => Math.round(v * 10 + gauss(r) * 30));
    const y = a.map((v) => Math.round(v * 2 + gauss(r) * 40));
    const qs = (vs: number[]): Point[] => vs.map((value, i) => ({ period: new Date(Date.UTC(2020, 3 * i, 1)).toISOString().slice(0, 10), value }));
    const f = ok(fit({ target: { name: "Revenue", points: qs(y) }, drivers: [{ name: "Visits", points: qs(a).filter((_, i) => i !== 20) }], span: "quarter" }));
    const q = metric({ id: 1, slug: "revenue", name: "Revenue", period: "quarter" });
    const [april, january] = [movesTakeaway(q, [V], f, { style: "1,234.5", yearStart: 4 }).cautions[0], movesTakeaway(q, [V], f, { style: "1,234.5", yearStart: 1 }).cautions[0]];
    expect(april).toContain("no value for Q4 FY 2024/25,");
    expect(january).toContain("no value for Q1 2025,");
  });
  it("breaks a tie at the cutoff of the first pass by Metric id, in any order given", () => {
    const r = lcg(3);
    const n = 40;
    const base = Array.from({ length: n }, () => Math.round(r() * 100));
    const revenue = base.map((v) => v * 3 + Math.round(r() * 10));
    // Eight Metrics with exactly the same series: all tie, 6 can be kept, ids 10 to 17.
    const many = Array.from({ length: 8 }, (_, i) => metric({ id: 10 + i, slug: `t${i}`, name: `T${7 - i}`, period: "month", aggregation: "sum" }));
    const series: Record<string, Point[]> = { revenue: months("2024-01", revenue) };
    many.forEach((m) => (series[m.slug] = months("2024-01", base)));
    const res = resolverFrom([R, ...many], series);
    const a = whatMoves(R, many, res, opts);
    const b = whatMoves(R, [...many].reverse(), res, opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Identical series are exactly in step, so they come out as one; the ones left out are the highest ids (T1 and T0 here).
    expect(a.notes.find((x) => x.startsWith("Left out"))).toBe("Left out of the first pass, as they moved less closely with Revenue: T1 and T0.");
  });
  it("keeps the notes about who was left out when the fit after the first pass is refused", () => {
    const r = lcg(5);
    const n = 40;
    const cols = Array.from({ length: 8 }, () => Array.from({ length: n }, () => Math.round(r() * 100)));
    const many = cols.map((_, i) => metric({ id: 20 + i, slug: `u${i}`, name: `U${i}`, period: "month", aggregation: "sum" }));
    // Revenue does not change: every fit is refused, after the first pass.
    const series: Record<string, Point[]> = { revenue: months("2024-01", Array.from({ length: n }, () => 5)) };
    many.forEach((m, i) => (series[m.slug] = months("2024-01", cols[i])));
    const res = resolverFrom([R, ...many], series);
    const t = whatMoves(R, many, res, opts);
    expect(t.kind).toBe("refusal");
    expect(t.notes).toHaveLength(2);
    const u = whatNeeds(R, many, 5, res, opts);
    expect(u.kind).toBe("refusal");
    // Revenue that varies but a goal that is far: refused after the first pass, notes kept.
    const varied = { ...series, revenue: months("2024-01", cols[0].map((v, i) => v + cols[1][i])) };
    const far = whatNeeds(R, many, 1e9, resolverFrom([R, ...many], varied), opts);
    expect(far.refusal).toMatch(/is more than 1,000 times/);
    expect(far.notes[0]).toMatch(/^8 Metrics are more than \d+ months can weigh/);
    expect(far.notes).toHaveLength(2);
  });
});

describe("what a third review asked for", () => {
  it("writes a narrow range with the digits that tell its ends apart, up to 15, for effects and values", () => {
    const m = { unit: "", unit_position: "after" as const, decimals: 0 };
    // 0.002977 to 0.003035: two significant digits write both as 0.0030; the digits go on until they differ.
    const like = [0.003, 0.002977, 0.003035];
    const [lo, eff, hi] = [written(m, 0.002977, ctx, like), written(m, 0.003, ctx, like), written(m, 0.003035, ctx, like)];
    expect(new Set([lo, eff, hi]).size).toBe(3);
    expect([lo, eff, hi]).toEqual(["0.00298", "0.00300", "0.00304"].map((x, i) => [lo, eff, hi][i]));
    expect(lo.length).toBe(7);
    const neg = [-0.003, -0.002977, -0.003035];
    expect(new Set(neg.map((v) => written(m, v, ctx, neg))).size).toBe(3);
    // Values that differ only far out stop at 15 places, and equal values stay one.
    expect(written(m, 1, ctx, [1, 1 + 1e-17])).toBe("1.0");
    // Two numbers that differ only beyond 15 places stop at 15 (and do not go on for ever).
    expect(written(m, 1, ctx, [1, 1 + 2.3e-16])).toBe("1.000000000000000");
    expect(written(m, 2, ctx, [2, 2])).toBe("2.0");
    fc.assert(
      fc.property(fc.integer({ min: -9, max: 6 }), fc.double({ min: 1, max: 9.9, noNaN: true }), fc.double({ min: 1e-6, max: 0.05, noNaN: true }), (e, mant, gap) => {
        const lo = mant * 10 ** e;
        const hi = lo * (1 + gap);
        const eff = (lo + hi) / 2;
        // Fifteen places can tell apart three numbers only where they are at least 2e-15 apart.
        if (hi - lo < 4e-15) return;
        const [a, b, c] = [written(m, lo, ctx, [eff, lo, hi]), written(m, eff, ctx, [eff, lo, hi]), written(m, hi, ctx, [eff, lo, hi])];
        expect(new Set([a, b, c]).size, `${lo} ${eff} ${hi}`).toBe(3);
      }),
      { numRuns, seed },
    );
  });
  it("says a narrow effect range with its ends apart in the sentence", () => {
    const r = lcg(71);
    const x = Array.from({ length: 120 }, () => Math.round(r() * 1e6));
    const y = x.map((v) => Math.round((v * 3e-6 + gauss(r) * 1e-7) * 1e9) / 1e9 + 1);
    const C = metric({ id: 1, slug: "revenue", name: "Conversion", unit: "", unit_position: "after", decimals: 2, period: "month", aggregation: "sum" });
    const f = ok(fit({ target: { name: "Conversion", points: months("2018-01", y) }, drivers: [{ name: "Visits", points: months("2018-01", x) }], span: "month", basis: "values" }));
    const sentence = movesTakeaway(C, [V], f, ctx).rows[0].sentence!;
    const [, lo, hi] = /between ([\d.,]+) and ([\d.,]+)\)/.exec(sentence)!;
    expect(lo).not.toBe(hi);
  });
  const manyWorld = (n: number, trend: boolean) => {
    const r = lcg(81);
    const many = Array.from({ length: 8 }, (_, i) => metric({ id: 100 + i, slug: `w${i}`, name: `W${i}`, period: "month", aggregation: "sum" }));
    const cols = many.map(() => Array.from({ length: n }, (_, i) => Math.round(r() * 100) + (trend ? 3 * i : 0)));
    const revenue = cols[0].map((v, i) => 2 * v + cols[1][i] + Math.round(r() * 10));
    const series: Record<string, Point[]> = { revenue: months("2018-01", revenue) };
    many.forEach((m, i) => (series[m.slug] = months("2018-01", cols[i])));
    return whatMoves(R, many, resolverFrom([R, ...many], series), opts);
  };
  it("counts the periods by the basis the fit uses: by value none is lost, by change one", () => {
    // 30 months by value: 5 drivers (one per 6 periods), and the note says 30, as the answer does.
    const byValue = manyWorld(30, false);
    expect(byValue.basis).toBe("compared by value, over 30 months");
    expect(byValue.notes[0]).toBe("8 Metrics are more than 30 months can weigh, so the 5 that move most closely with Revenue were chosen first and the others left out.");
    expect(byValue.rows).toHaveLength(5);
    expect(byValue.sentence).toMatch(/^Over 30 months/);
    // By change (everything grows): 29 changes carry 4.
    const byChange = manyWorld(30, true);
    expect(byChange.basis).toBe("compared by change, growth removed, over 29 months");
    expect(byChange.notes[0]).toBe("8 Metrics are more than 29 months can weigh, so the 4 that move most closely with Revenue were chosen first and the others left out.");
    expect(byChange.rows).toHaveLength(4);
  });
  it("counts the periods by the basis of the Metrics chosen, not of those left out", () => {
    const r = lcg(81);
    const n = 30;
    const many = Array.from({ length: 8 }, (_, i) => metric({ id: 200 + i, slug: `z${i}`, name: `Z${i}`, period: "month", aggregation: "sum" }));
    const cols = many.map(() => Array.from({ length: n }, () => Math.round(r() * 100)));
    // The target grows, and so does the last Metric, but its changes have nothing to do with the target's: it is left out.
    cols[7] = cols[7].map((v, i) => v + 20 * i);
    const revenue = cols[0].map((v, i) => 2 * v + cols[1][i] + 20 * i + Math.round(r() * 10));
    const series: Record<string, Point[]> = { revenue: months("2018-01", revenue) };
    many.forEach((m, i) => (series[m.slug] = months("2018-01", cols[i])));
    const t = whatMoves(R, many, resolverFrom([R, ...many], series), opts);
    expect(t.rows.map((x) => x.name)).not.toContain("Z7");
    expect(t.basis).toBe("compared by value, over 30 months");
    expect(t.notes[0]).toBe("8 Metrics are more than 30 months can weigh, so the 5 that move most closely with Revenue were chosen first and the others left out.");
  });
  it("says the missing months of a run, not the changes lost", () => {
    const r = lcg(13);
    const trend = Array.from({ length: 36 }, (_, i) => 100 + 4 * i);
    const a = trend.map((v) => Math.round(v * 10 + gauss(r) * 30));
    const y = a.map((v) => Math.round(v * 2 + gauss(r) * 40));
    const f = fit({ target: { name: "Revenue", points: months("2024-01", y) }, drivers: [{ name: "Visits", points: months("2024-01", a).filter((_, i) => i !== 10 && i !== 11) }], span: "month" });
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.refusals.map((c) => c.case)).toEqual(["refuse-gap-run-change"]);
      expect(movesTakeaway(R, [V], f, ctx).refusal).toBe("Visits: no value for 2 months in a row, so the changes into and out of them could not be worked out: too many to go on.");
    }
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
    expect(t.sentence).toMatch(/^To reach [\d,]+ € next month, Visits would need to be around [\d,]+/);
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
    expect(t.rows).toEqual([]);
  });
  it("narrows more Metrics than the history carries by how closely their changes follow the target, and says which were left out", () => {
    const many = Array.from({ length: 9 }, (_, i) => metric({ id: 20 + i, slug: `m${i}`, name: `M${i}`, period: "month", aggregation: "sum" }));
    const r = lcg(5);
    const n = 40;
    const noise = (): number[] => Array.from({ length: n }, () => Math.round(r() * 100));
    const cols = many.map(noise);
    // Revenue's changes follow M7 and M2 closely, M5 a little.
    const revenue = cols[7].map((_, i) => 3 * cols[7][i] + 2 * cols[2][i] + cols[5][i] + Math.round(r() * 20));
    const series: Record<string, Point[]> = { revenue: months("2024-01", revenue) };
    many.forEach((m, i) => (series[m.slug] = months("2024-01", cols[i])));
    // Independent: Pearson's r of month-to-month changes, plainly.
    const diff = (v: number[]) => v.slice(1).map((x, i) => x - v[i]);
    const corr = (a: number[], b: number[]) => {
      const [ma, mb] = [a.reduce((x, y) => x + y) / a.length, b.reduce((x, y) => x + y) / b.length];
      return a.reduce((s2, x, i) => s2 + (x - ma) * (b[i] - mb), 0) / Math.sqrt(a.reduce((s2, x) => s2 + (x - ma) ** 2, 0) * b.reduce((s2, x) => s2 + (x - mb) ** 2, 0));
    };
    const ranked = many.map((m, i) => ({ name: m.name, r: Math.abs(corr(diff(revenue), diff(cols[i]))) })).sort((x, y) => y.r - x.r);
    const left = ranked.slice(6).map((x) => x.name);
    const t = whatMoves(R, many, resolverFrom([R, ...many], series), opts);
    expect(t.kind).toBe("answer");
    expect(t.notes).toEqual(["9 Metrics are more than 40 months can weigh, so the 6 that move most closely with Revenue were chosen first and the others left out.", `Left out of the first pass, as they moved less closely with Revenue: ${left.slice(0, -1).join(", ")} and ${left[left.length - 1]}.`]);
    expect(t.rows.map((x) => x.name).sort()).toEqual(ranked.slice(0, 6).map((x) => x.name).sort());
    // Not narrowed when the history carries them all.
    expect(whatMoves(R, many.slice(0, 6), resolverFrom([R, ...many], series), opts).notes.some((x) => x.includes("first pass"))).toBe(false);
    // What does B need? says the same and names every driver that moved with the target.
    const nd = whatNeeds(R, many, Math.max(...revenue), resolverFrom([R, ...many], series), opts);
    expect(nd.notes[0]).toBe(t.notes[0]);
  });
  it("keeps as many as the periods allow, one per 6: 22 periods carry 3, even of 4 Metrics", () => {
    const r = lcg(12);
    const n = 22;
    const many = Array.from({ length: 4 }, (_, i) => metric({ id: 50 + i, slug: `k${i}`, name: `K${i}`, period: "month", aggregation: "sum" }));
    const cols = many.map(() => Array.from({ length: n }, () => Math.round(r() * 100)));
    const revenue = cols[0].map((v, i) => v * 3 + cols[1][i] + Math.round(r() * 20));
    const series: Record<string, Point[]> = { revenue: months("2024-01", revenue) };
    many.forEach((m, i) => (series[m.slug] = months("2024-01", cols[i])));
    const t = whatMoves(R, many, resolverFrom([R, ...many], series), opts);
    expect(t.notes[0]).toBe("4 Metrics are more than 22 months can weigh, so the 3 that move most closely with Revenue were chosen first and the others left out.");
    expect(t.rows).toHaveLength(3);
    // 23 periods less one lost to the changes: 22 changes, so 3.
    const tooShort = whatMoves(R, many.slice(0, 1), resolverFrom([R, ...many], { ...series, revenue: months("2024-01", revenue.slice(0, 8)), k0: months("2024-01", cols[0].slice(0, 8)) }), opts);
    expect(tooShort.refusal).toBe("Not enough months yet: 8 of 12 needed.");
  });
  it("puts drivers with exactly the same share in name order, whatever order they are listed in, and gives an effect of 0 a step", () => {
    // Two orthogonal drivers of equal size and y their sum: exactly half each.
    const blocks = [[1, 2], [3, 4], [5, 6], [7, 8]];
    const x1 = blocks.flatMap(([a, b]) => [a, b, -a, -b]);
    const x2 = blocks.flatMap(([a, b]) => [b, -a, -b, a]);
    const y = x1.map((v, i) => v + x2[i]);
    const res = resolverFrom([R, V, P], { revenue: months("2024-01", y), visits: months("2024-01", x1), price: months("2024-01", x2) });
    const [a, b] = [whatMoves(R, [V, P], res, opts), whatMoves(R, [P, V], res, opts)];
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.rows.map((r) => r.name)).toEqual(["Price", "Visits"]);
    const [c, d] = [whatNeeds(R, [V, P], 10, res, opts), whatNeeds(R, [P, V], 10, res, opts)];
    expect(JSON.stringify(c)).toBe(JSON.stringify(d));
    expect(c.rows.map((r) => r.name)).toEqual(["Price", "Visits"]);
    expect(stepOf(100)).toBe(100);
  });
  it("narrows by the periods the chosen Metrics have in common, and leaves a flat or a very short one to last", () => {
    const r = lcg(44);
    const n = 40;
    const mk = (i: number) => metric({ id: 60 + i, slug: `p${i}`, name: `P${i}`, period: "month", aggregation: "sum" });
    const many = Array.from({ length: 6 }, (_, i) => mk(i));
    const cols = many.map(() => Array.from({ length: n }, () => Math.round(r() * 100)));
    const revenue = cols[0].map((v, i) => v * 3 + cols[1][i] + Math.round(r() * 10));
    const series: Record<string, Point[]> = { revenue: months("2024-01", revenue) };
    many.forEach((m, i) => (series[m.slug] = months("2024-01", cols[i])));
    // P0 follows Revenue most closely but has only its last 22 months: the history it shares carries 3 drivers.
    series.p0 = months("2024-01", cols[0]).slice(18);
    const t = whatMoves(R, many, resolverFrom([R, ...many], series), opts);
    expect(t.notes[0]).toBe("6 Metrics are more than 22 months can weigh, so the 3 that move most closely with Revenue were chosen first and the others left out.");
    expect(t.rows).toHaveLength(3);
    // A constant Metric, and one with too few values to correlate, come last and are left out.
    const flat = mk(7);
    const brief = mk(8);
    const more = [...many.slice(1), flat, brief, mk(9), mk(10), mk(11)];
    const s2: Record<string, Point[]> = { ...series, p0: months("2024-01", cols[0]), [flat.slug]: months("2024-01", Array.from({ length: n }, () => 5)), [brief.slug]: months("2024-01", cols[2]).slice(0, 4) };
    for (const m of more.slice(-3)) s2[m.slug] = months("2024-01", Array.from({ length: n }, () => Math.round(r() * 100)));
    const u = whatMoves(R, more, resolverFrom([R, ...more], s2), opts);
    const leftOut = u.notes[1];
    expect(leftOut).toContain("P7");
    expect(leftOut).toContain("P8");
    expect(u.rows.map((x) => x.name)).not.toContain("P7");
    expect(u.rows.map((x) => x.name)).not.toContain("P8");
  });
  it("ranks a Metric with too few values, and a constant one, last, and judges the periods of the ones chosen only", () => {
    const r = lcg(91);
    const n = 40;
    const mk = (i: number) => metric({ id: 80 + i, slug: `q${i}`, name: `Q${i}`, period: "month", aggregation: "sum" });
    const brief = mk(0);
    const flat = mk(1);
    const real = [2, 3, 4, 5, 6, 7, 8].map(mk);
    const cols = real.map(() => Array.from({ length: n }, () => Math.round(r() * 100)));
    const revenue = cols[3].map((v, i) => 4 * v + 3 * cols[4][i] + Math.round(r() * 10));
    const series: Record<string, Point[]> = { revenue: months("2024-01", revenue), [brief.slug]: months("2024-01", [5, 9, 2, 7, 4]), [flat.slug]: months("2024-01", Array.from({ length: n }, () => 7)) };
    real.forEach((m, i) => (series[m.slug] = months("2024-01", cols[i])));
    const all = [brief, flat, ...real];
    const t = whatMoves(R, all, resolverFrom([R, ...all], series), opts);
    // 9 Metrics, 6 kept, over all 39 months (the brief one is not among them, so its 5 values do not shorten the history).
    expect(t.notes[0]).toBe("9 Metrics are more than 40 months can weigh, so the 6 that move most closely with Revenue were chosen first and the others left out.");
    expect(t.notes[1]).toContain("Q0");
    expect(t.notes[1]).toContain("Q1");
    expect(t.rows.map((x) => x.name)).not.toContain("Q0");
    expect(t.rows.map((x) => x.name)).not.toContain("Q1");
    expect(t.rows.slice(0, 2).map((x) => x.name).sort()).toEqual(["Q5", "Q6"]);
  });
  it("says that one Metric with a longer period sets the period for all of them", () => {
    const w = world(48);
    const quarterly = metric({ id: 40, slug: "quarterly", name: "Budget", period: "quarter", aggregation: "sum" });
    const qs: Point[] = Array.from({ length: 16 }, (_, i) => ({ period: new Date(Date.UTC(2024, 3 * i, 1)).toISOString().slice(0, 10), value: 100 + ((i * 37) % 53) }));
    const r = resolverFrom([R, V, quarterly], { revenue: w.series.revenue, visits: w.series.visits, quarterly: qs });
    const t = whatMoves(R, [V, quarterly], r, opts);
    expect(t.notes[0]).toBe("Everything is compared by quarter, the longest period among these Metrics: Revenue and Visits combined to it by their Aggregation.");
    expect(whatMoves(R, [V, P], resolverFrom([R, V, P], w.series), opts).notes).toEqual([]);
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
    const none = whatNeeds(R, [R], 100, resolve, opts);
    expect(none.refusal).toBe("No other Metric has enough in common with Revenue to compare.");
    expect(none.rows).toEqual([]);
    expect(none.notes).toEqual([]);
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
