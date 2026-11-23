// Heads-ups from the pair table's rows (spec 0041, ticket 13): the correction for the number of pairs counts only the rows a person
// may see, the sentences say what the job used (the pairs, the delay, the last periods), no word that causes or confides, the same
// rows in any order give the same Heads-ups, a row that is not what a scan writes is ignored, and nothing in a person's Heads-ups
// depends on a Metric that is not among those they may see.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatNumber } from "../format";
import { HEADS_UP_EN } from "../takeaways/heads-up-wording";
import { say } from "../takeaways/wording";
import { runs } from "../test/reference/check";
import { adjustedChances } from "./false-discovery";
import { headsUpsFrom } from "./heads-up";
import type { PairRow, Window } from "./pair-scan";

const { numRuns, seed } = runs();
const ctx = { style: "1,234.5" as const };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const FOOTER = "This shows what has gone together, not what caused what.";

const win = (over: Partial<Window> = {}): Window => ({ lag: 0, r: 0.9, n: 36, nEff: 30, pDelays: 1e-9, p: 1e-9, tries: 7, meets: true, rFirst: 0.9, nFirst: 18, rSecond: 0.9, nSecond: 18, ...over });
const calm = (over: Partial<Window> = {}) => win({ r: 0.1, pDelays: 1, p: 1, meets: false, rFirst: 0.1, rSecond: 0.1, ...over });
const row = (a: number, b: number, over: Partial<PairRow> = {}): PairRow => ({ a, b, span: "month", through: "2026-06-01", full: win(), before: null, ...over });
const quiet = (a: number, b: number) => row(a, b, { full: calm() });
const before = (over: Partial<Window> = {}, recent: { r: number; n: number; low: boolean; dropP: number } | null = { r: 0.1, n: 6, low: true, dropP: 1e-6 }) => ({ ...win({ r: 0.9, n: 30, nFirst: 15, nSecond: 15, ...over }), recent });
const NAMES = new Map<number, string>([[1, "Visits"], [2, "Revenue"], [3, "Churn"], [4, "Tickets"], [5, "Cost"], [6, "Margin"]]);
const names = (...ids: number[]) => new Map(ids.map((id) => [id, NAMES.get(id) ?? `M${id}`]));
/** Every pair among ids 1..n with nothing going on. */
const crowd = (n: number) => Array.from({ length: n }, (_, i) => i + 1).flatMap((a) => Array.from({ length: n - a }, (_, j) => quiet(a, a + j + 1)));

describe("the words", () => {
  const SAMPLE = { a: "Visits", b: "Revenue", n: 18, lag: 2, span: "month" as const, strength: "strong", recent: 6, r: 0.5 };
  const TABLE: Record<keyof typeof HEADS_UP_EN, string> = {
    "hu-together-same": "Visits and Revenue have started moving together (strong, over 18 months).",
    "hu-together-same-opposite": "Visits and Revenue have started moving in opposite directions (strong, over 18 months).",
    "hu-together-leads": "Visits and Revenue have started moving together: when Visits rises, Revenue follows 2 months later (strong, over 18 months).",
    "hu-together-leads-opposite": "Visits and Revenue have started moving in opposite directions: when Visits rises, Revenue falls 2 months later (strong, over 18 months).",
    "hu-stopped": "Visits and Revenue used to move together. Over the last 6 months, they have not.",
    "hu-stopped-opposite": "Visits and Revenue used to move in opposite directions. Over the last 6 months, they have not.",
    "hu-stopped-leads": "Visits and Revenue used to move together: when Visits rose, Revenue followed 2 months later. Over the last 6 months, they have not.",
    "hu-stopped-leads-opposite": "Visits and Revenue used to move in opposite directions: when Visits rose, Revenue fell 2 months later. Over the last 6 months, they have not.",
    "numbers-method-hu-together": "Moving together: changes compared at delays of 0 to 3 periods either way, corrected for the pairs looked at",
    "numbers-method-hu-stopped": "Stopped moving together: the last periods against the history before them, corrected for the pairs looked at",
    "numbers-hu-effective": "Pairs, allowing for each Metric following its own past",
    "numbers-hu-first-half": "First half of the periods",
    "numbers-hu-second-half": "Second half of the periods",
    "numbers-hu-half": "0.50 over 18 months",
    "numbers-hu-looked-at": "Pairs of Metrics looked at",
    "numbers-hu-luck": "Chance of this by luck, after correcting for the pairs looked at",
    "numbers-hu-before": "Before the last periods",
    "numbers-hu-recent": "The last periods",
    "numbers-hu-drop": "Chance of a drop this big by luck, after correcting for the pairs looked at",
    "hu-chance-under": "under 0.0001",
  };
  it("is a table of cases: each sentence, label and chance says what the table says, in the Number Style and with the period singular for 1", () => {
    expect(Object.keys(TABLE).sort()).toEqual(Object.keys(HEADS_UP_EN).sort());
    for (const [key, want] of Object.entries(TABLE)) expect(say(key as keyof typeof HEADS_UP_EN, SAMPLE, ctx), key).toBe(want);
    expect(say("hu-together-leads", { ...SAMPLE, lag: 1, n: 1 }, ctx)).toBe("Visits and Revenue have started moving together: when Visits rises, Revenue follows 1 month later (strong, over 1 month).");
    expect(say("hu-together-same", { ...SAMPLE, n: 1234 }, { style: "1.234,5" })).toBe("Visits and Revenue have started moving together (strong, over 1.234 months).");
    expect(say("hu-stopped", { ...SAMPLE, span: "week" }, ctx)).toBe("Visits and Revenue used to move together. Over the last 6 weeks, they have not.");
    expect(say("numbers-hu-half", { ...SAMPLE, r: 0.5 }, { style: "1.234,5" })).toBe("0,50 over 18 months");
  });
  it("holds no word a person would have to look up: nothing causes, nothing is significant, no p-value, regression or confidence", () => {
    for (const [key, text] of Object.entries(HEADS_UP_EN)) expect(text, key).not.toMatch(FORBIDDEN);
  });
});

