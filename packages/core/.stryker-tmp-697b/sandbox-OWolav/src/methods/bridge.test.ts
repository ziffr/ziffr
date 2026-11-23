// @ts-nocheck
// Bridge (spec 0041, Method `bridge`): equal to the reference (the whole change as later values less earlier ones) exactly,
// to NumPy's differences, hand-worked, hostile inputs, properties (the parts add up to the change exactly), and the Takeaway.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "../test/reference/check";
import { exactOf, nearestDoubleOf, plus, ZERO, type Exact } from "../test/reference/exact";
import { close, FIXTURE } from "../test/reference/methods-fixture";
import { referenceBridge } from "../test/reference/methods";
import type { ValueUnit } from "../format";
import type { TakeawayContext } from "../takeaways/takeaway";
import { bridge, bridgeTakeaway, type Part } from "./bridge";

const { numRuns, seed } = runs();
const ctx: TakeawayContext = { style: "1,234.5" };
const unit: ValueUnit = { unit: "€", unit_position: "after", decimals: 0 };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const at = (v: number | null) => (v === null ? null : exactOf(v));
const refOf = (parts: Part[]) => referenceBridge(parts.map((p) => ({ before: at(p.before), after: at(p.after), weight: p.weight })));

describe("bridge against NumPy and its reference", () => {
  it.each(Object.entries(FIXTURE.bridge as Record<string, { parts: Part[]; changes: number[]; total: number }>))("%s: NumPy's differences, and the reference exactly", (name, c) => {
    const got = bridge(c.parts);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    // The parts come largest first; NumPy's are in the order given.
    const byLabel = new Map(got.parts.map((p) => [p.label, p.change]));
    c.parts.forEach((p, i) => expect(close(byLabel.get(p.label)!, c.changes[i], 1e-12), `${name} ${p.label}`).toBe(true));
    expect(close(got.total, c.total, 1e-12)).toBe(true);
    const want = refOf(c.parts);
    expect(got.total).toBe(nearestDoubleOf(want.total));
    c.parts.forEach((p, i) => expect(byLabel.get(p.label)).toBe(nearestDoubleOf(want.changes[i])));
  });
  it("is worked out by hand: Germany 120 to 85, Austria 40 to 31, France 22 to 24 are −35, −9 and +2, and the total −42", () => {
    const got = bridge([{ label: "France", before: 22, after: 24 }, { label: "Austria", before: 40, after: 31 }, { label: "Germany", before: 120, after: 85 }]);
    expect(got).toEqual({
      ok: true,
      total: -42,
      change: -42,
      unexplained: null,
      parts: [
        { label: "Germany", change: -35, before: 120, after: 85, appeared: false, gone: false },
        { label: "Austria", change: -9, before: 40, after: 31, appeared: false, gone: false },
        { label: "France", change: 2, before: 22, after: 24, appeared: false, gone: false },
      ],
    });
  });
  it("is exact where doubles are not: 0.1 to 0.3 is 0.2, not 0.19999999999999998", () => {
    expect(0.3 - 0.1).not.toBe(0.2);
    const got = bridge([{ label: "A", before: 0.1, after: 0.3 }, { label: "B", before: 0.2, after: 0.1 }]);
    expect(got).toMatchObject({ ok: true, total: 0.1, parts: [{ label: "A", change: 0.2 }, { label: "B", change: -0.1 }] });
  });
  it("counts a part for or against the whole by its weight: Revenue less Cost", () => {
    const got = bridge([{ label: "Revenue", before: 100, after: 130 }, { label: "Cost", before: 60, after: 70, weight: -1 }]);
    expect(got).toMatchObject({ total: 20, parts: [{ label: "Revenue", change: 30 }, { label: "Cost", change: -10 }] });
  });
  it("says that a part had no value on one side, counting 0 there, and what the parts leave out of the whole's change", () => {
    const got = bridge([{ label: "New", before: null, after: 5 }, { label: "Old", before: 8, after: null }, { label: "Same", before: 3, after: 3 }], { before: 20, after: 18 });
    expect(got).toMatchObject({ ok: true, total: -3, unexplained: 1 });
    expect(got.ok && got.parts.map((p) => [p.label, p.change, p.appeared, p.gone])).toEqual([["Old", -8, false, true], ["New", 5, true, false], ["Same", 0, false, false]]);
    expect(bridge([{ label: "A", before: 1, after: 2 }], { before: 10, after: 11 })).toMatchObject({ unexplained: 0 });
    // Both sides missing is not an appearance or a loss.
    const neither = bridge([{ label: "A", before: null, after: null }, { label: "B", before: 1, after: 2 }]);
    expect(neither.ok && neither.parts.some((p) => p.appeared || p.gone)).toBe(false);
  });
  it("orders any input by the size of the contribution, largest first, and keeps the order given on a tie", () => {
    const ascending = Array.from({ length: 8 }, (_, i) => ({ label: `up${i}`, before: 0, after: i + 1 }));
    const got = (ps: Part[]) => { const b = bridge(ps); return b.ok ? b.parts.map((p) => p.label) : []; };
    expect(got(ascending)).toEqual(["up7", "up6", "up5", "up4", "up3", "up2", "up1", "up0"]);
    expect(got([...ascending].reverse())).toEqual(["up7", "up6", "up5", "up4", "up3", "up2", "up1", "up0"]);
    const ties = Array.from({ length: 70 }, (_, i) => ({ label: `t${i}`, before: 0, after: i % 2 === 0 ? 3 : -3 }));
    expect(got(ties)).toEqual(ties.map((p) => p.label));
    expect(got([{ label: "x", before: 0, after: -2 }, { label: "y", before: 0, after: 2 }, { label: "z", before: 0, after: 1 }])).toEqual(["x", "y", "z"]);
  });
  it("orders parts by the size of their contribution, the order given on a tie", () => {
    const got = bridge([{ label: "a", before: 0, after: 1 }, { label: "b", before: 5, after: 3 }, { label: "c", before: 0, after: -2 }, { label: "d", before: 1, after: 1.5 }]);
    expect(got.ok && got.parts.map((p) => p.label)).toEqual(["b", "c", "a", "d"]);
  });
});

