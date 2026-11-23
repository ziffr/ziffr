// @ts-nocheck
// What the tests of the Heads-up maths share (spec 0041, ticket 13): the SciPy and NumPy fixture (fixtures/heads-up.py) and the
// check that it was made by the script's current text. Test support only.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const here = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

/** One window of a pair as the script writes it. */
export type FixtureWindow = { lag: number; r: number; n: number; nEff: number; pDelays: number; p: number; tries: number };

/** The fixture SciPy and NumPy produced, and the text of the script that made it. */
export const FIXTURE = JSON.parse(readFileSync(here("heads-up.json"), "utf8")) as {
  version: number;
  script: string;
  tools: Record<string, string>;
  chances: { r: number; n: number; p: number }[];
  pearson: { x: number[]; y: number[]; r: number; p: number }[];
  benjaminiHochberg: { ps: number[]; adjusted: number[]; reported: Record<string, boolean[]> }[];
  effective: { x: number[]; y: number[]; xg: (number | null)[]; n: number; rhoX: number[]; rhoY: number[]; rhoXGapped: number[]; nEff: number; nEffGapped: number }[];
  scans: { name: string; a: string[]; b: string[]; scan: null | { through: number; full: FixtureWindow & { rFirst: number | null; nFirst: number; rSecond: number | null; nSecond: number }; before: null | (FixtureWindow & { recent: null | { r: number; n: number; dropP: number } }) } }[];
};
/** The script's hash as the fixture holds it, and the one of the script as it is now. */
export const HASHES = { fixture: FIXTURE.script, script: createHash("sha256").update(readFileSync(here("heads-up.py"))).digest("hex") };