describe("a pair that has started moving together", () => {
  it("is reported with its sentence in the leader's order, its strength, what it was compared on, the footer once, and the numbers the job used", () => {
    const [up] = headsUpsFrom([row(1, 2, { full: win({ lag: 2, r: 0.95, n: 24, nEff: 20, pDelays: 1e-7, p: 1e-6, tries: 5, rFirst: 0.96, nFirst: 12, rSecond: 0.94, nSecond: 12 }) }), ...crowd(2).slice(1)], names(1, 2), ctx);
    expect(up.key).toBe("moving-together:1:2");
    expect(up).toMatchObject({ kind: "moving-together", metrics: [1, 2], span: "month", through: "2026-06-01" });
    expect(up.takeaway).toMatchObject({
      kind: "answer",
      sentence: "Visits and Revenue have started moving together: when Visits rises, Revenue follows 2 months later (strong, over 24 months).",
      strength: "strong",
      strengthText: "strong",
      basis: "compared by change, growth removed, over 24 months",
      footer: FOOTER,
      refusal: null,
      range: null,
      cautions: [],
      notes: [],
    });
    expect(up.takeaway.method).toBe("Moving together: changes compared at delays of 0 to 3 periods either way, corrected for the pairs looked at");
    expect(up.takeaway.numbers).toEqual([
      { label: "Method", text: up.takeaway.method },
      { label: "Delay (periods)", text: "2" },
      { label: "r", text: "0.95" },
      { label: "Pairs of periods", text: "24" },
      { label: "Pairs, allowing for each Metric following its own past", text: "20.0" },
      { label: "First half of the periods", text: "0.96 over 12 months" },
      { label: "Second half of the periods", text: "0.94 over 12 months" },
      { label: "Delays looked at", text: "5" },
      { label: "Pairs of Metrics looked at", text: "1" },
      { label: "Chance of this by luck, after correcting for the pairs looked at", text: "under 0.0001" },
      { label: "Compared on", text: "compared by change, growth removed" },
      { label: "Strength", text: "strong" },
    ]);
    expect(up.takeaway.figures).toEqual([{ label: "Pairs of periods", value: 24, text: "24" }, { label: "Delay (periods)", value: 2, text: "2" }]);
  });
  it("says the delay the other way round when the second Metric moves first, and 'in opposite directions' for a negative r", () => {
    const only = (full: Partial<Window>) => headsUpsFrom([row(1, 2, { full: win(full) })], names(1, 2), ctx)[0].takeaway.sentence;
    expect(only({ lag: -2 })).toBe("Revenue and Visits have started moving together: when Revenue rises, Visits follows 2 months later (strong, over 36 months).");
    expect(only({ lag: 0 })).toBe("Visits and Revenue have started moving together (strong, over 36 months).");
    expect(only({ lag: 1, r: -0.9 })).toBe("Visits and Revenue have started moving in opposite directions: when Visits rises, Revenue falls 1 month later (strong, over 36 months).");
    expect(only({ lag: -3, r: -0.9 })).toBe("Revenue and Visits have started moving in opposite directions: when Revenue rises, Visits falls 3 months later (strong, over 36 months).");
    // Show the numbers gives the delay as the sentence does, the number of periods the follower comes after the leader, whichever Metric leads.
    const delay = (lag: number) => headsUpsFrom([row(1, 2, { full: win({ lag }) })], names(1, 2), ctx)[0].takeaway.numbers.find((n) => n.label === "Delay (periods)")!.text;
    expect([delay(-3), delay(3), delay(0), delay(-1)]).toEqual(["3", "3", "0", "1"]);
    expect(only({ lag: 0, r: -0.9 })).toBe("Visits and Revenue have started moving in opposite directions (strong, over 36 months).");
    expect(only({ r: 0.7, nEff: 30 })).toBe("Visits and Revenue have started moving together (moderate, over 36 months).");
  });
  it("writes the numbers in the Workspace's Number Style, its chance as 'under 0.0001' or to four decimals, and the period by its own name", () => {
    const de = { style: "1.234,5" as const };
    const [a] = headsUpsFrom([row(1, 2, { span: "week", full: win({ r: 0.9, n: 1234, nFirst: 617, nSecond: 617, nEff: 1000.5 }) })], names(1, 2), de);
    expect(a.takeaway.sentence).toBe("Visits and Revenue have started moving together (strong, over 1.234 weeks).");
    expect(a.takeaway.numbers.find((n) => n.label === "Pairs, allowing for each Metric following its own past")!.text).toBe("1.000,5");
    expect(a.takeaway.numbers.find((n) => n.label === "r")!.text).toBe("0,90");
    expect(a.takeaway.numbers.find((n) => n.label.startsWith("Chance"))!.text).toBe("under 0.0001");
    // Right on 0.0001 it is written as a number; the adjusted chance of a lone pair is its own.
    const lone = (p: number) => headsUpsFrom([row(1, 2, { full: win({ pDelays: p, p }) })], names(1, 2), ctx)[0].takeaway.numbers.find((n) => n.label.startsWith("Chance"))!.text;
    expect(lone(0.0001)).toBe("0.0001");
    expect(lone(0.00009999)).toBe("under 0.0001");
    expect(lone(0.0512)).toBe("0.0512");
    expect(lone(0)).toBe("under 0.0001");
  });
  it("writes a half that does not vary as a dash", () => {
    const [a] = headsUpsFrom([row(1, 2, { full: win({ rFirst: null }) })], names(1, 2), ctx);
    expect(a.takeaway.numbers.find((n) => n.label === "First half of the periods")!.text).toBe("–");
  });
  it("is every figure in its sentence: the pairs and the delay are written there as the figures say", () => {
    for (const full of [win({ lag: 2, n: 24, nFirst: 12, nSecond: 12 }), win({ lag: -3, n: 13, nFirst: 6, nSecond: 7 }), win({ lag: 0, n: 1234, nFirst: 600, nSecond: 634 })]) {
      const [a] = headsUpsFrom([row(1, 2, { full })], names(1, 2), ctx);
      for (const f of a.takeaway.figures) expect(a.takeaway.sentence).toContain(f.text);
      expect(a.takeaway.figures.map((f) => f.value)).toEqual(full.lag === 0 ? [full.n] : [full.n, Math.abs(full.lag)]);
    }
  });
  it("is not reported when the conditions of the scan are not met, whatever the chance", () => {
    expect(headsUpsFrom([row(1, 2, { full: win({ meets: false }) })], names(1, 2), ctx)).toEqual([]);
  });
  it("is not reported when the strength words call it 'can't tell from chance', even where the correction would report it", () => {
    // 0.71 over about 4.5 effective pairs at the bar for 7 delays is far from clear of chance.
    expect(headsUpsFrom([row(1, 2, { full: win({ r: 0.71, nEff: 4.5 }) })], names(1, 2), ctx)).toEqual([]);
    expect(headsUpsFrom([row(1, 2, { full: win({ r: 0.71, nEff: 30 }) })], names(1, 2), ctx)).toHaveLength(1);
  });
});

