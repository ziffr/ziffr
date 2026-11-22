// Share of the largest rows (Extension ziffr/top-share; GLOSSARY: Breakdown, Extension, Takeaway): how much of a whole sits in
// its n largest rows. It is arithmetic, not an estimate, so it is worked out exactly: every row is read from its text as
// whole digits at one common count of decimals, the sums are whole numbers, and only the last step, a share, a percent or
// the total, is read back as the double nearest to the exact result (ties to the even one).
//
// Rows are never dropped or mended: a row that is not a number or is below zero, a whole that adds up to nothing and fewer
// than two rows each give a refusal in words. Rows of the same size keep the order they were given in.
//
// It imports nothing, so that the core can load it without the Extension Kit; a refusal is the Kit's `Refusal` shape.
type Refusal = { readonly refused: string };
type Row = { readonly label: string; readonly value: number };
type Part = { label: string; value: number; share: number; percent: number };

/** The answer: the share (0 to 1) and percent of the n largest rows, each of them with its own, how many rows there are, the whole, and whether a row of the size of the last one named was left out. */
export type TopShare = { share: number; percent: number; top: Part[]; rows: number; total: number; tied: boolean };

// A finite value as whole digits and how many of them lie after the decimal point: 1.25 is 125 and 2, 1e-7 is 1 and 7,
// 1e21 is 1 followed by 21 zeros and 0.
function scaled(v: number): { digits: bigint; places: number } {
  const [mantissa, exponent] = String(v).split("e");
  const [whole, decimals = ""] = mantissa.split(".");
  const places = decimals.length - (exponent === undefined ? 0 : Number(exponent));
  return { digits: BigInt(whole + decimals) * BigInt(10) ** BigInt(Math.max(0, -places)), places: Math.max(0, places) };
}

// How many binary digits a whole number takes.
const bits = (n: bigint) => n.toString(2).length;

// The double nearest to top / bottom (top not below 0, bottom above 0), ties to the even one: the quotient is taken to 53
// bits with the remainder deciding the last one, then scaled by a power of two, which is exact. Values Ziffr keeps are far
// from the edges of the double range, so no result is subnormal or infinite.
function nearest(top: bigint, bottom: bigint): number {
  const divide = (shift: number) => {
    const above = top << BigInt(Math.max(0, -shift));
    const below = bottom << BigInt(Math.max(0, shift));
    return { q: above / below, twice: BigInt(2) * (above % below), below };
  };
  // A first guess for the power of two that brings the quotient to 53 bits; one more when it lands on 54.
  let e = bits(top) - bits(bottom) - 53;
  let { q, twice, below } = divide(e);
  if (bits(q) > 53) ({ q, twice, below } = divide(++e));
  if (twice > below || (twice === below && q % BigInt(2) === BigInt(1))) q++;
  return Number(q) * 2 ** e;
}

/** The share of the `n` largest rows: `n` a whole number from 1 to one fewer than the rows (all of them is the whole, and says nothing). A refusal in words for fewer than two rows, a row that is not a number or is below zero, a whole of nothing, or an n outside that. */
export function topShare(rows: readonly Row[], n: number = 1): TopShare | Refusal {
  if (rows.length < 2) return { refused: "needs at least two rows to say how much of the whole the largest make up" };
  if (rows.some((r) => !Number.isFinite(r.value))) return { refused: "a row is not a number, so nothing is worked out" };
  if (rows.some((r) => r.value < 0)) return { refused: "a row is below zero, so the rows are not parts of one whole" };
  const parts = rows.map((r) => scaled(r.value));
  const places = Math.max(...parts.map((x) => x.places));
  const exact = parts.map((x) => x.digits * BigInt(10) ** BigInt(places - x.places));
  const whole = exact.reduce((sum, x) => sum + x, BigInt(0));
  if (whole === BigInt(0)) return { refused: "the rows add up to nothing, so there is no share to give" };
  if (!Number.isInteger(n) || n < 1 || n >= rows.length) return { refused: "n must be a whole number from 1 to one fewer than the rows" };
  // Largest first; rows of the same size keep the order they were given in (a sort is stable). A row's place in the list is
  // its place in the original, so its exact digits come with it.
  const order = rows.map((r, i) => ({ row: r, exact: exact[i] })).sort((a, b) => b.row.value - a.row.value);
  const top = order.slice(0, n);
  const part = top.reduce((sum, x) => sum + x.exact, BigInt(0));
  const hundred = BigInt(100);
  return {
    share: nearest(part, whole),
    percent: nearest(part * hundred, whole),
    top: top.map((x) => ({ label: x.row.label, value: x.row.value, share: nearest(x.exact, whole), percent: nearest(x.exact * hundred, whole) })),
    rows: rows.length,
    total: nearest(whole, BigInt(10) ** BigInt(places)),
    tied: order[n].row.value === order[n - 1].row.value,
  };
}
