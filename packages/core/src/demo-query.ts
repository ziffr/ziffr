// A query whose answer decides whether the demo lets a visitor's change through (GLOSSARY: Demo Mode; spec 0051): it fails CLOSED. A failed
// query comes back as `{ data: null, error }`, and a gate that read only `data` would take "nothing found" for "nothing in the way" and let the
// change through. Every gate and helper of the demo that decides allow or refuse by a database read reads it through these two functions, and
// `demo-query.test.ts` scans the gate files for a read that does not.
import { Forbidden } from "./actor";

/** The demo could not check a change, so it refused it: a Forbidden, so every place that shows a refusal shows the words. */
export class DemoCheckFailed extends Forbidden {
  constructor() {
    super("The demo could not check that just now. Try again.");
    this.name = "DemoCheckFailed";
  }
}

/** A query's rows (or row, or null when there is none), or the refusal when the query failed. */
export function demoData<D>(r: { data: D; error?: unknown }): D {
  if (r.error) throw new DemoCheckFailed();
  return r.data;
}

/** A counting query's count, or the refusal when the query failed or answered no count. */
export function demoCount(r: { count: number | null; error?: unknown }): number {
  if (r.error || r.count === null || r.count === undefined) throw new DemoCheckFailed();
  return r.count;
}
