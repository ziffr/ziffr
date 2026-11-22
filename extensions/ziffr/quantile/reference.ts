// The reference for Quantile, worked out another way: the textbook form (1 − g) · x[j] + g · x[j + 1], positions counted
// from 1, on fractions of two whole numbers; the result is turned into a double by long division to 53 bits, the last one
// decided by the remainder (ties to the even one), instead of by reading its decimal text.
type Refusal = { readonly refused: string };
type Fraction = { top: bigint; bottom: bigint };

/** A finite number as the fraction its shortest text says. */
function read(v: number): Fraction {
  const [, sign, whole, decimals = "", exponent = "0"] = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(v))!;
  const shift = Number(exponent) - decimals.length;
  const digits = BigInt(sign + whole + decimals);
  return shift >= 0 ? { top: digits * BigInt(10) ** BigInt(shift), bottom: BigInt(1) } : { top: digits, bottom: BigInt(10) ** BigInt(-shift) };
}

const add = (a: Fraction, b: Fraction): Fraction => ({ top: a.top * b.bottom + b.top * a.bottom, bottom: a.bottom * b.bottom });
const times = (a: Fraction, b: Fraction): Fraction => ({ top: a.top * b.top, bottom: a.bottom * b.bottom });
const less = (a: Fraction, b: Fraction) => a.top * b.bottom < b.top * a.bottom;
const bits = (n: bigint) => n.toString(2).length;

/** The double nearest to a fraction (bottom above 0), ties to even, correct for the smallest and largest doubles too. */
function toDouble(f: Fraction): number {
  if (f.top === BigInt(0)) return 0;
  const negative = f.top < BigInt(0);
  const top = negative ? -f.top : f.top;
  // The exponent e of the last of 53 bits, not below the smallest double's 2^-1074 (where fewer bits are kept).
  let e = Math.max(bits(top) - bits(f.bottom) - 53, -1074);
  const quotient = (k: number) => (top * 2n ** BigInt(Math.max(0, -k))) / (f.bottom * 2n ** BigInt(Math.max(0, k)));
  while (quotient(e) >= 2n ** 53n) e++;
  const above = top * 2n ** BigInt(Math.max(0, -e));
  const below = f.bottom * 2n ** BigInt(Math.max(0, e));
  let q = above / below;
  const twice = 2n * (above % below);
  if (twice > below || (twice === below && q % 2n === 1n)) q++;
  const x = Number(q) * 2 ** e;
  return negative ? -x : x;
}

/** The p-quantile by the textbook formula, with the same refusals. */
export function reference(series: readonly number[], p: number = 0.5): number | Refusal {
  if (Number.isNaN(p) || p < 0 || p > 1) return { refused: "the share asked for must be a number from 0 to 1" };
  if (series.length < 2) return { refused: "needs at least two values to place a share of them" };
  if (series.some((v) => !Number.isFinite(v))) return { refused: "a value is not a number, so nothing is worked out" };
  const xs = series.map(read);
  xs.sort((a, b) => (less(a, b) ? -1 : less(b, a) ? 1 : 0));
  if (!less(xs[0], xs[xs.length - 1])) return { refused: "every value is the same, so every share of them is that value" };
  // h = (n − 1) · p + 1: j is its whole part, g the rest.
  const h = add(times({ top: BigInt(series.length - 1), bottom: BigInt(1) }, read(p)), { top: BigInt(1), bottom: BigInt(1) });
  const j = Number(h.top / h.bottom);
  const g: Fraction = { top: h.top - BigInt(j) * h.bottom, bottom: h.bottom };
  const next = xs[Math.min(j, xs.length - 1)];
  const answer = add(times(add({ top: BigInt(1), bottom: BigInt(1) }, { top: -g.top, bottom: g.bottom }), xs[j - 1]), times(g, next));
  return toDouble(answer);
}