describe("the correction counts the rows it is given", () => {
  // Rank 1 of m is reported when its chance is at most 0.1 ÷ m: a chance of 4e-4 passes for 100 pairs and not for 1,000.
  const strong = (p: number) => row(1, 2, { full: win({ pDelays: p, p }) });
  it("reports a pair when the correction over the pairs given allows its chance, and not when the same pair is one of more", () => {
    const [few, many] = [headsUpsFrom([strong(4e-4), ...crowd(15).filter((r) => !(r.a === 1 && r.b === 2))], names(...Array.from({ length: 15 }, (_, i) => i + 1)), ctx), headsUpsFrom([strong(4e-4), ...crowd(46).filter((r) => !(r.a === 1 && r.b === 2))], names(...Array.from({ length: 46 }, (_, i) => i + 1)), ctx)];
    // 15 Metrics have 105 pairs: 4e-4 ≤ 0.1 ÷ 105 = 9.5e-4. 46 Metrics have 1,035 pairs: 4e-4 > 0.1 ÷ 1,035 = 9.7e-5.
    expect(few.map((h) => h.key)).toEqual(["moving-together:1:2"]);
    expect(many).toEqual([]);
  });
  it("is the rule at its edge: a chance of exactly 0.1 ÷ m is reported, a hair above is not (m = 10)", () => {
    const rows = (p: number) => [strong(p), ...crowd(5).filter((r) => !(r.a === 1 && r.b === 2))];
    const ids = names(1, 2, 3, 4, 5);
    expect(headsUpsFrom(rows(0.01), ids, ctx)).toHaveLength(1);
    expect(headsUpsFrom(rows(0.010000000000000002), ids, ctx)).toHaveLength(0);
  });
  it("counts no pair that is not among the rows, so a Metric a person may not see is not in anything they get", () => {
    // Ten visible pairs and 20,000 more among hidden Metrics: given only the visible rows the pair is reported; the hidden rows are never given.
    const visible = [strong(0.009), ...crowd(5).filter((r) => !(r.a === 1 && r.b === 2))];
    const hidden = Array.from({ length: 300 }, (_, i) => quiet(100 + i, 1000 + i));
    const ids = names(1, 2, 3, 4, 5);
    expect(headsUpsFrom([...visible, ...hidden], ids, ctx)).toEqual(headsUpsFrom(visible, ids, ctx));
    expect(headsUpsFrom([...visible, ...hidden], ids, ctx)).toHaveLength(1);
    // Rows that name one hidden Metric are left out too, and do not count.
    const half = Array.from({ length: 300 }, (_, i) => quiet(1, 2000 + i));
    expect(headsUpsFrom([...visible, ...half], ids, ctx)).toEqual(headsUpsFrom(visible, ids, ctx));
  });
  it(`gives the same Heads-ups for the rows of the visible Metrics whatever the rows of the others say (${numRuns} generated tables)`, () => {
    const p = fc.constantFrom(1, 0.5, 0.02, 1e-3, 1e-6, 1e-9);
    const w = fc.record({ lag: fc.integer({ min: -3, max: 3 }), r: fc.constantFrom(0.9, -0.8, 0.72, 0.3), n: fc.integer({ min: 12, max: 60 }), nEff: fc.constantFrom(6, 20, 40), p, meets: fc.boolean(), tries: fc.integer({ min: 1, max: 7 }) });
    const rowOf = (a: number, b: number) => w.map((f) => row(a, b, { full: win({ ...f, nFirst: Math.floor(f.n / 2), nSecond: f.n - Math.floor(f.n / 2), pDelays: Math.min(f.p, 1e-12) }), before: f.meets ? before({}, { r: 0.1, n: 6, low: f.n % 2 === 0, dropP: f.p }) : null }));
    const table = fc.tuple(...[[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5]].map(([a, b]) => rowOf(a, b)));
    fc.assert(
      fc.property(table, fc.constantFrom<number[]>([1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5], [1, 2]), fc.integer({ min: 1, max: 5 }), (rows, seen, other) => {
        const visible = new Set(seen);
        const asked = headsUpsFrom(rows, names(...seen), ctx);
        // Only the visible Metrics' rows, as the core's read gives them.
        expect(asked).toEqual(headsUpsFrom(rows.filter((r) => visible.has(r.a) && visible.has(r.b)), names(...seen), ctx));
        // Anything else said about the others' rows changes nothing.
        const rewritten = rows.map((r) => (visible.has(r.a) && visible.has(r.b) ? r : { ...r, full: { ...r.full, p: 1e-300 * other, pDelays: 1e-300 * other, r: -0.77, meets: true } }));
        expect(headsUpsFrom(rewritten, names(...seen), ctx)).toEqual(asked);
        // And none names a Metric that is not seen.
        for (const h of asked) for (const id of h.metrics) expect(visible.has(id)).toBe(true);
        for (const id of [1, 2, 3, 4, 5, 6].filter((i) => !visible.has(i))) for (const h of asked) expect(JSON.stringify(h)).not.toContain(NAMES.get(id)!);
      }),
      { numRuns, seed },
    );
  });
});

