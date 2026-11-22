// The reference for Share of the largest rows, worked out another way: each row is a fraction of its own (no common count
// of decimals), the n largest are picked one at a time by repeated selection (no sort), the sums are fractions, and a
// fraction is turned into a double by long division to 53 bits with the remainder deciding the last one.
type Refusal = { readonly refused: string };
type Row = { readonly label: string; readonly value: number };
type Fraction = { top: bigint; bottom: bigint };

/** A finite number as the fraction its shortest text says. */
function read(v: number): Fraction {
  const [, sign, whole, decimals = "", exponent = "0"] = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(v))!;
  const shift = Number(exponent) - decimals.length;
  const digits = BigInt(sign + whole + decimals);
  return shift >= 0 ? { top: digits * BigInt(10) ** BigInt(shift), bottom: BigInt(1) } : { top: digits, bottom: BigInt(10) ** BigInt(-shift) };
}

const add = (a: Fraction, b: Fraction): Fraction => ({ top: a.top * b.bottom + b.top * a.bottom, bottom: a.bottom * b.bottom });
const divide = (a: Fraction, b: Fraction): Fraction => ({ top: a.top * b.bottom, bottom: a.bottom * b.top });
const bits = (n: bigint) => n.toString(2).length;

/** The double nearest to a fraction (top not below 0, bottom above 0), ties to even. */
function toDouble(f: Fraction): number {
  if (f.top === BigInt(0)) return 0;
  let e = bits(f.top) - bits(f.bottom) - 53;
  const quotient = (k: number) => (f.top * BigInt(2) ** BigInt(Math.max(0, -k))) / (f.bottom * BigInt(2) ** BigInt(Math.max(0, k)));
  while (quotient(e) >= BigInt(2) ** BigInt(53)) e++;
  const above = f.top * BigInt(2) ** BigInt(Math.max(0, -e));
  const below = f.bottom * BigInt(2) ** BigInt(Math.max(0, e));
  let q = above / below;
  const twice = BigInt(2) * (above % below);
  if (twice > below || (twice === below && q % BigInt(2) === BigInt(1))) q++;
  return Number(q) * 2 ** e;
}

/** The share of the n largest rows, with the same refusals. */
export function reference(rows: readonly Row[], n: number = 1): { share: number; percent: number; top: { label: string; value: number; share: number; percent: number }[]; rows: number; total: number; tied: boolean } | Refusal {
  if (rows.length < 2) return { refused: "needs at least two rows to say how much of the whole the largest make up" };
  if (rows.some((r) => Number.isNaN(r.value) || Math.abs(r.value) === Infinity)) return { refused: "a row is not a number, so nothing is worked out" };
  if (rows.some((r) => r.value < 0)) return { refused: "a row is below zero, so the rows are not parts of one whole" };
  const zero = { top: BigInt(0), bottom: BigInt(1) };
  let whole = zero;
  for (const r of rows) whole = add(whole, read(r.value));
  if (whole.top === BigInt(0)) return { refused: "the rows add up to nothing, so there is no share to give" };
  if (n !== Math.floor(n) || n < 1 || n > rows.length - 1) return { refused: "n must be a whole number from 1 to one fewer than the rows" };
  // Pick the largest row not yet taken, n times; of rows of the same size the first given is picked first.
  const taken: number[] = [];
  const pick = (): number => {
    let best = -1;
    rows.forEach((r, i) => {
      if (!taken.includes(i) && (best === -1 || r.value > rows[best].value)) best = i;
    });
    return best;
  };
  for (let k = 0; k < n; k++) taken.push(pick());
  const hundred = { top: BigInt(100), bottom: BigInt(1) };
  let part = zero;
  for (const i of taken) part = add(part, read(rows[i].value));
  const last = taken[n - 1];
  taken.push(pick());
  return {
    share: toDouble(divide(part, whole)),
    percent: toDouble(divide({ top: part.top * hundred.top, bottom: part.bottom }, whole)),
    top: taken.slice(0, n).map((i) => ({ label: rows[i].label, value: rows[i].value, share: toDouble(divide(read(rows[i].value), whole)), percent: toDouble(divide({ top: read(rows[i].value).top * hundred.top, bottom: read(rows[i].value).bottom }, whole)) })),
    rows: rows.length,
    total: toDouble(whole),
    tied: rows[taken[n]].value === rows[last].value,
  };
}
