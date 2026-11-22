// Quantile (Extension ziffr/quantile; GLOSSARY: Extension, Analysis, Takeaway): the linear-interpolation quantile
// (Hyndman and Fan's type 7, NumPy's default). Of n sorted values the p-quantile sits at position (n − 1) · p, counted
// from 0, and is the value there, or between its two neighbours in proportion. It is worked out exactly on the values'
// text, as whole numbers: every value and p is read as digits and a count of decimals, so nothing is rounded until the
// one step at the end, where the exact result is read back as the double nearest to it.
//
// It imports nothing, so that the core can load it without the Extension Kit; a refusal is the Kit's `Refusal` shape.
type Refusal = { readonly refused: string };

// A finite value as whole digits and how many of them lie after the decimal point: 1.25 is 125 and 2, 1e-7 is 1 and 7,
// 1e21 is 1 followed by 21 zeros and 0.
function scaled(v: number): { digits: bigint; places: number } {
  const ten = BigInt(10);
  const [mantissa, exponent] = String(v).split("e");
  const [whole, decimals = ""] = mantissa.split(".");
  const places = decimals.length - (exponent === undefined ? 0 : Number(exponent));
  return { digits: BigInt(whole + decimals) * ten ** BigInt(Math.max(0, -places)), places: Math.max(0, places) };
}

/** The p-quantile of the series, p from 0 to 1, as the double nearest to the exact result; a refusal for fewer than two
 * values, a value that is not a number, values that are all the same, or a p outside 0 to 1. */
export function quantile(series: readonly number[], p: number = 0.5): number | Refusal {
  if (!(p >= 0 && p <= 1)) return { refused: "the share asked for must be a number from 0 to 1" };
  if (series.length < 2) return { refused: "needs at least two values to place a share of them" };
  if (series.some((v) => !Number.isFinite(v))) return { refused: "a value is not a number, so nothing is worked out" };
  if (series.every((v) => v === series[0])) return { refused: "every value is the same, so every share of them is that value" };
  // Smaller first. The order of doubles is the order of their text, so sorting the doubles sorts the exact values.
  const ten = BigInt(10);
  const sorted = [...series].sort((a, b) => a - b).map(scaled);
  const places = Math.max(...sorted.map((x) => x.places));
  const values = sorted.map((x) => x.digits * ten ** BigInt(places - x.places));
  const share = scaled(p);
  const unit = ten ** BigInt(share.places);
  // The position (n − 1) · p as a whole part and a rest, both exact: p is digits over a power of ten.
  const position = BigInt(series.length - 1) * share.digits;
  const index = Number(position / unit);
  const rest = position % unit;
  const low = values[index];
  // Where the rest is nothing (p of 1, or a position on a value) there is no neighbour to look for.
  const high = rest === BigInt(0) ? low : values[index + 1];
  // low + rest ÷ unit · (high − low), over the common power of ten, written as the number the exact text says.
  return Number(`${low * unit + rest * (high - low)}e-${places + share.places}`);
}
