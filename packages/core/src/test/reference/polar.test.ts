// The polar and radar marks against the reference (spec 0041, ticket 10): generated monthly series with gaps, running
// periods and Condensed Values, in every window; what the marks place is the exact fraction of the reference, nearest
// double, and what they refuse is what the reference refuses.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { polarModel, radarModel, type MarkPoint } from "../../polar-marks";
import { monthIndex, monthStart, nearestDoubleOf, referencePolar, referenceRadar, type RefPoint } from "./polar";

const runs = Number(process.env.NUMBERS_RUNS ?? 100);
const base = monthIndex(2025, 1);
const toMark = (p: RefPoint): MarkPoint => ({ period: monthStart(p.m), value: p.v, note: p.note, condensed: p.condensed });
const NOTES = [undefined, undefined, undefined, "so far", "2 of 3 months"];

// A month series: distinct months within a stretch, whole-number values (some below 0), a few with a note or condensed.
const series = (negatives: boolean, condensed: boolean) =>
  fc.uniqueArray(fc.integer({ min: 0, max: 20 }), { maxLength: 14 }).chain((months) =>
    fc.tuple(...months.map((k) => fc.record({ v: fc.integer({ min: negatives ? -50 : 0, max: 50 }), note: fc.constantFrom(...NOTES), condensed: condensed ? fc.constantFrom(false, false, false, false, true) : fc.constant(false) }).map((r): RefPoint => ({ m: base + k, ...r })))),
  );

describe("radar against the reference", () => {
  it("places each spoke at the exact fraction, in the window counted in periods, with gaps and the period before", () => {
    fc.assert(
      fc.property(fc.array(series(true, true), { minLength: 3, maxLength: 6 }), fc.integer({ min: 1, max: 14 }), fc.boolean(), (metrics, window, against) => {
        const ref = referenceRadar(metrics, window, against);
        const got = radarModel(metrics.map((points, i) => ({ name: `M${i}`, points: points.map(toMark), by: "month" as const, write: (v: number) => `${v}`, period: (p: string) => p })), { window, against: against ? "previous" : undefined, style: "1,234.5" });
        if (ref.refused) {
          expect(got.ok).toBe(false);
          return;
        }
        expect(got.ok).toBe(true);
        if (!got.ok) return;
        expect(got.spokes).toEqual(metrics.map((_, i) => `M${i}`));
        const check = (marks: typeof got.shapes[0]["marks"], spokes: typeof ref.now) =>
          spokes.forEach((r, i) => {
            const m = marks[i];
            if (r.kind === "gap") {
              expect([m.text, m.at]).toEqual([null, null]);
              return;
            }
            expect(m.text).toBe(`${r.v}`);
            expect(m.period).toBe(monthStart(r.m));
            if (r.kind === "norange") {
              expect(m.at).toBeNull();
              return;
            }
            expect(m.at).toBe(nearestDoubleOf(r.at));
            // A note is named on the period drawn, and on no other.
            expect(m.label).toBe(r.note ? `M${i} (${r.note})` : `M${i}`);
          });
        check(got.shapes[0].marks, ref.now);
        if (against) check(got.shapes[1].marks, ref.before);
      }),
      { numRuns: runs },
    );
  });

  it("is the reference on the case that was wrong: a Metric whose newest values are old is a gap, not its old value", () => {
    const old: RefPoint[] = [{ m: base, v: 5 }, { m: base + 1, v: 9 }];
    const fresh = (v: number): RefPoint[] => [{ m: base + 10, v }, { m: base + 11, v: v + 1 }];
    const ref = referenceRadar([old, fresh(1), fresh(2)], 3, false);
    expect(ref).toMatchObject({ refused: false, now: [{ kind: "gap" }, { kind: "placed" }, { kind: "placed" }] });
  });
});

describe("polar plot against the reference", () => {
  it("places each month at the exact fraction of the highest, keeps gaps at either end, and refuses what the reference refuses", () => {
    fc.assert(
      fc.property(series(true, true), fc.integer({ min: 0, max: 8 }), fc.integer({ min: 0, max: 16 }), (points, a, len) => {
        const from = base + a;
        const to = from + len - 1;
        const ref = referencePolar(points, from, to);
        const got = polarModel({ name: "M", points: points.map(toMark), by: "month", from: monthStart(from), to: monthStart(to), label: (p) => p, write: (v) => `${v}` });
        if (ref.refused) {
          expect(got.ok).toBe(false);
          return;
        }
        expect(got.ok).toBe(true);
        if (!got.ok) return;
        expect(got.marks.map((m) => m.at)).toEqual(ref.months.map((m) => (m.at ? nearestDoubleOf(m.at) : null)));
        expect(got.marks.map((m) => m.label)).toEqual(ref.months.map((m) => (m.note ? `${monthStart(m.m)} (${m.note})` : monthStart(m.m))));
        // The highest value is at the rim, and a missing month is never drawn as 0.
        expect(got.marks.some((m) => m.at === 1)).toBe(true);
        expect(got.marks.filter((m) => m.text === null).length).toBe(ref.months.filter((m) => m.at === null).length);
      }),
      { numRuns: runs },
    );
  });
});
