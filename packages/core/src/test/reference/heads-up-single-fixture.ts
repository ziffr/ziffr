// What the tests of the Heads-ups about one Metric share (spec 0041, ticket 15): the SciPy and NumPy fixture
// (fixtures/heads-up-single.py) and the check that it was made by the script's current text. Test support only.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const here = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

/** The fixture SciPy and NumPy produced, and the hash of the script that made it. */
export const FIXTURE = JSON.parse(readFileSync(here("heads-up-single.json"), "utf8")) as {
  version: number;
  script: string;
  tools: Record<string, string>;
  lines: { values: number[]; at: number; bound: number; yhat: number; var: number; n: number; below: number; above: number; driftBelow: number; driftAbove: number }[];
  fresh: { earlier: number[]; latest: number; p: number }[];
  changes: { values: number[]; n: number; tries: number; index: number; sse0: number; sse1: number; p: number; shift: number }[];
};
/** The script's hash as the fixture holds it, and the one of the script as it is now. */
export const HASHES = { fixture: FIXTURE.script, script: createHash("sha256").update(readFileSync(here("heads-up-single.py"))).digest("hex") };
