// Which request headers a demo visit's database client carries (GLOSSARY: Demo Mode; spec 0051, ticket 3). Kept apart from
// db.ts so that nothing reachable as `@ziffr/core/db` can start a visit: only demo-visiting.ts (which checks the setting)
// enters a scope, and db.ts only reads it. No imports, so neither of them is part of a cycle.
import { AsyncLocalStorage } from "node:async_hooks";

/** Who makes the change, as the wrapper knew it: the visit's id and the request's headers (for the network address). Never sent to the database. */
type Requester = { visitId: string; headers: { get(name: string): string | null } };
type Scope = { headers: Record<string, string>; active: boolean; who: Requester | null };
const scope = new AsyncLocalStorage<Scope>();

/** Runs work as a demo visit with these headers. The scope ends with the work: a timer or a promise that the work
 * started and that outlives it inherits the store (AsyncLocalStorage does so for timers, as usage-calls.ts's interval
 * would), but finds it inactive and goes back to the ordinary client. */
export async function runAsVisit<T>(headers: Record<string, string>, work: () => Promise<T>, who: Requester | null = null): Promise<T> {
  const mine: Scope = { headers, active: true, who };
  try {
    return await scope.run(mine, work);
  } finally {
    mine.active = false;
  }
}

/** The headers of the visit now running, the same object for all its work; null outside one, or after it ended. */
export function visitHeaders(): Record<string, string> | null {
  const s = scope.getStore();
  return s?.active ? s.headers : null;
}

/** Who made the change the visit now running does (for the shares an automatic Version is counted against), or null when the scope did not say. */
export function visitWho(): Requester | null {
  const s = scope.getStore();
  return s?.active ? s.who : null;
}