describe("bridge on hostile input", () => {
  it("gives none for no parts, for a value that is not a number (in a part or in the whole), and for a weight other than 1 or −1", () => {
    expect(bridge([])).toEqual({ ok: false, why: "none" });
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(bridge([{ label: "A", before: bad, after: 1 }])).toEqual({ ok: false, why: "not-a-number" });
      expect(bridge([{ label: "A", before: 1, after: bad }])).toEqual({ ok: false, why: "not-a-number" });
      expect(bridge([{ label: "A", before: 1, after: 2 }], { before: bad, after: 1 })).toEqual({ ok: false, why: "not-a-number" });
      expect(bridge([{ label: "A", before: 1, after: 2 }], { before: 1, after: bad })).toEqual({ ok: false, why: "not-a-number" });
    }
    for (const weight of [0, 2, -2, 0.5, NaN] as never[]) expect(bridge([{ label: "A", before: 1, after: 2, weight }])).toEqual({ ok: false, why: "weight" });
    // One bad part among good ones is enough, wherever it stands.
    const good = { label: "G", before: 1, after: 2 };
    expect(bridge([good, { label: "A", before: NaN, after: 1 }])).toEqual({ ok: false, why: "not-a-number" });
    expect(bridge([{ label: "A", before: 1, after: Infinity }, good])).toEqual({ ok: false, why: "not-a-number" });
    expect(bridge([good, { label: "A", before: 1, after: 2, weight: 3 as never }])).toEqual({ ok: false, why: "weight" });
    expect(bridge([{ label: "A", before: 1, after: 2, weight: -1 }, { label: "B", before: 1, after: 2, weight: 7 as never }, good])).toEqual({ ok: false, why: "weight" });
    expect(bridge([{ label: "A", before: 1, after: 2, weight: 1 }, { label: "B", before: 1, after: 2, weight: -1 }]).ok).toBe(true);
  });
  it("is exact for huge and tiny values, and for a change of nothing", () => {
    expect(bridge([{ label: "A", before: 1e300, after: 3e300 }])).toMatchObject({ total: 2e300 });
    expect(bridge([{ label: "A", before: 1e-300, after: 3e-300 }])).toMatchObject({ total: 2e-300 });
    expect(bridge([{ label: "A", before: 4, after: 4 }, { label: "B", before: 1.5, after: 1.5 }])).toMatchObject({ total: 0, parts: [{ change: 0 }, { change: 0 }] });
    expect(bridge([{ label: "A", before: 0.1, after: 0.1 }], { before: 1, after: 1 })).toMatchObject({ unexplained: 0 });
  });
});

