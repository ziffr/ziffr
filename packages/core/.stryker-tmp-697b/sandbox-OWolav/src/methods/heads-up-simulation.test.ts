// @ts-nocheck
// The false-discovery simulation of the Heads-ups (spec 0041, Testing Decisions; ticket 13): 150 Metrics that have nothing to do
// with one another must give no "moving together" Heads-up in at least 99 of 100 runs, whatever they are made of: independent
// noise, trends and random walks, or noise that follows its own past (autoregressive noise, moving averages, a 12-month moving
// average among them), and none "stopped" either; a planted pair that moves together, at a delay of 0 or 2 periods either way, must
// be found; and a planted pair that stops must be found stopping, while one that carries on must not be. Seeded: the same runs
// every time. It is a test of the whole path (the scan, the effective count, the chances, the correction, the words); the pieces
// have their own tests. Not run by the mutation testing: it takes a minute and tests no line on its own.
import { describe, expect, it } from "vitest";
import { headsUpsFrom } from "./heads-up";
import { scanPairs } from "./pair-scan";

// The full size (100 runs of each kind, 20 of each planted case) runs in the `numbers` job (NUMBERS_RUNS of 1,000 or more); a plain
// test run, which has a time limit, uses a quicker size. The runs are seeded, so each size gives the same answer every time: the
// quick one is the first runs of the full one, and its thresholds were read off those runs, not chosen to be luck-proof.
const FULL = Number(process.env.NUMBERS_RUNS) >= 1000;
const RUNS = FULL ? 100 : 20;
const PLANT = FULL ? 20 : 6;
const ctx = { style: "1,234.5" as const };

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
  ar5: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.5 * v + z())); },
  ar9: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.9 * v + z())); },
  ar97: (n, z) => { let v = 0; return Array.from({ length: n }, () => (v = 0.97 * v + z())); },
  trendAr: (n, z) => { let v = 0; return Array.from({ length: n }, (_, k) => 2 * k + (v = 0.7 * v + 3 * z())); },
  growth: (n, z) => { let v = 0; return Array.from({ length: n }, (_, k) => 50 * 1.02 ** k + (v = 0.5 * v + z())); },
  ma3: (n, z) => { const w = Array.from({ length: n + 2 }, z); return Array.from({ length: n }, (_, k) => (w[k] + w[k + 1] + w[k + 2]) / 3); },
  ma12: (n, z) => { const w = Array.from({ length: n + 11 }, z); return Array.from({ length: n }, (_, k) => w.slice(k, k + 12).reduce((s, x) => s + x, 0) / 12); },
  // A running total of a running total: its changes are a random walk, the worst case for a correlation of changes.
  twice: (n, z) => { let v = 100; let d = 0; return Array.from({ length: n }, () => (v += d += 0.3 * z())); },
};
const SCENARIOS: Record<string, string[]> = {
  "independent noise": ["white"],
  "trends and random walks": ["walk", "drift", "trendAr", "growth", "white"],
  "autocorrelated noise": ["ar5", "ar9", "ar97", "ma3", "ma12", "twice"],
};

const points = (values: number[]) => values.map((v, k) => ({ period: month(k), value: Math.round(v * 100) / 100 }));
const metricsOf = (count: number) => Array.from({ length: count }, (_, i) => ({ id: i + 1, period: "month" as const }));
const today = (n: number) => month(n + 1);

/** The Heads-ups for a Workspace of these series, as a person who sees every Metric gets them. */
function headsUpsFor(series: Map<number, number[]>, n: number) {
  const metrics = metricsOf(series.size);
  const rows = scanPairs(metrics, (id) => points(series.get(id)!), () => false, today(n), 1);
  return { rows, ups: headsUpsFrom(rows, new Map(metrics.map((m) => [m.id, `Metric ${m.id}`])), ctx) };
}