describe("a pair that has stopped moving together", () => {
  const stopped = (b: Partial<ReturnType<typeof before>> = {}, recent: Parameters<typeof before>[1] = { r: 0.1, n: 6, low: true, dropP: 1e-6 }) => row(1, 2, { full: win({ meets: false }), before: before(b, recent) });
  it("is reported with its sentence, the last periods as the figure, and the numbers the job used", () => {
    const [h] = headsUpsFrom([stopped({ lag: 1, r: 0.92, n: 30 }, { r: 0.12, n: 6, low: true, dropP: 0.002 }), ...crowd(3).filter((r) => !(r.a === 1 && r.b === 2))], names(1, 2, 3), ctx);
    expect(h).toMatchObject({ key: "stopped-moving-together:1:2", kind: "stopped-moving-together", metrics: [1, 2] });
    expect(h.takeaway).toMatchObject({
      kind: "answer",
      sentence: "Visits and Revenue used to move together: when Visits rose, Revenue followed 1 month later. Over the last 6 months, they have not.",
      strength: null,
      strengthText: null,
      basis: "compared by change, growth removed, over 30 months",
      footer: FOOTER,
    });
    expect(h.takeaway.figures).toEqual([{ label: "The last periods", value: 6, text: "6" }]);
    expect(h.takeaway.numbers.map((n) => n.label)).toEqual(["Method", "Delay (periods)", "Before the last periods", "The last periods", "Pairs of Metrics looked at", "Chance of a drop this big by luck, after correcting for the pairs looked at", "Compared on"]);
    expect(h.takeaway.numbers[2].text).toBe("0.92 over 30 months");
    expect(h.takeaway.numbers[3].text).toBe("0.12 over 6 months");
    // The drop is tried among the pairs that had been moving together: here one.
    expect(h.takeaway.numbers[4].text).toBe("1");
    expect(h.takeaway.numbers[5].text).toBe("0.0020");
  });
  it("says which Metric led and by how long: the leader first, 'followed' or 'fell' for the other way, nothing for no delay", () => {
    const one = (lag: number, r: number) => headsUpsFrom([stopped({ lag, r }, { r: 0.1, n: 6, low: true, dropP: 1e-6 })], names(1, 2), ctx)[0].takeaway;
    expect(one(2, 0.9).sentence).toBe("Visits and Revenue used to move together: when Visits rose, Revenue followed 2 months later. Over the last 6 months, they have not.");
    expect(one(-1, 0.9).sentence).toBe("Revenue and Visits used to move together: when Revenue rose, Visits followed 1 month later. Over the last 6 months, they have not.");
    expect(one(-3, -0.9).sentence).toBe("Revenue and Visits used to move in opposite directions: when Revenue rose, Visits fell 3 months later. Over the last 6 months, they have not.");
    expect(one(-3, 0.9).numbers.find((n) => n.label === "Delay (periods)")!.text).toBe("3");
  });
  it("says 'opposite directions' for a link that went the other way, and is not also reported as moving together", () => {
    const row2 = row(1, 2, { full: win(), before: before({ r: -0.9 }, { r: -0.1, n: 6, low: true, dropP: 1e-6 }) });
    const got = headsUpsFrom([row2], names(1, 2), ctx);
    expect(got.map((h) => h.kind)).toEqual(["stopped-moving-together"]);
    expect(got[0].takeaway.sentence).toBe("Visits and Revenue used to move in opposite directions. Over the last 6 months, they have not.");
  });
  it("needs the history before to have been moving together: it met the conditions, the correction reported it, and the words do not call it chance", () => {
    expect(headsUpsFrom([stopped()], names(1, 2), ctx)).toHaveLength(1);
    expect(headsUpsFrom([stopped({ meets: false })], names(1, 2), ctx)).toEqual([]);
    // Its chance among the pairs with a history before: one rank in 11 is reported only up to 0.1 ÷ 11.
    const many = (p: number) => [stopped({ pDelays: p, p }), ...Array.from({ length: 10 }, (_, i) => row(10 + i, 20 + i, { full: calm(), before: before({ meets: false, r: 0.1, pDelays: 1, p: 1 }, null) }))];
    const ids = names(1, 2, ...Array.from({ length: 10 }, (_, i) => 10 + i), ...Array.from({ length: 10 }, (_, i) => 20 + i));
    expect(headsUpsFrom(many(0.004), ids, ctx)).toHaveLength(1);
    expect(headsUpsFrom(many(0.01), ids, ctx)).toHaveLength(0);
    expect(headsUpsFrom([stopped({ r: 0.71, nEff: 4.5 })], names(1, 2), ctx)).toEqual([]);
  });
  it("needs the last 6 periods to be under 0.3 and to have a pair each, and the drop to pass the correction among the pairs that had been moving together", () => {
    expect(headsUpsFrom([stopped({}, { r: 0.5, n: 6, low: false, dropP: 1e-6 })], names(1, 2), ctx)).toEqual([]);
    expect(headsUpsFrom([stopped({}, null)], names(1, 2), ctx)).toEqual([]);
    // Two pairs had been moving together, so the drop of each is judged at 0.1 ÷ 2 for the better one.
    const two = (p1: number, p2: number) => [row(1, 2, { full: win({ meets: false }), before: before({}, { r: 0.1, n: 6, low: true, dropP: p1 }) }), row(3, 4, { full: win({ meets: false }), before: before({}, { r: 0.1, n: 6, low: true, dropP: p2 }) })];
    const ids = names(1, 2, 3, 4);
    expect(headsUpsFrom(two(0.04, 0.9), ids, ctx).map((h) => h.key)).toEqual(["stopped-moving-together:1:2"]);
    expect(headsUpsFrom(two(0.06, 0.9), ids, ctx)).toEqual([]);
    // A pair whose last periods are not under 0.3 still counts among those whose drop was tried.
    const withHigh = [row(1, 2, { full: win({ meets: false }), before: before({}, { r: 0.1, n: 6, low: true, dropP: 0.04 }) }), row(3, 4, { full: win({ meets: false }), before: before({}, { r: 0.6, n: 6, low: false, dropP: 0.9 }) })];
    expect(headsUpsFrom(withHigh, ids, ctx).map((h) => h.key)).toEqual(["stopped-moving-together:1:2"]);
    expect(headsUpsFrom([row(1, 2, { full: win({ meets: false }), before: before({}, { r: 0.1, n: 6, low: true, dropP: 0.04 }) }), ...[3, 4, 5].map((i) => row(i, i + 10, { full: win({ meets: false }), before: before({}, { r: 0.6, n: 6, low: false, dropP: 0.9 }) }))], names(1, 2, 3, 4, 5, 13, 14, 15), ctx)).toEqual([]);
  });
});

