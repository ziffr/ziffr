// How Ziffr writes a number and a period (ticket #591; GLOSSARY: Number Style, Fiscal Year, Period). One source for the
// app, the MCP views and the emails, so a value never reads differently depending on where it is shown.
//
// `writeNumber` and `writePeriod` are plain functions with no reference outside their own body, on purpose: the MCP
// views embed their source (`.toString()`) in a page that has no modules, so what the tests check is what runs there.

/** The four Number Styles, each named by 1234.5 written in it; the first is the default. */
export const NUMBER_STYLES = ["1,234.5", "1.234,5", "1 234,5", "1'234.5"] as const;

/** One Number Style, such as "1.234,5". */
export type NumberStyle = (typeof NUMBER_STYLES)[number];

/** What `writeNumber` adds to the digits. */
export type WriteOptions = {
  /** Group the digits (default); false writes them plain, for files. */
  group?: boolean;
  /** The Metric's unit; "CHF " keeps the space it ends with. */
  unit?: string;
  /** Which side the unit stands on: "before" without a space ("$1,200"), anything else after with one ("1.200 €"). */
  side?: string;
  /** A short mark after the digits, such as "k" or "M"; left out for a value that is zero. */
  suffix?: string;
  /** Write the sign of a change: "+" for more, the minus for less and "±" for none ("+12.0 %"). */
  change?: boolean;
  /** The minus sign; "−" (default) for people, "-" for files and programs. */
  minus?: string;
};

/** A number in a Number Style with its decimals and, if given, unit and suffix, e.g. "1.200 €", "$1,200", "−3,5 %"; a dash
 * for a value that is not finite. The minus is "−" and a value that rounds to zero has none, so −0.4 is written 0. */
export function writeNumber(value: unknown, decimals: number, style: string, options: WriteOptions = {}): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "–";
  const styles = ["1,234.5", "1.234,5", "1 234,5", "1'234.5"];
  // Each style is 1234.5 written in it, so its marks stand at the same places: the group at 1, the decimal at 5.
  const key = styles.includes(style) ? style : styles[0];
  const group = key.charAt(1) === " " ? " " : key.charAt(1);
  const places = Math.min(Math.max(Number.isInteger(decimals) ? decimals : 0, 0), 20);
  const en = new Intl.NumberFormat("en-US", { minimumFractionDigits: places, maximumFractionDigits: places, useGrouping: options.group !== false }).format(Math.abs(value));
  let body = en.replace(/[,.]/g, (c) => (c === "," ? group : key.charAt(5)));
  const some = /[1-9]/.test(body);
  if (options.suffix && some) body += options.suffix;
  const minus = options.minus === undefined ? "−" : options.minus;
  const sign = options.change ? (!some ? "±" : value > 0 ? "+" : minus) : value < 0 && some ? minus : "";
  const unit = options.unit || "";
  if (!unit) return sign + body;
  return options.side === "before" ? sign + unit + body : sign + body + " " + unit;
}

/** A span's name from its first day (yyyy-mm-dd), long ("October 2026", "Q3 2026", "FY 2026/27") or short ("Oct 26",
 * "Q3 26", "FY26/27"). `span` is day, week, month, quarter, half or year; days, weeks and months keep their calendar
 * names, quarters, halves and years follow `yearStart`, the month (1 to 12) the Fiscal Year starts in. English names;
 * a text that is not a day is returned as it is. */
export function writePeriod(start: string, span: string, yearStart: number, short = false): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(String(start));
  if (!parts) return String(start);
  const short3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const full = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const y = Number(parts[1]);
  const mo = Number(parts[2]) - 1;
  const d = Number(parts[3]);
  const two = (n: number) => String(n % 100).padStart(2, "0");
  if (!short3[mo]) return String(start);
  if (span === "day") return short ? d + " " + short3[mo] : weekdays[new Date(Date.UTC(y, mo, d)).getUTCDay()] + " " + d + " " + short3[mo] + " " + y;
  if (span === "week") return "Week of " + d + " " + short3[mo] + " " + y;
  if (span === "month") return short ? short3[mo] + " " + two(y) : full[mo] + " " + y;
  const first = Number.isInteger(yearStart) && yearStart >= 1 && yearStart <= 12 ? yearStart : 1;
  const calendar = first === 1;
  // A Fiscal Year that does not start in January is named by both calendar years it spans, so it cannot be mistaken for one.
  const from = mo >= first - 1 ? y : y - 1;
  const years = (short ? two(from) : String(from)) + "/" + two(from + 1);
  if (span === "year") return calendar ? String(y) : short ? "FY" + years : "FY " + years;
  if (span !== "quarter" && span !== "half") return String(start);
  const name = (span === "quarter" ? "Q" : "H") + (Math.floor(((mo - (first - 1) + 12) % 12) / (span === "quarter" ? 3 : 6)) + 1);
  if (calendar) return name + " " + (short ? two(y) : y);
  return short ? name + " " + years : name + " FY " + years;
}
