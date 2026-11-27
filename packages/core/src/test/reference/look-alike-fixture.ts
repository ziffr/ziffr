// What the tests of the Look-alike share with the Python reference (spec 0053, ticket 3): the fixture made by fixtures/look-alike.py (exact fractions
// in Python's `fractions`, and SciPy's Ward for sanity) and the check that it was made by the script's current text. Test support only.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const here = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

/** A kind as the script writes it: its periods and runs, Cliff's count on each Metric (in the order of the ids) as "p/q", its marks, its number among kinds named alike and its season (places, and runs sorted). */
export type FixtureKind = {
  periods: string[];
  runs: [string, string][];
  counts: string[];
  marks: [string, string, string][];
  ordinal: number | null;
  season: null | { places: number[]; runs: [number, number][] };
};

/** The result for one count asked: a refusal, or the count shown, the kind of every period, the gaps squared as "p/q" or "endless", and the named kinds. */
export type FixtureAsked =
  | { refused: string }
  | { asked: number | null; shown: number; smallest: number; labels: number[]; gap: string; pairs: [number, number, string][]; tried: [number, string][]; kinds: FixtureKind[] };

/** What the script says about one case: a refusal (with the Metric that does not vary), or the periods used, how each Metric was read, Ward's joins and the result for each count asked ("null", "2", "3", "4"). */
export type FixtureResult =
  | { refused: string; metric?: string }
  | { periods: string[]; ids: string[]; reading: string[]; merges: [number[], number[], string][]; asked: Record<string, FixtureAsked> };

/** One generated case: the Metrics' values as the text they were written in, and what the script worked out. */
export type FixtureCase = {
  id: string;
  span: "day" | "week" | "month" | "quarter";
  yearStart: number;
  series: { id: string; points: [string, string][] }[];
  shape: { plan: string; kinds: string[] };
  expected: { id: string; result: FixtureResult; trendRounding?: null | { sameDecisions: boolean; exactNearTie: boolean }; scipy?: { status: "matched" | "skipped" | "differs"; nearTie?: { step: number; smallest: string; second: string }; joins?: number; cuts?: number[] } };
};

/** The fixture Python and SciPy produced. */
export const FIXTURE = JSON.parse(readFileSync(here("look-alike.json"), "utf8")) as {
  version: number;
  script: string;
  tools: Record<string, string>;
  seed: number;
  nearTie: string;
  scipy: { checked: string[]; skipped: { case: string; step: number; smallest: string; second: string }[]; cutsMatched: number };
  trendRounding: { cases: string[]; changedAtATie: string[] };
  refusals: Record<string, number>;
  cases: FixtureCase[];
};
/** The script's hash as the fixture holds it, and the one of the script as it is now. */
export const HASHES = { fixture: FIXTURE.script, script: createHash("sha256").update(readFileSync(here("look-alike.py"))).digest("hex") };
