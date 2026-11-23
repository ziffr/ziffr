// @ts-nocheck
// A Snapshot's values against the reference on the hand-made cases (spec 0022; GLOSSARY: Snapshot, Display
// Period): kept as of its period's last day and combined as of the day after, for every Snapshot period.
import { describe, expect, it } from "vitest";
import { dayAfter, shownSeries, type DisplayPeriod } from "./display-periods";
import { dataAsOf } from "./snapshot-periods";
import { canvas, metric } from "./test/fixtures";
import { dayOf, spanEnd, spanStart, textOf } from "./test/reference/calendar";
import { everyCase, MID } from "./test/reference/cases";
import { AGGREGATIONS, longer, seriesMismatch } from "./test/reference/check";
import { nextDay, referenceKept, referenceSeries } from "./test/reference/combine";

describe("a Snapshot's day", () => {
  it("shows what the reference keeps and combines as of the day after the Snapshot period, for every Snapshot period", () => {
    for (const { own, ys, c } of everyCase()) {
      if (c.alignTo) continue;
      for (const aggregation of AGGREGATIONS) {
        const m = metric({ period: own, aggregation });
        for (const kind of ["week", "month", "quarter", "half", "year"] as const) {
          const end = textOf(spanEnd(spanStart(dayOf(c.points[Math.floor(c.points.length / 2)]?.period ?? MID), kind, ys), kind, ys));
          // As snapshots.ts reads one: the values of the Metric periods over by the period's last day, on the day after.
          const kept = { ...dataAsOf(canvas([m], { revenue: c.points }, { yearStart: ys }), end), today: dayAfter(end) };
          for (const display of longer(own)) {
            const shown = shownSeries(m, kept, display as DisplayPeriod);
            const ref = referenceSeries(referenceKept(c.points, own, end, ys), own, display, aggregation, { yearStart: ys, today: nextDay(end) });
            const where = `${c.name}: ${own} by ${display}, ${aggregation}, Snapshot of the ${kind} to ${end}, ${ys}`;
            if (aggregation === "none") {
              expect(shown.combined, where).toBe(false);
              continue;
            }
            expect(seriesMismatch({ ok: true, points: shown.points }, ref, 0), where).toBeNull();
          }
        }
      }
    }
  });
});
