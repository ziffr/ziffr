// A visit to the demo and what it has done (GLOSSARY: Demo Mode; spec 0051, ticket 2). The demo cookie holds 128 random
// bits that stand for one visit (apps/web/src/lib/demo-visit-cookie.ts); here only their hash is used, as the key of
// the counts the limits of a later ticket read, so a database dump or a log never holds an id that works as a cookie.
// Plumbing only: nothing here refuses a visitor yet, and the counts are only ever kept for the demo Workspace.
import { createHash } from "node:crypto";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";

/** The visit id's shape in the cookie: 128 bits as 32 lowercase hex characters. */
const VISIT_ID = /^[0-9a-f]{32}$/;

/** The key of a visit: SHA-256 of the id (with a fixed prefix, so the same id hashed elsewhere gives another value),
 * as hex truncated to 32 characters (128 bits: far past guessing, half the length of the full digest). Stable, and one
 * way: it cannot be turned back into the cookie's id. An id that is not an id is refused, never hashed. */
export function visitKey(id: string): string {
  if (!VISIT_ID.test(id)) throw new Error("Not a visit id.");
  return createHash("sha256").update(`ziffr-demo-visit:${id}`).digest("hex").slice(0, 32);
}

const MINUTE = 60_000;
// The reset window arithmetic (10, 25, 40 and 55 past the hour) lives in demo-reset-line.ts, which a browser may import
// (this file reaches for node:crypto); it is re-exported here for the limits.
export { resetWindowStart, nextResetWindowStart } from "./demo-reset-line";

/** When the minute that `at` is in began, for the "changes a minute" count. */
export function minuteStart(at: Date): Date {
  return new Date(Math.floor(at.getTime() / MINUTE) * MINUTE);
}

/** What a count is about: one visit (its key), one network address (its hash) or the whole demo (no key). */
export type VisitCountKind = "visit" | "address" | "demo";

/** The counts only exist for the demo: a real Workspace never counts a visit. */
function inDemo(actor: Pick<Actor, "workspaceId">): void {
  if (actor.workspaceId !== DEMO_WORKSPACE_ID) throw new Forbidden("Visits are counted only in the demo.");
}

/** Adds to the count of a visit, address or the demo in a window and answers the new count. Only for the demo. */
export async function bumpDemoVisitCount(actor: Pick<Actor, "workspaceId">, kind: VisitCountKind, key: string, windowStart: Date, by = 1): Promise<number> {
  inDemo(actor);
  const { data, error } = await db().rpc("demo_visit_bump", { p_window: windowStart.toISOString(), p_kind: kind, p_key: kind === "demo" ? "" : key, p_by: by });
  if (error) { console.error("demo visit counts (bump):", error.message); throw new Error("The demo's visit count could not be changed."); }
  return data as number;
}

/** A count in a window, 0 when nothing was counted. Only for the demo. */
export async function demoVisitCount(actor: Pick<Actor, "workspaceId">, kind: VisitCountKind, key: string, windowStart: Date): Promise<number> {
  inDemo(actor);
  const { data, error } = await db().from("demo_visit_counts").select("count").eq("window_start", windowStart.toISOString()).eq("kind", kind).eq("key", kind === "demo" ? "" : key).maybeSingle();
  if (error) { console.error("demo visit counts (read):", error.message); throw new Error("The demo's visit count could not be read."); }
  return data?.count ?? 0;
}

/** Empties every count: part of each Demo Reset (demo-reset.ts), so a new window starts at zero. Not a person's call. */
export async function clearDemoVisitCounts(): Promise<void> {
  const { error } = await db().from("demo_visit_counts").delete().gte("count", 0);
  if (error) { console.error("demo visit counts (clear):", error.message); throw new Error("The demo's visit counts could not be emptied."); }
}