describe("bridge properties", () => {
  const value = fc.option(fc.integer({ min: -2000, max: 2000 }).map((v) => v / 100), { nil: null, freq: 6 });
  const parts = fc.array(fc.record({ before: value, after: value, weight: fc.constantFrom<1 | -1 | undefined>(1, -1, undefined) }), { minLength: 1, maxLength: 10 }).map((ps) => ps.map((p, i) => ({ label: `P${i}`, ...p })));
  it(`equals its reference exactly, the parts add up to the change exactly (as exact numbers), the unexplained part is the whole's change less the parts' (seed ${seed})`, () => {
    fc.assert(
      fc.property(parts, fc.integer({ min: -3000, max: 3000 }), (ps, shift) => {
        const got = bridge(ps, { before: 0, after: shift / 100 });
        expect(got.ok).toBe(true);
        if (!got.ok) return;
        const want = refOf(ps);
        expect(got.total).toBe(nearestDoubleOf(want.total));
        const wantByLabel = new Map(ps.map((p, i) => [p.label, want.changes[i]]));
        got.parts.forEach((p) => expect(p.change).toBe(nearestDoubleOf(wantByLabel.get(p.label)!)));
        // The exact parts add up to the exact change: the sum of the references' parts is the reference's total.
        expect(want.changes.reduce<Exact>(plus, ZERO)).toEqual(want.total);
        const unexplained = plus(exactOf(shift / 100), { num: -want.total.num, den: want.total.den });
        expect(got.unexplained).toBe(nearestDoubleOf(unexplained));
        // Largest first, the order given on a tie.
        got.parts.forEach((p, i) => i > 0 && expect(Math.abs(got.parts[i - 1].change)).toBeGreaterThanOrEqual(Math.abs(p.change)));
        expect(bridge(ps, { before: 0, after: shift / 100 })).toEqual(got);
      }),
      { numRuns, seed },
    );
  });
  it("negates every contribution when the periods are swapped, and does not depend on the order of the parts for the total", () => {
    fc.assert(
      fc.property(parts, (ps) => {
        const swapped = ps.map((p) => ({ ...p, before: p.after, after: p.before }));
        const [a, b] = [bridge(ps), bridge(swapped)];
        expect(a.ok && b.ok && a.total).toBe(a.ok && b.ok && (-b.total || 0));
        const reversed = bridge([...ps].reverse());
        expect(reversed.ok && a.ok && reversed.total).toBe(a.ok && a.total);
      }),
      { numRuns, seed },
    );
  });
});

