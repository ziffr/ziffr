// What the tests of the library's Methods share (spec 0041, ticket 3): the SciPy and NumPy fixture (fixtures/methods.py), the
// check that it was made by the script's current text, and the small helpers that put the references' exact numbers beside
// the code's doubles. Test support only.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { exactOf, nearestDoubleOf, type Exact } from "./exact";
import type { Point } from "../../types";

const here = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);

/** The fixture SciPy and NumPy produced, and the text of the script that made it. */
export const FIXTURE = JSON.parse(readFileSync(here("methods.json"), "utf8"));
/** The text of the script that makes the fixture, to hold its hash to the fixture's. */
export const SCRIPT = readFileSync(here("methods.py"));
/** The script's hash as the fixture holds it, and the one of the script as it is now. */
export const HASHES = { fixture: FIXTURE.script as string, script: createHash("sha256").update(SCRIPT).digest("hex") };

/** Monthly points from January 2024, one value per month. */
export function series(values: readonly (number | null)[], from = "2024-01"): Point[] {
  const [y, m] = from.split("-").map(Number);
  return values.flatMap((value, i) => (value === null ? [] : [{ period: new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 10), value }]));
}

/** A double's exact value by its text. */
export const ex = (v: number): Exact => exactOf(v);

/** ±√ of the double nearest to an exact r², as a result of the code is held to: exact up to the square root. */
export function rootOf(r: { r2: Exact; negative: boolean }): number {
  return (r.negative ? -1 : 1) * Math.sqrt(nearestDoubleOf(r.r2));
}

/** Whether two numbers agree to a relative `tolerance` (an absolute one near 0). */
export function close(a: number, b: number, tolerance = 1e-9): boolean {
  return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b));
}
