// The false-discovery simulation of the Heads-ups about one Metric, part: the boundary, and planted cases (spec 0041, ticket 15; see test/reference/heads-up-single-sim.ts).
// Several files so that the runs go in parallel: 150 Metrics where nothing happens must give none of the three kinds in at least 99 of 100 runs.
// Not run by the mutation testing: it takes minutes and tests no line on its own.
import { describe, expect, it } from "vitest";
import { metric } from "../test/fixtures";
import { FAMILIES, FULL, headsUpsFor, normalsOf, PLANT, RUNS } from "../test/reference/heads-up-single-sim";

describe("150 Metrics whose Target sits exactly at their long-run level (the boundary: where the process is expected to be, met half the time)", () => {
  it("none of these Heads-ups in at least 99 of 100 runs, for noise that follows its own past at 0.3, 0.5, 0.7 and 0.9", () => {
    // The Target is what the process is expected to be at the period read (3 months on): its level plus φ³ of where it now stands off it, so it is met half the time.
    const [level, phi]: [Record<string, number>, Record<string, number>] = [{ white: 100, ar3: 0, ar5: 0, ar7: 0, ar9: 0 }, { white: 0, ar3: 0.3, ar5: 0.5, ar7: 0.7, ar9: 0.9 }];
    const families = Object.keys(level);
    let withAny = 0;
    for (let run = 0; run < RUNS; run++) {
      const z = normalsOf(21000 + run);
      const n = 36 + (run % 4) * 12;
      const family = (id: number) => families[(id + run) % families.length];
      const series = new Map(Array.from({ length: 150 }, (_, i) => [i + 1, FAMILIES[family(i + 1)](n, z)] as const));
      const planted = new Map([...series.keys()].map((id) => [id, metric({ id, name: `Metric ${id}`, period: "month", polarity: "higher", target_min: level[family(id)] + phi[family(id)] ** 3 * (series.get(id)![n - 1] - level[family(id)]), target_max: null })]));
      if (headsUpsFor(series, n, planted).some((u) => u.kind === "target-out-of-reach")) withAny++;
    }
    expect(withAny).toBeLessThanOrEqual(FULL ? 1 : 0);
  }, 280_000);
});


describe("one Metric that does something, among 149 that do not", () => {
  const others = (run: number, n: number, z: () => number) => new Map(Array.from({ length: 149 }, (_, i) => [i + 2, FAMILIES[["white", "walk", "ar9", "ma3", "drift"][(i + 2 + run) % 5]](n, z)] as const));

  it("a trend that turns around five months ago is found, once, with the sentence of the spec, and (all but once in 100) no one else is named", () => {
    let [found, extras] = [0, 0];
    for (let run = 0; run < PLANT; run++) {
      const z = normalsOf(15000 + run);
      const n = 36;
      const v = Array.from({ length: n }, (_, k) => 1000 + (k < n - 5 ? 20 * k : 20 * (n - 5) - 12 * (k - (n - 5))) + 2 * z());
      const series = others(run, n, z).set(1, v);
      const ups = headsUpsFor(series, n, new Map([[1, metric({ id: 1, name: "Signups", period: "month", polarity: "higher", target_min: null, target_max: null })]]));
      extras += ups.filter((u) => u.metrics[0] !== 1).length;
      const turned = ups.filter((u) => u.kind === "direction-change");
      if (turned.length === 1) {
        found++;
        expect(turned[0].takeaway.sentence).toMatch(/^Signups turned around in [A-Z][a-z]+ 20\d\d: up [\d.,]+ € a month before, down [\d.,]+ € a month since\.$/);
        expect(turned[0].takeaway.footer).toBe("This shows when the numbers changed, not what made them change.");
      }
    }
    expect(found).toBeGreaterThanOrEqual(PLANT - 1);
    // Someone else named is a false report: at most about 1 run in 100 may have one, so over the runs of a planted case at most 1.
    expect(extras).toBeLessThanOrEqual(FULL ? 1 : 0);
  }, 280_000);

  it("a Metric falling away from its Target is found, with the forecast's footer, and no one else is named", () => {
    let [found, extras] = [0, 0];
    for (let run = 0; run < PLANT; run++) {
      const z = normalsOf(17000 + run);
      const n = 36;
      const v = Array.from({ length: n }, (_, k) => 1000 - 15 * k + 3 * z());
      const series = others(run, n, z).set(1, v);
      const ups = headsUpsFor(series, n, new Map([[1, metric({ id: 1, name: "Revenue", period: "month", polarity: "higher", target_min: 600, target_max: null })]]));
      extras += ups.filter((u) => u.metrics[0] !== 1).length;
      const out = ups.filter((u) => u.kind === "target-out-of-reach");
      if (out.length === 1) {
        found++;
        expect(out[0].takeaway.sentence).toMatch(/^Revenue is unlikely to reach 600 € or more in [A-Z][a-z]+ 20\d\d \(under 1 in 20\)\.$/);
        expect(out[0].takeaway.footer).toBe("This carries the past forward; it is not a promise.");
      }
    }
    expect(found).toBeGreaterThanOrEqual(PLANT - 1);
    // Someone else named is a false report: at most about 1 run in 100 may have one, so over the runs of a planted case at most 1.
    expect(extras).toBeLessThanOrEqual(FULL ? 1 : 0);
  }, 280_000);

  it("a spike in October of a steady yearly pattern is found, and no one else is named", () => {
    let [found, extras] = [0, 0];
    for (let run = 0; run < PLANT; run++) {
      const z = normalsOf(19000 + run);
      const n = 106; // ends in October (month 0 is January 2020), with 8 Octobers before
      const v = Array.from({ length: n }, (_, k) => 100 + 20 * Math.sin((2 * Math.PI * k) / 12) + 2 * z());
      v[n - 1] += 40;
      const series = others(run, n, z).set(1, v);
      const ups = headsUpsFor(series, n, new Map([[1, metric({ id: 1, name: "Visits", period: "month", polarity: "higher", target_min: null, target_max: null })]]));
      extras += ups.filter((u) => u.metrics[0] !== 1).length;
      const spike = ups.filter((u) => u.kind === "unusual-for-season");
      if (spike.length === 1) {
        found++;
        expect(spike[0].takeaway.sentence).toMatch(/^Visits's? /);
        expect(spike[0].takeaway.sentence).toContain("is high for this time of year");
      }
    }
    expect(found).toBeGreaterThanOrEqual(PLANT - 1);
    // Someone else named is a false report: at most about 1 run in 100 may have one, so over the runs of a planted case at most 1.
    expect(extras).toBeLessThanOrEqual(FULL ? 1 : 0);
  }, 280_000);
});

