// What stays of a deleted Metric in past Snapshots (spec 0065; GLOSSARY: Metric, Snapshot, Total). A Snapshot keeps
// its own copy of the numbers; who is shown a Metric in it is asked of who sees the Metric now, which nobody does once
// it is deleted. So deleting writes down who saw it at that moment, and they keep it in the copies, marked as deleted.
// Visibility: this only ever keeps what a person had. It never adds a reader, it counts only while the Metric is gone,
// the person still needs to be allowed to open the Snapshot, and leaving the Workspace ends it.
import { getMetrics, allRows, mustRead } from "./workspace-data";
import { visibilityOfMany, visibleMetricIds } from "./access";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import type { Metric } from "./types";

/** What a deleted Metric's name is followed by wherever a Snapshot still shows it. */
export const DELETED_MARK = " (deleted)";

/** Who sees each of these Metrics now: the Members (and Guests) of the Workspace, by Metric id. Asked before anything
 * is changed for a deletion, so whoever saw a Metric through a dashboard it is taken off counts too. */
export async function readersNow(ws: string, metrics: Metric[], ids: readonly number[]): Promise<Map<number, string[]>> {
  const [seesAs, members] = await Promise.all([
    visibilityOfMany(ws, metrics),
    allRows<{ user_id: string }>((from, to) => mustRead(db().from("memberships").select("user_id").eq("workspace_id", ws).order("user_id").range(from, to), "Who sees the Metrics could not be read. Try again in a moment.")),
  ]);
  const seen = members.map((m) => ({ person: m.user_id, ids: seesAs(m.user_id).metrics }));
  return new Map(ids.map((id) => [id, seen.filter((p) => p.ids.has(id)).map((p) => p.person)]));
}

/** Writes down who keeps a Metric in past Snapshots, before it is deleted; throws when it could not, so no Metric goes
 * without it. For the deletion only, which has checked who asks. */
export async function keepForSnapshots(ws: string, metric: { id: number; totalOpen: boolean }, readers: readonly string[]): Promise<void> {
  const must = (r: { error: unknown }) => { if (r.error) throw new Error("The Metric could not be deleted. Try again in a moment."); };
  // Written afresh: a deletion that stopped half way must not leave readers behind who lost the Metric since.
  must(await db().from("deleted_metrics").delete().eq("workspace_id", ws).eq("metric_id", metric.id));
  must(await db().from("deleted_metrics").insert({ workspace_id: ws, metric_id: metric.id, total_open: metric.totalOpen }));
  for (let i = 0; i < readers.length; i += 500) {
    must(await db().from("deleted_metric_readers").insert(readers.slice(i, i + 500).map((user_id) => ({ workspace_id: ws, metric_id: metric.id, user_id }))));
  }
}

/** The deleted Metrics this person keeps in past Snapshots. `existing` are the ids of the Workspace's Metrics now: one
 * that is still there is judged as any Metric, never by this. */
export async function deletedKept(ws: string, personId: string, existing: ReadonlySet<number>): Promise<Set<number>> {
  const rows = await allRows<{ metric_id: number }>((from, to) => db().from("deleted_metric_readers").select("metric_id").eq("workspace_id", ws).eq("user_id", personId).order("metric_id").range(from, to));
  return new Set(rows.map((r) => r.metric_id).filter((id) => !existing.has(id)));
}

/** What a person is shown of the Metrics in a Snapshot: those they see now, and the deleted ones they keep. */
export async function seenInSnapshots(ws: string, personId: string): Promise<{ visible: Set<number>; deleted: Set<number> }> {
  const metrics = await getMetrics(ws);
  const [visible, deleted] = await Promise.all([visibleMetricIds(ws, personId, metrics), deletedKept(ws, personId, new Set(metrics.map((m) => m.id)))]);
  return { visible: new Set([...visible, ...deleted]), deleted };
}

/** Refuses anyone who does not see every Metric a Snapshot kept, deleted ones as above. For Snapshots only: a deleted
 * Metric is never one a live dashboard, deck or Share may name. */
export async function assertSeesKeptMetrics(actor: Actor, metricIds: readonly number[]): Promise<void> {
  if (!metricIds.length) return;
  const { visible } = await seenInSnapshots(actor.workspaceId, actor.personId);
  if (!metricIds.every((id) => visible.has(id))) throw new Forbidden("This shows Metrics you may not see.");
}

/** The deleted Totals of a Workspace that were open when they were deleted: their copies stay open. `existing` as above. */
export async function deletedOpenTotals(ws: string, existing: ReadonlySet<number>): Promise<number[]> {
  const rows = await allRows<{ metric_id: number }>((from, to) => db().from("deleted_metrics").select("metric_id").eq("workspace_id", ws).eq("total_open", true).order("metric_id").range(from, to));
  return rows.map((r) => r.metric_id).filter((id) => !existing.has(id));
}