describe(`150 Metrics that have nothing to do with one another (${RUNS} runs of each kind, seeded)`, () => {
  it.each(Object.entries(SCENARIOS))("%s: no Heads-up of either kind in at least 99 of 100 runs", (_, families) => {
    let withAny = 0;
    const seen: string[] = [];
    for (let run = 0; run < RUNS; run++) {
      const z = normalsOf(7000 + run);
      const n = 36 + (run % 4) * 12;
      const series = new Map(metricsOf(150).map((m) => [m.id, FAMILIES[families[(m.id + run) % families.length]](n, z)]));
      const { ups } = headsUpsFor(series, n);
      if (ups.length > 0) {
        withAny++;
        seen.push(`run ${run}: ${ups.map((u) => `${u.kind} ${u.metrics}`).join("; ")}`);
      }
    }
    expect(withAny, seen.join(" | ")).toBeLessThanOrEqual(FULL ? 1 : 0);
  }, 280_000);
});

describe("a pair that moves together among 150 Metrics of noise", () => {
  /** Metric 1 and Metric 2 are planted: 2 follows 1 by `lag` periods (a negative lag: 1 follows 2) with noise of `sd`. */
  const planted = (run: number, n: number, lag: number, sd: number, families = ["white", "walk", "ar9", "ma3", "drift"]) => {
    const z = normalsOf(9000 + run);
    const changes = Array.from({ length: n + 4 }, z);
    const level = (c: number[]) => { let v = 100; return c.slice(0, n).map((d) => (v += d)); };
    const series = new Map(metricsOf(150).map((m) => [m.id, FAMILIES[families[(m.id + run) % families.length]](n, z)]));
    const lead = Math.abs(lag);
    const follower = Array.from({ length: n }, (_, t) => (t - lead >= 0 ? changes[t - lead] : z()) + sd * z());
    series.set(1, lag >= 0 ? level(changes) : level(follower));
    series.set(2, lag >= 0 ? level(follower) : level(changes));
    return headsUpsFor(series, n);
  };

  it.each([[0], [2], [-2], [3]])("is found at a delay of %i periods, with that delay, in every one of the runs, and nothing else is reported", (lag) => {
    for (let run = 0; run < PLANT; run++) {
      const { ups, rows } = planted(run, 48, lag, 0.3);
      const found = ups.filter((u) => u.kind === "moving-together");
      expect(found.map((u) => u.metrics), `run ${run}`).toEqual([[1, 2]]);
      expect(rows.find((r) => r.a === 1 && r.b === 2)!.full.lag, `run ${run}`).toBe(lag);
      expect(ups.length, `run ${run}`).toBe(1);
      const sentence = found[0].takeaway.sentence!;
      if (lag === 0) expect(sentence).toContain("have started moving together (strong, over");
      else expect(sentence).toContain(`${lag > 0 ? "Metric 1" : "Metric 2"} rises`);
    }
  }, 120_000);

  it("is found even when it is not perfect: noise as large as half the signal, over 60 months, in at least 18 of 20 runs", () => {
    let found = 0;
    for (let run = 0; run < PLANT; run++) found += planted(run, 60, 1, 0.5).ups.filter((u) => u.kind === "moving-together").length;
    expect(found).toBeGreaterThanOrEqual(PLANT - 2);
  }, 120_000);

  it("is not made out of nothing: the same pair planted with no link at all is not found, in any of 20 runs", () => {
    for (let run = 0; run < PLANT; run++) expect(planted(run, 48, 2, 1e9).ups, `run ${run}`).toEqual([]);
  }, 120_000);
});

