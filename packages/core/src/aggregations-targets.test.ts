// Target Series combined against the reference on the hand-made cases (spec 0022; GLOSSARY: Target Series,
// Display Period), for every source Period, Display Period, Aggregation, polarity and Fiscal Year start.
import { describe, expect, it } from "vitest";
import { resolverFrom } from "./compare";
import { seriesBy, shownSeries, targetsBy } from "./display-periods";
import { canvas, metric } from "./test/fixtures";
import { at, everyCase, LATER, starts } from "./test/reference/cases";
import { longer, targetsMismatch } from "./test/reference/check";
import { referenceSeries, referenceTargets } from "./test/reference/combine";

describe("Target Series combined", () => {
  it("equals the reference on every hand-made case, with targets for some periods", () => {
    // Each case is read with one of the four kinds of target in turn, so every kind meets every source Period,
    // Display Period and Fiscal Year start across the cases without running each case four times.
    const kinds = [["higher", 100, null], ["lower", null, 5], ["target", 1, 2], ["higher", null, null]] as const;
    let n = 0;
    for (const { own, ys, c } of everyCase()) {
      // Targets for most periods, not all, so some spans have a whole Target Series and some do not.
      const targets = c.points.filter((_, i) => i % 5 !== 3).map((p, i) => ({ period: p.period, value: 0.1 * (i % 4) }));
      for (const aggregation of ["sum", "average", "last"] as const) {
        const m = metric({ period: own, aggregation });
        for (const display of longer(own)) {
          const opts = { yearStart: ys, today: c.today, alignTo: c.alignTo };
          const code = seriesBy(m, resolverFrom([m], { revenue: c.points }), display, opts);
          const ref = referenceSeries(c.points, own, display, aggregation, opts);
          if (!code.ok || !ref.ok) throw new Error("refused");
          {
            const [polarity, min, max] = kinds[n++ % kinds.length];
            const withTarget = { ...m, polarity, target_min: min, target_max: max };
            const wrong = targetsMismatch(targetsBy(withTarget, targets, code.points, display, ys), referenceTargets(targets, ref.spans, withTarget, ys));
            expect(wrong, `${c.name}: ${own} by ${display}, ${aggregation}, ${polarity}, ${ys}`).toBeNull();
          }
        }
      }
    }
  });

  it("adds three monthly targets of 0.1 to 0.3", () => {
    const m = metric();
    const points = at(starts("2026-01-01", "month", 3, 1));
    const s = shownSeries(m, canvas([m], { revenue: points }, { targets: { 1: at(starts("2026-01-01", "month", 3, 1), () => 0.1) } }), "quarter", { today: LATER });
    expect(s.targets?.line).toEqual([{ period: "2026-01-01", value: 0.3 }]);
  });
});
