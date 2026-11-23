// The false-discovery simulation of the Heads-ups about one Metric (spec 0041, Testing Decisions; ticket 15): 150 Metrics where nothing
// happens must give no change of direction, no Target out of reach and no unusual-for-the-season Heads-up in at least 99 of 100 runs,
// whatever they are made of: independent noise, trends and random walks, noise that follows its own past (autoregressive noise, moving
// averages, a running total of a running total) or a steady yearly pattern. In every one a Target is set that the Metric will meet or
// pass about as often as not (at or below where it ends or its long-run level), so "unlikely to reach" is wrong by construction. A
// planted turn, a planted miss of a Target and a planted spike are found, and the planted Metric is the only one named. Seeded: the
// same runs every time. It is a test of the whole path (the tests, the correction, the words); the pieces have their own tests. Not run
// by the mutation testing: it takes a minute and tests no line on its own.
import { describe, expect, it } from "vitest";
import { metric } from "../test/fixtures";
import type { Metric } from "../types";
import { singleHeadsUpsFrom } from "./heads-up-single";

// The full size (100 runs of each kind, 12 of each planted case) runs in the `numbers` job (NUMBERS_RUNS of 1,000 or more); a plain
// test run, which has a time limit, uses a quicker size. The runs are seeded, so each size gives the same answer every time: the quick
// one is the first runs of the full one.
const FULL = Number(process.env.NUMBERS_RUNS) >= 1000;
const RUNS = FULL ? 100 : 12;
const PLANT = FULL ? 12 : 4;
const ctx = { style: "1,234.5" as const, today: "" };

function rng(state: number) {
  let a = state;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normalsOf = (state: number) => { const r = rng(state); return () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); };
const month = (k: number) => new Date(Date.UTC(2020, k, 1)).toISOString().slice(0, 10);

type Family = (n: number, z: () => number) => number[];
const FAMILIES: Record<string, Family> = {
  white: (n, z) => Array.from({ length: n }, () => 100 + 10 * z()),
  walk: (n, z) => { let v = 100; return Array.from({ length: n }, () => (v += z())); },
  drift: (n, z) => { let v = 100; return Array.from({ length: n }, () => (v += 1 + z())); },
  ar3: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.3 * v + z())); },
  ar7: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.7 * v + z())); },
  ar5: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.5 * v + z())); },
  ar9: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.9 * v + z())); },
  ar97: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.97 * v + z())); },
  trendAr: (n, z) => { let v = 0; return Array.from({ length: n }, (_, k) => 2 * k + (v = 0.7 * v + 3 * z())); },
  growth: (n, z) => { let v = 0; return Array.from({ length: n }, (_, k) => 50 * 1.02 ** k + (v = 0.5 * v + z())); },
  ma3: (n, z) => { const w = Array.from({ length: n + 2 }, z); return Array.from({ length: n }, (_, k) => (w[k] + w[k + 1] + w[k + 2]) / 3); },
  ma12: (n, z) => { const w = Array.from({ length: n + 11 }, z); return Array.from({ length: n }, (_, k) => w.slice(k, k + 12).reduce((s, x) => s + x, 0) / 12); },
  twice: (n, z) => { let v = 100; let d = 0; return Array.from({ length: n }, () => (v += d += 0.3 * z())); },
  // A steady yearly pattern with noise: what "usual for the season" is made for.
  season: (n, z) => Array.from({ length: n }, (_, k) => 100 + 20 * Math.sin((2 * Math.PI * k) / 12) + 5 * z()),
};
const SCENARIOS: Record<string, string[]> = {
  "independent noise": ["white"],
  "trends and random walks": ["walk", "drift", "trendAr", "growth", "white"],
  "autocorrelated noise": ["ar5", "ar9", "ar97", "ma3", "ma12", "twice"],
  "a steady yearly pattern": ["season", "white"],
};

const round = (v: number) => Math.round(v * 100) / 100;
const points = (values: number[]) => values.map((v, k) => ({ period: month(k), value: round(v) }));

/** The Metric with a Target that is met about as often as not, or more often: higher is better with at least the lower of where it ends and its mean; for a series that stays around its
 * level (`steady`), every third one lower is better with at most the higher of the two. (A rising series with a ceiling at where it ends really does miss it.) */
function nullMetric(id: number, values: number[], steady: boolean): Metric {
  const last = round(values[values.length - 1]);
  const mean = round(values.reduce((s, v) => s + v, 0) / values.length);
  return steady && id % 3 === 0 ? metric({ id, name: `Metric ${id}`, period: "month", polarity: "lower", target_min: null, target_max: Math.max(last, mean) }) : metric({ id, name: `Metric ${id}`, period: "month", polarity: "higher", target_min: Math.min(last, mean), target_max: null });
}
const STEADY = new Set(["white", "ar5", "ar9", "ar97", "ma3", "ma12", "season"]);

const headsUpsFor = (series: Map<number, number[]>, n: number, planted: Map<number, Metric> = new Map(), steady: (id: number) => boolean = () => false) => {
  const looks = [...series].map(([id, values]) => ({ metric: planted.get(id) ?? nullMetric(id, values, steady(id)), points: points(values) }));
  return singleHeadsUpsFrom(looks, { ...ctx, today: month(n + 1) });
};

describe(`150 Metrics where nothing happens (${RUNS} runs of each kind, seeded)`, () => {
  it.each(Object.entries(SCENARIOS))("%s: no Heads-up of these kinds in at least 99 of 100 runs", (_, families) => {
    let withAny = 0;
    const seen: string[] = [];
    for (let run = 0; run < RUNS; run++) {
      const z = normalsOf(13000 + run);
      const n = 36 + (run % 4) * 12;
      const family = (id: number) => families[(id + run) % families.length];
      const series = new Map(Array.from({ length: 150 }, (_, i) => [i + 1, FAMILIES[family(i + 1)](n, z)] as const));
      const ups = headsUpsFor(series, n, new Map(), (id) => STEADY.has(family(id)));
      if (ups.length > 0) {
        withAny++;
        seen.push(`run ${run}: ${ups.map((u) => `${u.kind} ${u.metrics}: ${u.takeaway.sentence}`).join("; ")}`);
      }
    }
    expect(withAny, seen.join(" | ")).toBeLessThanOrEqual(FULL ? 1 : 0);
  }, 280_000);
});

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