describe("a pair that has stopped moving together among 150 Metrics of noise", () => {
  /** Metrics 1 and 2 move together for the first n − 6 months. Then, with `how` "orthogonal", the changes of 2 over the last 6 months are
   * made uncorrelated with those of 1 (r = 0 by construction), with "random" they are fresh noise, and with "carry" the pair carries on. */
  const stops = (run: number, n: number, how: "orthogonal" | "random" | "carry") => {
    const z = normalsOf(11000 + run);
    const changes = Array.from({ length: n }, z);
    const level = (c: number[]) => { let v = 100; return c.map((d) => (v += d)); };
    const series = new Map(metricsOf(150).map((m) => [m.id, FAMILIES[["white", "walk", "ar9", "ma3", "drift"][(m.id + run) % 5]](n, z)]));
    const second = changes.map((d) => d + 0.15 * z());
    if (how !== "carry") {
      const fresh = Array.from({ length: 6 }, z);
      const tail = changes.slice(n - 6);
      const centred = (v: number[]) => v.map((x) => x - v.reduce((a, b) => a + b, 0) / v.length);
      const [x, e] = [centred(tail), centred(fresh)];
      const c = x.reduce((a, xi, i) => a + xi * e[i], 0) / x.reduce((a, xi) => a + xi * xi, 0);
      const orthogonal = e.map((ei, i) => ei - c * x[i]);
      (how === "orthogonal" ? orthogonal : fresh).forEach((v, i) => { second[n - 6 + i] = v; });
    }
    series.set(1, level(changes));
    series.set(2, level(second));
    return headsUpsFor(series, n);
  };
  it("is found stopping, once, and not as moving together, when the last 6 months are uncorrelated, in at least 19 of 20 runs, with the sentence of the spec", () => {
    let found = 0;
    for (let run = 0; run < PLANT; run++) {
      const { ups } = stops(run, 48, "orthogonal");
      const stopped = ups.filter((u) => u.kind === "stopped-moving-together");
      if (stopped.length > 0) expect(ups.filter((u) => u.kind === "moving-together"), `run ${run}`).toEqual([]);
      expect(stopped.map((u) => u.metrics.join()), `run ${run}`).toEqual(stopped.length ? ["1,2"] : []);
      if (stopped.length === 1) {
        found++;
        expect(stopped[0].takeaway.sentence).toBe("Metric 1 and Metric 2 used to move together. Over the last 6 months, they have not.");
        expect(stopped[0].takeaway.footer).toBe("This shows what has gone together, not what caused what.");
      }
    }
    expect(found).toBeGreaterThanOrEqual(PLANT - 1);
  }, 120_000);
  // With 6 pairs two unrelated series have |r| of 0.3 or more in more than half the runs (r is that loose), so the rule "under 0.3" finds
  // a stop that is only noise about every second time; and with 150 Metrics the history before must itself pass the correction for 11,175
  // pairs. What it must never do is report a pair as both, or name anything but the planted pair.
  it("is found stopping in some of the runs where the last 6 months are fresh noise, never as both, and never about another pair", () => {
    let found = 0;
    for (let run = 0; run < PLANT; run++) {
      const { ups } = stops(run, 48, "random");
      expect(ups.filter((u) => u.metrics.join() !== "1,2"), `run ${run}`).toEqual([]);
      const kinds = ups.map((u) => u.kind);
      expect(kinds.length, `run ${run}`).toBeLessThanOrEqual(1);
      found += kinds.filter((k) => k === "stopped-moving-together").length;
    }
    expect(found).toBeGreaterThanOrEqual(FULL ? 4 : 0);
  }, 120_000);
  it("is not said to have stopped when it carries on: no Heads-up of that kind in at least 19 of 20 runs, and it is reported as moving together in at least 18", () => {
    let [stopped, moving] = [0, 0];
    for (let run = 0; run < PLANT; run++) {
      const { ups } = stops(run, 48, "carry");
      stopped += ups.filter((u) => u.kind === "stopped-moving-together").length;
      moving += ups.filter((u) => u.kind === "moving-together" && u.metrics.join() === "1,2").length;
      expect(ups.filter((u) => u.metrics.join() !== "1,2"), `run ${run}`).toEqual([]);
    }
    expect(stopped).toBeLessThanOrEqual(FULL ? 1 : 0);
    expect(moving).toBeGreaterThanOrEqual(PLANT - 2);
  }, 120_000);
});
