// One range in the picture and in the words (ticket #988): the band a chart draws for a forecast is the range forecastTakeaway writes
// for the same period, for every case of the forecast fixture, to the last bit; and the points' own wider 95 % band is not the one drawn.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatValue } from "../format";
import { forecastTakeaway } from "../takeaways/forecast";
import { SEASON_LENGTH } from "../suitability";
import { metric } from "../test/fixtures";
import type { Point } from "../types";
import { bestForecast, withTakeawayBand } from "./forecast-choice";

const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/forecast.json", import.meta.url), "utf8"));
const euro = metric({ slug: "revenue", name: "Revenue", unit: "€", unit_position: "after", decimals: 0, period: "month" });
const ctx = { style: "1,234.5" as const };
const cases = Object.entries(fixture.cases as Record<string, { values: (number | null)[]; periods: string[] }>).map(([name, c]) => ({ name, points: c.values.flatMap((value, i): Point[] => (value === null ? [] : [{ period: c.periods[i], value }])) }));

describe("the band of a forecast chart", () => {
  it("is the range of the Takeaway at the period the Takeaway is about", () => {
    let compared = 0;
    for (const { name, points } of cases) {
      const take = forecastTakeaway(euro, points, ctx);
      const best = bestForecast(points, "month", SEASON_LENGTH.month);
      if (take.kind !== "answer" || !best) continue;
      const band = withTakeawayBand(best.points);
      const last = band[band.length - 1];
      expect(last.lo, name).toBe(take.range!.lo);
      expect(last.hi, name).toBe(take.range!.hi);
      // The words and the picture say the same numbers.
      expect(take.range!.text, name).toBe(`${formatValue(euro, last.lo, ctx.style)} – ${formatValue(euro, last.hi, ctx.style)}`);
      expect(take.sentence, name).toContain(formatValue(euro, last.lo, ctx.style));
      expect(take.sentence, name).toContain(formatValue(euro, last.hi, ctx.style));
      // Not the points' own wider band.
      expect(last.hi - last.lo, name).toBeLessThan(best.points[best.points.length - 1].hi - best.points[best.points.length - 1].lo);
      compared++;
    }
    expect(compared).toBeGreaterThan(0);
  });

  it("keeps the values, periods and spreads of the points", () => {
    const { points } = cases[0];
    const best = bestForecast(points, "month", SEASON_LENGTH.month)!;
    const band = withTakeawayBand(best.points);
    expect(band.map((p) => [p.period, p.value, p.sd])).toEqual(best.points.map((p) => [p.period, p.value, p.sd]));
    for (const p of band) {
      expect(p.lo).toBeLessThan(p.value);
      expect(p.hi).toBeGreaterThan(p.value);
    }
  });
});
