// The reference for the Student t quantile (spec 0041, "Distributions"), worked out another way than methods/distributions.ts:
// not from the closed-form sums but by integrating the curve's density numerically. With t = √v · tan θ the density's
// integral is (B(v) ÷ √π) · ∫₀^θ cos^(v−1) φ dφ, where B(v) = Γ((v+1)/2) ÷ Γ(v/2) follows from B(1) = 1/√π, B(2) = √π/2 and
// B(v+2) = B(v) · (v+1) ÷ v, so no gamma function is needed. The integral is Simpson's rule on a smooth integrand, and the
// quantile is found by halving. Checked itself by hand-worked values (v = 1 is the Cauchy curve: tan(π(p − ½)); v = 2 has
// t = √2 · (2p − 1) ÷ √(1 − (2p − 1)²)).

/** B(v) = Γ((v+1)/2) ÷ Γ(v/2) for a whole v, by the recurrence from v = 1 and v = 2. */
export function referenceB(v: number): number {
  let b = v % 2 === 1 ? 1 / Math.sqrt(Math.PI) : Math.sqrt(Math.PI) / 2;
  for (let u = v % 2 === 1 ? 1 : 2; u < v; u += 2) b *= (u + 1) / u;
  return b;
}

/** The chance of a value between 0 and t = √v · tan θ, by Simpson's rule with `steps` (even) intervals. */
export function referenceHalfChance(theta: number, v: number, steps = 8000): number {
  const f = (phi: number) => Math.cos(phi) ** (v - 1);
  const h = theta / steps;
  let sum = f(0) + f(theta);
  for (let i = 1; i < steps; i++) sum += (i % 2 === 1 ? 4 : 2) * f(i * h);
  return (referenceB(v) / Math.sqrt(Math.PI)) * ((sum * h) / 3);
}

/** The point below which the share p of the t curve with v degrees of freedom lies, p above a half. */
export function referenceTQuantile(p: number, v: number): number {
  let [lo, hi] = [0, Math.PI / 2];
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (referenceHalfChance(mid, v) < p - 0.5) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(v) * Math.tan((lo + hi) / 2);
}