describe("what is left out and what comes first", () => {
  it("has no Heads-up where nothing stands out: quiet is a result", () => {
    expect(headsUpsFrom([], names(1, 2), ctx)).toEqual([]);
    expect(headsUpsFrom(crowd(8), names(1, 2, 3, 4, 5, 6, 7, 8), ctx)).toEqual([]);
  });
  it("leaves out a row that names a Metric that is not among the names, however strong", () => {
    expect(headsUpsFrom([row(1, 2)], names(1), ctx)).toEqual([]);
    expect(headsUpsFrom([row(1, 2)], names(2), ctx)).toEqual([]);
    expect(headsUpsFrom([row(1, 2)], new Map(), ctx)).toEqual([]);
  });
  it("leaves out a row that is not what a scan writes, and does not count it", () => {
    const bad: [string, PairRow][] = [
      ["a not below b", row(2, 1)],
      ["the same Metric twice", row(1, 1)],
      ["ids that are not whole", row(1.5, 2)],
      ["the second id not whole", row(1, 2.5)],
      ["a first half count that is not whole", row(1, 2, { full: win({ nFirst: 17.5, nSecond: 18.5 }) })],
      ["a second half count that is not whole", row(1, 2, { full: win({ nFirst: 17, nSecond: 19.0000001 }) })],
      ["a last periods r of NaN", row(1, 2, { before: before({}, { r: NaN, n: 6, low: true, dropP: 0.01 }) })],
      ["NaN r", row(1, 2, { full: win({ r: NaN }) })],
      ["r above 1", row(1, 2, { full: win({ r: 1.01 }) })],
      ["a chance above 1", row(1, 2, { full: win({ p: 1.5 }) })],
      ["a chance below 0", row(1, 2, { full: win({ p: -0.1, pDelays: -0.2 }) })],
      ["a chance below its delays' chance", row(1, 2, { full: win({ p: 0.001, pDelays: 0.01 }) })],
      ["Infinity pairs", row(1, 2, { full: win({ n: Infinity }) })],
      ["too few pairs", row(1, 2, { full: win({ n: 11, nFirst: 5, nSecond: 6 }) })],
      ["halves that do not add up", row(1, 2, { full: win({ nFirst: 10, nSecond: 10 }) })],
      ["a delay of 4", row(1, 2, { full: win({ lag: 4 }) })],
      ["a delay that is not whole", row(1, 2, { full: win({ lag: 1.5 }) })],
      ["no effective pairs", row(1, 2, { full: win({ nEff: 0 }) })],
      ["no delays looked at", row(1, 2, { full: win({ tries: 0 }) })],
      ["meets that is not a boolean", row(1, 2, { full: { ...win(), meets: "yes" as unknown as boolean } })],
      ["a half r above 1", row(1, 2, { full: win({ rFirst: 2 }) })],
      ["a half r that is NaN", row(1, 2, { full: win({ rSecond: NaN }) })],
      ["a through that is not text", row(1, 2, { through: 5 as unknown as string })],
      ["a last periods count that is not 6", row(1, 2, { before: before({}, { r: 0.1, n: 5, low: true, dropP: 0.01 }) })],
      ["a last periods r above 1", row(1, 2, { before: before({}, { r: 1.5, n: 6, low: true, dropP: 0.01 }) })],
      ["a drop chance above 1", row(1, 2, { before: before({}, { r: 0.1, n: 6, low: true, dropP: 2 }) })],
      ["a low that is not a boolean", row(1, 2, { before: before({}, { r: 0.1, n: 6, low: 1 as unknown as boolean, dropP: 0.01 }) })],
      ["an earlier history with NaN", row(1, 2, { before: before({ r: NaN }) })],
    ];
    const ids = names(1, 2, 3, 4);
    // Ten good pairs make the correction's list; a bad row among them neither makes a Heads-up nor changes the others'.
    const baseline = headsUpsFrom([row(3, 4, { full: win({ pDelays: 0.009, p: 0.009 }) }), ...crowd(5).filter((r) => !(r.a === 3 && r.b === 4)).filter((r) => r.a !== 1 && r.a !== 2)], names(1, 2, 3, 4, 5), ctx);
    for (const [why, r] of bad) {
      expect(headsUpsFrom([r], ids, ctx), why).toEqual([]);
      const got = headsUpsFrom([row(3, 4, { full: win({ pDelays: 0.009, p: 0.009 }) }), ...crowd(5).filter((x) => !(x.a === 3 && x.b === 4)).filter((x) => x.a !== 1 && x.a !== 2), r], names(1, 2, 3, 4, 5), ctx);
      expect(got, why).toEqual(baseline);
    }
    expect(baseline.map((h) => h.key)).toEqual(["moving-together:3:4"]);
  });
  it("ranks a stop by how far the link fell: 0.9 to 0.05 is a bigger fall than 0.9 to 0.5, and a fall from a negative link counts the same way", () => {
    const fell = (a: number, b: number, from: number, to: number) => row(a, b, { full: win({ meets: false }), before: before({ r: from }, { r: to, n: 6, low: true, dropP: 1e-6 }) });
    const keys = headsUpsFrom([fell(1, 2, 0.9, 0.5), fell(3, 4, 0.9, 0.05), fell(5, 6, -0.9, -0.05)], names(1, 2, 3, 4, 5, 6), ctx).map((h) => h.key);
    // The falls are 0.4, 0.85 and 0.85 (−0.9 to −0.05 is the same fall); the tie goes to the lower ids.
    expect(keys).toEqual(["stopped-moving-together:3:4", "stopped-moving-together:5:6", "stopped-moving-together:1:2"]);
  });
  it("takes a row at the edges of what a scan writes: r of exactly 1 or -1, a half of exactly 1, a chance of 0 or 1, 12 pairs, a delay of 3", () => {
    const edge = (over: Partial<PairRow>) => headsUpsFrom([row(1, 2, over)], names(1, 2), ctx);
    expect(edge({ full: win({ r: 1, pDelays: 0, p: 0, rFirst: 1, rSecond: -1 }) })).toHaveLength(1);
    expect(edge({ full: win({ r: -1, pDelays: 0, p: 0, n: 12, nFirst: 6, nSecond: 6, lag: 3 }) })).toHaveLength(1);
    expect(edge({ full: win({ meets: false }), before: before({ r: 1, pDelays: 0, p: 0 }, { r: -1, n: 6, low: true, dropP: 1 }) })).toEqual([]);
    expect(edge({ full: win({ meets: false }), before: before({ r: 1, pDelays: 0, p: 0 }, { r: 1, n: 6, low: true, dropP: 0 }) })).toHaveLength(1);
    expect(edge({ full: win({ meets: false }), before: before({ r: 1, pDelays: 0, p: 0 }, { r: -1, n: 6, low: true, dropP: 0 }) })).toHaveLength(1);
  });
  it("puts moving together first, the stronger first, then stopped, the larger drop first, the lower ids on a tie, the same in any order", () => {
    const rows = [
      row(1, 2, { full: win({ r: 0.8 }) }),
      row(3, 4, { full: win({ r: 0.95 }) }),
      row(1, 3, { full: win({ r: 0.8 }) }),
      row(5, 6, { full: win({ meets: false }), before: before({ r: 0.9 }, { r: 0.0, n: 6, low: true, dropP: 1e-6 }) }),
      row(2, 5, { full: win({ meets: false }), before: before({ r: 0.9 }, { r: -0.2, n: 6, low: true, dropP: 1e-6 }) }),
    ];
    const keys = (rs: PairRow[]) => headsUpsFrom(rs, names(1, 2, 3, 4, 5, 6), ctx).map((h) => h.key);
    // The drop of (2, 5) is 0.9 − (−0.2) = 1.1, that of (5, 6) 0.9 − 0 = 0.9.
    expect(keys(rows)).toEqual(["moving-together:3:4", "moving-together:1:2", "moving-together:1:3", "stopped-moving-together:2:5", "stopped-moving-together:5:6"]);
    expect(keys([...rows].reverse())).toEqual(keys(rows));
    expect(keys([rows[2], rows[4], rows[0], rows[3], rows[1]])).toEqual(keys(rows));
  });
  it(`is the same twice, never changes the rows it is given, and is the same in any order (${numRuns} generated tables)`, () => {
    const w = fc.record({ r: fc.constantFrom(0.9, -0.8, 0.5), p: fc.constantFrom(1, 1e-3, 1e-9), meets: fc.boolean() });
    const table = fc.array(fc.tuple(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 6 }), w), { minLength: 0, maxLength: 12 });
    fc.assert(
      fc.property(table, fc.integer({ min: 0, max: 11 }), (cells, shift) => {
        const rows = cells.filter(([a, b]) => a < b).map(([a, b, f]) => row(a, b, { full: win({ ...f, pDelays: Math.min(f.p, 1e-12) }) }));
        const frozen = JSON.stringify(rows);
        const asked = headsUpsFrom(rows, names(1, 2, 3, 4, 5, 6), ctx);
        expect(JSON.stringify(rows)).toBe(frozen);
        expect(headsUpsFrom(rows, names(1, 2, 3, 4, 5, 6), ctx)).toEqual(asked);
        const rotated = rows.length ? [...rows.slice(shift % rows.length), ...rows.slice(0, shift % rows.length)] : rows;
        // The same pair twice would be two rows for one key; rotation is only compared where each pair is there once.
        if (new Set(rows.map((r) => `${r.a}:${r.b}`)).size === rows.length) expect(headsUpsFrom(rotated, names(1, 2, 3, 4, 5, 6), ctx)).toEqual(asked);
        for (const h of asked) {
          expect(h.takeaway.footer).toBe(FOOTER);
          for (const t of [h.takeaway.sentence, h.takeaway.basis, h.takeaway.method, ...h.takeaway.numbers.flatMap((n) => [n.label, n.text])]) expect(t!.replace(FOOTER, "")).not.toMatch(FORBIDDEN);
        }
      }),
      { numRuns, seed },
    );
  });
  it("reads the adjusted chance of the row the Takeaway shows from the same correction as the decision (a reported pair's is at most the rate)", () => {
    const rows = [row(1, 2, { full: win({ pDelays: 2e-4, p: 2e-4 }) }), ...crowd(5).filter((r) => !(r.a === 1 && r.b === 2))];
    const adjusted = adjustedChances(rows.map((r) => r.full.p))[0];
    expect(adjusted).toBeLessThanOrEqual(0.1);
    const [h] = headsUpsFrom(rows, names(1, 2, 3, 4, 5), ctx);
    expect(h.takeaway.numbers.find((n) => n.label.startsWith("Chance"))!.text).toBe(formatNumber(adjusted, 4, ctx.style));
  });
});
