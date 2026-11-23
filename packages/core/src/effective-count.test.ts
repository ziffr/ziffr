// The effective count with more delays than the Heads-ups use (spec 0041, ticket 17): the plain correlation Takeaway reads up to a third of the
// pairs, so for 60 months 20 delays and a yearly season (delay 12) is seen. The first 12 delays, the hand-worked values and NumPy's are tested
// with the Heads-ups (methods/pair-scan.test.ts); here the delays past 12, against the exact reference.
import { describe, expect, it } from "vitest";
import { AUTO_LAGS, autocorrelations, effectiveCount } from "./effective-count";
import { referenceRho } from "./test/reference/heads-up";
import { close } from "./test/reference/methods-fixture";
import { normalsOf } from "./test/reference/strength-simulation";

/** A yearly sine with noise: delay 12 sits at the top of its autocorrelation. */
const seasonal = (n: number, seed: number) => { const z = normalsOf(seed); return Array.from({ length: n }, (_, k) => Math.round((100 + 5 * Math.sin((2 * Math.PI * k) / 12) + z()) * 100) / 100); };

describe("the delays", () => {
  it("are a third of the pairs, at most 12, for the Heads-ups", () => {
    expect(AUTO_LAGS).toEqual({ oneIn: 3, most: 12 });
  });
  it("can be asked for beyond 12, and equal the exact reference at each delay", () => {
    const x = seasonal(60, 5);
    const rho = autocorrelations(x, 20);
    expect(rho).toHaveLength(20);
    for (let k = 1; k <= 20; k++) expect(close(rho[k - 1], Number(referenceRho(x, k).num) / Number(referenceRho(x, k).den), 1e-12), `ρ${k}`).toBe(true);
    // The season shows at delay 12 (about 0.7 for 5 of sine over 1 of noise, less the (n − k) ÷ n that a short series loses).
    expect(rho[11]).toBeGreaterThan(0.5);
  });
  it("count: n ÷ 3 delays of those given, so 60 pairs read 20 and 62 read 20 too, and 57 read 19", () => {
    const [ones, tenths] = [Array(20).fill(0), Array(20).fill(0.1)];
    expect(close(effectiveCount(60, tenths, tenths), 60 / 1.4, 1e-15)).toBe(true);
    expect(close(effectiveCount(62, tenths, tenths), 62 / 1.4, 1e-15)).toBe(true);
    expect(close(effectiveCount(57, tenths, tenths), 57 / 1.38, 1e-15)).toBe(true);
    expect(effectiveCount(60, ones, tenths)).toBe(60);
    // Only the delays given are read: 20 given for 90 pairs (30 delays wanted) are 20.
    expect(close(effectiveCount(90, tenths, tenths), 90 / 1.4, 1e-15)).toBe(true);
  });
  it("count two seasonal series as worth few pairs, however many months there are", () => {
    const [x, y] = [seasonal(60, 11), seasonal(60, 12)];
    expect(effectiveCount(60, autocorrelations(x, 20), autocorrelations(y, 20))).toBeLessThan(8);
  });
});
