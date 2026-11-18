// Reading numbers people write (spec 0022; GLOSSARY: Submission Rule, Source). Pure, so tests and, later, the browser
// read with exactly the rules the core applies. Ticket #107 reads decimal commas in a message; ticket #109 makes this
// the one reader every way a value arrives uses, with the Workspace's Number Style settling `1.500`.

const MINUS = /^[-−]/;

/** A number token written with `.`, `,` or `'` as marks ("1,5", "1.234,56", "1,234.5", "1'200"), as a number; null
 * when it is not finite. Whichever of `.` and `,` comes last with other marks before it is the decimal mark; a lone
 * comma is decimal unless groups of three follow it ("1,5" and "1,2345" are decimals, "126,657" is thousands); a lone
 * dot stays decimal, as before ("1.500" is 1.5 until the Number Style settles it, #109). */
export function readToken(token: string): number | null {
  const negative = MINUS.test(token);
  let s = token.replace(MINUS, "").replace(/'/g, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Both marks: the later one is the decimal mark, the other groups thousands.
    const decimal = lastDot > lastComma ? "." : ",";
    const group = decimal === "." ? "," : ".";
    s = s.split(group).join("");
    if (s.split(decimal).length > 2) return null;
    s = s.replace(",", ".");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    const grouped = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
    if (grouped) s = parts.join("");
    else if (parts.length === 2) s = parts.join(".");
    else return null;
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    // "1.234.567" can only be thousands; one dot stays a decimal point.
    if (parts.length > 2) {
      if (!parts.slice(1).every((p) => p.length === 3)) return null;
      s = parts.join("");
    }
  }
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return negative ? -v : v;
}

/** The first number in a message or form value: "we closed 3 today" → 3, "126,657 €" → 126657, "1,5" → 1.5, "−5" → -5;
 * null when there is none or it is not finite (a 400-digit number). Spaces group thousands only before three digits. */
export function valueInText(text: string): number | null {
  const joined = text.replace(/(\d)[   ](?=\d{3}(?!\d))/g, "$1");
  const m = joined.match(/[-−]?\d+(?:[.,']\d+)*/);
  return m ? readToken(m[0]) : null;
}
