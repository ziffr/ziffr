// The Access Log and the API's limits (spec 0002, GLOSSARY: Access Log). Every call with an Access Key is recorded:
// when, the method, the route and the status, never a body or a value. The limits are counted from the log, in
// Postgres: no other store. Counting and recording are not one transaction, so a burst may pass a few calls over the
// limit; the limit is "about 60 a minute", which is enough to stop a flood.
import { db } from "./db";
import { Forbidden, type Actor, type FeedActor, type KeyActor } from "./actor";

/** Calls one key may make in any 60 seconds. */
export const REQUESTS_PER_MINUTE = 60;
/** How long the log keeps a call. */
export const LOG_DAYS = 90;

/** One call as its key's creator and the workspace's Owners and Admins see it. */
export type AccessLogEntry = { at: string; method: string; route: string; status: number };

/** The keys whose calls count together towards a limit: a person's key alone; every key of a Feed, so making more
 * keys does not raise a Feed's limits (spec 0012). */
export async function limitedKeyIds(actor: KeyActor | FeedActor): Promise<number[]> {
  if (!("feed" in actor)) return [Number(actor.key.id)];
  const { data } = await db().from("access_keys").select("id").eq("feed_id", actor.feedId).eq("workspace_id", actor.workspaceId);
  return [...new Set([Number(actor.key.id), ...(data ?? []).map((k) => Number(k.id))])];
}

/** Whether the key (or its Feed) may make another call now; if not, the seconds until it may. Calls refused for the
 * limit do not count, so a client that backs off gets in again. */
export async function admitCall(actor: KeyActor | FeedActor): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data, count } = await db().from("access_log").select("at", { count: "exact" }).in("key_id", await limitedKeyIds(actor)).gt("at", since).neq("status", 429).order("at", { ascending: true }).limit(1);
  if ((count ?? 0) < REQUESTS_PER_MINUTE) return { ok: true };
  const oldest = data?.[0] ? new Date(data[0].at).getTime() : Date.now();
  return { ok: false, retryAfter: Math.max(1, Math.ceil((oldest + 60_000 - Date.now()) / 1000)) };
}

/** The route a path was for: no query string, and a Metric's slug as {slug}. The log is read by Owners and Admins, who
 * need not see every Metric the key's creator sees, so it names no Metric. */
export function routeOf(path: string): string {
  return ((path.split("?")[0] || "/").replace(/(\/metrics\/)[^/]+/, "$1{slug}")).slice(0, 200);
}

/** Records a call with the key, and forgets calls older than LOG_DAYS. */
export async function recordCall(actor: KeyActor | FeedActor, call: { method: string; path: string; status: number; submitted?: number }): Promise<void> {
  await db().from("access_log").insert({
    key_id: Number(actor.key.id),
    method: call.method.slice(0, 10).toUpperCase(),
    route: routeOf(call.path),
    status: call.status,
    submitted: Math.max(0, Math.trunc(call.submitted ?? 0)),
  });
  await db().from("access_log").delete().lt("at", new Date(Date.now() - LOG_DAYS * 86_400_000).toISOString());
}

/** A key's most recent calls, newest first (at most 100): for its creator, and for the workspace's Owners and Admins,
 * the same people who see the key itself. A key cannot read the log. */
export async function accessLog(actor: Actor, keyId: number, limit = 50): Promise<AccessLogEntry[]> {
  if (actor.key || !Number.isInteger(keyId)) throw new Forbidden();
  const { data: key } = await db().from("access_keys").select("id, created_by, feed_id").eq("id", keyId).eq("workspace_id", actor.workspaceId).maybeSingle();
  const manages = actor.role === "owner" || actor.role === "admin";
  // A Feed Key is the Feed's, not its creator's: only those who manage Feeds read its log (spec 0012).
  if (!key || (!manages && (key.feed_id || key.created_by !== actor.personId))) throw new Forbidden();
  const { data } = await db().from("access_log").select("at, method, route, status").eq("key_id", keyId).order("at", { ascending: false }).limit(Math.min(Math.max(Math.trunc(limit) || 1, 1), 100));
  return data ?? [];
}
