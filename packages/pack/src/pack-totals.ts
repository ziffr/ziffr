// Totals in a Pack (spec 0058 "Team totals", GLOSSARY: Total, Repeat, Pack): a Metric Catalog entry outside every Repeat
// that adds up one entry of a Repeat, such as the commit of all salespeople, and takes the place of a formula.
// Security: a Total shows the sum of what other people send, so a file may say only which entry it adds up and where
// its target comes from. Who may see its numbers is never a Pack's to say: there is no field for opening a Total, which
// only its owner does, in the app.
import type { Schema } from "./json-check.js";
import { itemKey } from "./file-text.js";
import type { Pack } from "./pack.js";

/** What a Metric Catalog entry of ziffr.pack/2 says to be a Total: the entry of a Repeat it adds up (`of`), and whether
 * its target is its own or the targets of its parts added up. */
export type PackTotal = { of: string; targets: "own" | "parts" };

/** The wrapper field `total` of a Metric Catalog entry, as a schema. */
export const TOTAL_FIELD: Schema = {
  type: "object",
  description: "Makes the entry a Total: a Derived Metric that adds up the Metrics made from one entry of a Repeat, in place of a formula. It takes no values. A Pack cannot open a Total to people who do not see every part.",
  properties: {
    of: itemKey("the key of a Metric Catalog entry of this Pack with “per”, whose Metrics the Total adds up"),
    targets: { enum: ["own", "parts"], description: "The Total's target: its own, or the targets of its parts added up." },
  },
  required: ["of", "targets"],
  additionalProperties: false,
};

type At = (path: string, message: string) => void;
type Entry = NonNullable<Pack["contents"]["metrics"]>[number];

// What a Total shares with its parts, each with its words and what a file that leaves it out means.
const SHARED: [string, (m: Partial<Entry["metric"]>) => unknown][] = [
  ["period", (m) => m.period],
  ["unit", (m) => m.unit ?? ""],
  ["number format", (m) => m.valueFormat ?? "number"],
  ["Aggregation", (m) => m.aggregation],
];

/** Every Total of a Pack held to the entry it adds up and to what a Derived Metric may say. */
export function checkTotals(p: Pack, at: At): void {
  const entries = new Map((p.contents.metrics ?? []).map((m) => [m.key, m]));
  (p.contents.metrics ?? []).forEach((m, i) => {
    if (!m.total) return;
    const here = `contents.metrics[${i}]`;
    if (m.per !== undefined) at(`${here}.per`, "is on a Total, which stands outside every Repeat: leave out “per”.");
    if (m.metric.formula !== undefined) at(`${here}.metric.formula`, "is on a Total, which is computed from its parts: leave out the formula.");
    if (m.metric.sources !== undefined) at(`${here}.metric.sources`, "is on a Total, which is computed: values do not arrive for it, so it has no Sources.");
    for (const field of ["submitters", "standIn"] as const) if (m[field] !== undefined) at(`${here}.${field}`, "is on a Total: it is computed and takes no values, so nobody submits it.");
    if (m.total.targets === "parts" && (m.metric.targetMin !== undefined || m.metric.targetMax !== undefined)) at(`${here}.total.targets`, "is “parts”: the target is the parts' targets added up, so the entry has no Target Range of its own.");
    const part = entries.get(m.total.of);
    const refuse = (why: string) => at(`${here}.total.of`, `names “${m.total!.of}”, ${why}`);
    if (!part) return refuse("which is not a Metric Catalog entry of this Pack.");
    if (part.per === undefined) return refuse("which is in no Repeat: a Total adds up the Metrics made once for each line of one.");
    if (part.total || part.metric.formula !== undefined) return refuse("a Derived Metric: the parts of a Total take values.");
    if (part.metric.aggregation === "none") return refuse("whose Aggregation is none: a Total cannot add it up over longer periods.");
    const differs = SHARED.filter(([, of]) => of(m.metric) !== of(part.metric)).map(([word]) => word);
    if (differs.length) refuse(`which differs from the Total in ${differs.join(" and ")}: a Total has the period, unit, number format and Aggregation of its parts.`);
  });
}
