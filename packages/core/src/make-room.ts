// Make room (spec 0029, ticket #270; GLOSSARY: Archived Metric, Workspace Limit, Size): before a Workspace moves to a
// smaller Size it must fit it. Ziffr Cloud sends the Owner here with the number of Metrics the smaller Size allows
// (`/settings/size/make-room?to=50`); the page names the Metrics to archive, the ones whose latest value is oldest
// first, ticked until enough are. Only the Owner and Admins, and only Metrics they see: Ziffr Cloud never sees a name.
import { Forbidden, type Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { archiveMetric } from "./archived-metrics";
import { inUse } from "./metric-row";
import { getMetrics, getRecentObservations } from "./workspace-data";
import { LIMIT_MAX } from "./workspace-limits";

/** One Metric the page offers to archive: its name, period and the period of its latest value (null for none). */
export type RoomMetric = { id: number; name: string; latest: string | null };

/** What Make room shows: how many Metrics the Workspace holds, how many the smaller Size allows, how many must go,
 * the Metrics the person may archive (oldest latest value first, those to tick first), and how many others it holds
 * that only their owners see. */
export type RoomPlan = { metrics: number; to: number; need: number; offered: RoomMetric[]; ticked: number[]; hidden: number };

/** The number a Size allows, as it came in the address: a whole number from 1 to 1,000,000, else refused. */
export function roomTarget(raw: unknown): number {
  const text = String(raw ?? "").trim();
  if (!/^\d{1,7}$/.test(text) || Number(text) < 1 || Number(text) > LIMIT_MAX) throw new Forbidden("That is not a number of Metrics a Size allows.");
  return Number(text);
}

/** Owners and Admins only, never with a key. */
function assertMayMakeRoom(actor: Actor): void {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden("Only Owners and Admins make room.");
}

/** The plan for getting the Workspace down to `to` Metrics in use. */
export async function makeRoomPlan(actor: Actor, to: number): Promise<RoomPlan> {
  assertMayMakeRoom(actor);
  const ws = actor.workspaceId;
  const all = inUse(await getMetrics(ws));
  const seen = await visibleMetricIds(ws, actor.personId, all);
  const visible = all.filter((m) => seen.has(m.id));
  const latest = new Map<number, string>();
  if (visible.length) for (const o of await getRecentObservations(ws, 1, visible.map((m) => m.id))) {
    const was = latest.get(o.metric_id);
    if (!was || o.period_start > was) latest.set(o.metric_id, o.period_start);
  }
  // Never a value: only which period the latest one is for, to say how long a Metric has been quiet.
  const offered = visible
    .map((m) => ({ id: m.id, name: m.name, latest: latest.get(m.id) ?? null }))
    .sort((a, b) => (a.latest ?? "") < (b.latest ?? "") ? -1 : (a.latest ?? "") > (b.latest ?? "") ? 1 : a.id - b.id);
  const need = Math.max(0, all.length - to);
  return { metrics: all.length, to, need, offered, ticked: offered.slice(0, need).map((m) => m.id), hidden: all.length - visible.length };
}

/** Archives the Metrics the person ticked, at most 1,000 at once, each with every check archiving one has (it must be
 * one they see and may archive). Returns how many were archived. */
export async function archiveForRoom(actor: Actor, ids: unknown): Promise<number> {
  assertMayMakeRoom(actor);
  // From a browser: whole numbers only, each once, at most 1,000.
  if (!Array.isArray(ids) || ids.length > 1000 || !ids.every((x) => Number.isInteger(x))) throw new Error("Tick at most 1,000 Metrics.");
  let n = 0;
  for (const id of new Set(ids as number[])) {
    // One that may not be archived (gone, hidden, the demo's) is left out; the others still go.
    const done = await archiveMetric(actor, id).catch((e) => { if (e instanceof Forbidden) return { archived: false }; throw e; });
    if (done.archived) n++;
  }
  return n;
}
