// A visit's writes to the demo (GLOSSARY: Demo Mode, Demo Reset; spec 0051, ticket 3). As `seedingDemo` gives the seed a
// database client that says so in a request header, `visitingDemo` gives a demo visit's work a client that carries the
// Generation the visitor's page was drawn in and the visit's key. The database guard (migration 20270126090000) lets a
// write through only for a table on its allow-list and only while that Generation is the demo's current one; with the
// setting off, or the list empty (as now), the header changes nothing and every write is refused as before.
import { visitKey } from "./demo-visit";
import { demoChangesInEffect } from "./demo-reset-decision";
import { withDemoVisitHeaders } from "./db";
import { settingsInEffect } from "./settings-in-effect";

/** The visit a request belongs to: the Generation its page was drawn in (the demo bar's cookie) and the visit's id (the demo cookie). */
export type DemoVisit = { generation: number; visit: string };

/** The request headers of a demo visit, or null where visitors may not change the demo (the setting is not in effect, or the
 * Generation or the id is not what it should be), so the work is then an ordinary, refused one. Only the visit's hash is sent. */
export function demoVisitHeaders(visit: DemoVisit, settings: Record<string, string | undefined>): Record<string, string> | null {
  if (!demoChangesInEffect(settings)) return null;
  if (!Number.isSafeInteger(visit.generation) || visit.generation < 0 || visit.generation > 999_999_999_999_999) return null;
  let key: string;
  try { key = visitKey(visit.visit); } catch { return null; }
  return { "x-ziffr-demo-visit": String(visit.generation), "x-ziffr-demo-visit-key": key };
}

/** Runs a demo visit's work with its client's headers, where the setting is in effect; otherwise runs it as it is, and the
 * database refuses what the demo refuses. Never for the seed, whose client wins inside seedingDemo. */
export async function visitingDemo<T>(visit: DemoVisit, work: () => Promise<T>): Promise<T> {
  const headers = demoVisitHeaders(visit, await settingsInEffect());
  return headers ? withDemoVisitHeaders(headers, work) : work();
}