describe("the Takeaway of a bridge", () => {
  const regions: Part[] = [{ label: "Germany", before: 120, after: 85 }, { label: "Austria", before: 40, after: 31 }, { label: "France", before: 22, after: 24 }];
  it("says it is worked out, the change, and each part with its sign, in the Metric's unit", () => {
    const t = bridgeTakeaway("Revenue", regions, unit, ctx);
    expect(t.kind).toBe("answer");
    expect(t.sentence).toBe("Worked out: Revenue fell by 42 €: Germany −35 €, Austria −9 €, France +2 €.");
    expect(t.footer).toBeNull();
    expect(t.numbers).toEqual([{ label: "Method", text: "Bridge" }, { label: "Change", text: "−42 €" }, { label: "Germany", text: "−35 €" }, { label: "Austria", text: "−9 €" }, { label: "France", text: "+2 €" }]);
    expect(t.figures).toEqual([{ label: "Change", value: 42, text: "42 €" }]);
    expect(bridgeTakeaway("Revenue", [{ label: "A", before: 1, after: 6 }], unit, ctx).sentence).toBe("Worked out: Revenue rose by 5 €: A +5 €.");
    expect(bridgeTakeaway("Revenue", [{ label: "A", before: 1, after: 1 }], unit, ctx).sentence).toBe("Worked out: Revenue did not change: A 0 €.");
    expect(bridgeTakeaway("Revenue", [{ label: "A", before: 1000, after: 6000 }], unit, { style: "1.234,5" }).sentence).toBe("Worked out: Revenue rose by 5.000 €: A +5.000 €.");
  });
  it("says the Metric's own change where it is given, not the parts' sum, and what the parts leave out", () => {
    const t = bridgeTakeaway("Revenue", [{ label: "DE", before: 100, after: 65 }, { label: "AT", before: 50, after: 41 }], unit, ctx, { before: 200, after: 150 });
    expect(t.sentence).toBe("Worked out: Revenue fell by 50 €: DE −35 €, AT −9 €.");
    expect(t.notes).toEqual(["−6 € of the change is not in these rows."]);
    expect(t.numbers[1]).toEqual({ label: "Change", text: "−50 €" });
    expect(t.figures).toEqual([{ label: "Change", value: 50, text: "50 €" }]);
    const b = bridge([{ label: "DE", before: 100, after: 65 }], { before: 200, after: 150 });
    expect(b).toMatchObject({ total: -35, change: -50, unexplained: -15 });
  });
  it("writes enough decimals that no change reads as 0 when it is not: +0.4 and −0.3 at no decimals", () => {
    const t = bridgeTakeaway("Revenue", [{ label: "DE", before: 10, after: 10.4 }, { label: "AT", before: 5, after: 4.7 }], unit, ctx);
    expect(t.sentence).toBe("Worked out: Revenue rose by 0.1 €: DE +0.4 €, AT −0.3 €.");
    // Half a unit rounds up, as every value does: it reads 1 and is not 0.
    expect(bridgeTakeaway("Revenue", [{ label: "DE", before: 10, after: 10.5 }], unit, ctx).sentence).toBe("Worked out: Revenue rose by 1 €: DE +1 €.");
    expect(bridgeTakeaway("Revenue", [{ label: "DE", before: 10, after: 12 }], unit, ctx).sentence).toBe("Worked out: Revenue rose by 2 €: DE +2 €.");
    expect(bridgeTakeaway("Revenue", [{ label: "DE", before: 10, after: 10.004 }], unit, ctx).sentence).toBe("Worked out: Revenue rose by 0.004 €: DE +0.004 €.");
    expect(bridgeTakeaway("Revenue", [{ label: "DE", before: 0, after: 1e-9 }], unit, ctx).sentence).toBe("Worked out: Revenue rose by 0.000000001 €: DE +0.000000001 €.");
  });
  it("names the parts that had no value on one side and what the parts leave out", () => {
    const t = bridgeTakeaway("Revenue", [{ label: "New", before: null, after: 5 }, { label: "Old", before: 8, after: null }], unit, ctx, { before: 20, after: 18 });
    expect(t.notes).toEqual(["Old and New had no value in one of the two periods; a missing value counts as 0.", "1 € of the change is not in these rows."]);
    expect(bridgeTakeaway("Revenue", regions, unit, ctx, { before: 182, after: 140 }).notes).toEqual([]);
  });
  it("refuses in words, with no number, for no parts, a value that is not a number and a weight that is not 1 or −1", () => {
    expect(bridgeTakeaway("Revenue", [], unit, ctx)).toMatchObject({ kind: "refusal", refusal: "Revenue: 0 of 1 rows needed.", sentence: null, figures: [], numbers: [], footer: null });
    expect(bridgeTakeaway("Revenue", [{ label: "A", before: NaN, after: 1 }], unit, ctx).refusal).toBe("Revenue has a row that is not a number, so nothing is worked out.");
    expect(bridgeTakeaway("Revenue", [{ label: "A", before: 1, after: 2, weight: 3 as never }], unit, ctx).refusal).toBe("Revenue: a part must count for or against the whole.");
  });
  it(`gives the same words twice and none a person would have to look up (${numRuns} cases, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(fc.record({ before: fc.option(fc.integer({ min: -50, max: 50 }), { nil: null }), after: fc.option(fc.integer({ min: -50, max: 50 }), { nil: null }) }), { minLength: 0, maxLength: 8 }), (ps) => {
        const list = ps.map((p, i) => ({ label: `P${i}`, ...p }));
        const t = bridgeTakeaway("Revenue", list, unit, ctx, { before: 0, after: 3 });
        expect(bridgeTakeaway("Revenue", list, unit, ctx, { before: 0, after: 3 })).toEqual(t);
        for (const text of [t.sentence, t.refusal, ...t.notes, ...t.numbers.map((x) => x.text)]) expect(text ?? "").not.toMatch(FORBIDDEN);
        if (t.kind === "refusal") expect(t).toMatchObject({ sentence: null, figures: [], numbers: [] });
      }),
      { numRuns, seed },
    );
  });
});
