// Automatic Snapshots (spec 0013, ticket #176; GLOSSARY: Snapshot, Lock, Workflow). A dashboard's owner may have it
// take a Snapshot of every week, month or quarter by itself. The daily run of each workspace (spec 0005) takes the
// Snapshot of the last complete period as soon as every Metric on the dashboard is Locked for every Metric period
// inside it, or a set number of days after it ended, whichever comes first. It is taken in the owner's name, as a
// draft, with what the owner sees, and the owner is told it is ready to write up. A period is taken once: one that
// exists, or existed and was deleted, is not taken again.
import { addDays, format, parseISO } from "date-fns";
import { Forbidden, type Actor } from "./actor";
import { dashboardRole } from "./dashboards";
import { db } from "./db";
import { deliverNotice } from "./deliveries";
import { completePeriods, metricPeriodsIn, type SnapshotPeriod, type SnapshotPeriodKind } from "./snapshot-periods";
import { takeSnapshot } from "./snapshots";
import { DEMO_WORKSPACE_ID } from "./team";
import { widgetMetricIds } from "./widget-metrics";
import type { Period } from "./types";
import { yearStartOf } from "./fiscal-year";
import { type YearStart } from "./periods";

/** The longest a dashboard may wait after a period ends before taking its Snapshot, in days. */
export const MAX_WAIT_DAYS = 60;

/** The Snapshot periods a dashboard may take by itself; half-years and years only by hand for now. */
const AUTO_KINDS: SnapshotPeriodKind[] = ["week", "month", "quarter"];

/** How a dashboard takes its Snapshots by itself: every week, month or quarter, or never (null). */
export type AutoSnapshots = { every: SnapshotPeriodKind | null; waitDays: number };

/** What taking a Snapshot by itself sets off: telling the dashboard's owner. Tests may pass their own. */
export type AutoSnapshotEffects = {
  /** Tells a person, from Ziffr itself, that a Snapshot is ready to write up. */
  notify: (ws: string, n: { recipientId: string; subject: string; text: string; link: string }) => Promise<void>;
};

const effectsOfCore: AutoSnapshotEffects = { notify: (ws, n) => deliverNotice(ws, { ...n, senderId: null }) };

/** Sets whether and how often a dashboard takes Snapshots by itself. Only its owner: they are taken in their name. */
export async function setAutoSnapshots(actor: Actor, dashboardId: number, setting: { every: unknown; waitDays: unknown }): Promise<void> {
  if (!Number.isInteger(dashboardId)) throw new Forbidden();
  if ((await dashboardRole(actor, dashboardId)) !== "owner") throw new Forbidden();
  const every = setting?.every === null || setting?.every === "" ? null : String(setting?.every);
  if (every !== null && !AUTO_KINDS.includes(every as SnapshotPeriodKind)) throw new Error("Pick week, month or quarter, or none.");
  const waitDays = Math.round(Number(setting?.waitDays));
  if (!Number.isFinite(waitDays) || waitDays < 0 || waitDays > MAX_WAIT_DAYS) throw new Error(`Wait between 0 and ${MAX_WAIT_DAYS} days.`);
  const { error } = await db().from("dashboards").update({ snapshot_every: every, snapshot_wait_days: waitDays }).eq("id", dashboardId).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The setting could not be saved.");
}

/** Whether every Metric on the dashboard is Locked for every one of its periods inside the Snapshot period. A
 * dashboard without Metrics is never complete this way; it waits. */
async function allLocked(ws: string, metrics: { id: number; period: Period }[], p: SnapshotPeriod, yearStart: YearStart): Promise<boolean> {
  if (!metrics.length) return false;
  const { data } = await db().from("period_states").select("metric_id, period_start").eq("workspace_id", ws).eq("state", "locked").in("metric_id", metrics.map((m) => m.id)).gte("period_start", p.start).lte("period_start", p.end);
  const locked = new Set((data ?? []).map((r) => `${r.metric_id}:${r.period_start}`));
  return metrics.every((m) => {
    const inside = metricPeriodsIn(m.period, p, yearStart);
    return inside.length > 0 && inside.every((s) => locked.has(`${m.id}:${s}`));
  });
}

/** Takes the Snapshots that are due in one workspace on one day (yyyy-mm-dd, in its own time zone). Never in the
 * demo. A dashboard whose Snapshot fails is skipped and the others go on. Returns how many were taken and failed. */
export async function takeDueSnapshots(workspaceId: string, today: string, effects: AutoSnapshotEffects = effectsOfCore): Promise<{ taken: number; failed: number }> {
  // Visitors share the demo; its Snapshots come with its reset (demo-snapshots.ts), never from the clock.
  if (workspaceId === DEMO_WORKSPACE_ID) return { taken: 0, failed: 0 };
  const { data: dashboards } = await db().from("dashboards").select("id, name, owner_id, snapshot_every, snapshot_wait_days").eq("workspace_id", workspaceId).not("snapshot_every", "is", null).order("id");
  let taken = 0;
  let failed = 0;
  const yearStart = await yearStartOf(workspaceId);
  for (const d of dashboards ?? []) {
    const p = completePeriods(d.snapshot_every as SnapshotPeriodKind, today, 1, yearStart)[0];
    // Once per period: one there is, or one deleted, is not taken again.
    const { count } = await db().from("dashboard_snapshots").select("id", { count: "exact", head: true }).eq("dashboard_id", d.id).eq("period_kind", p.kind).eq("period_start", p.start);
    if (count) continue;
    const waited = today >= format(addDays(parseISO(p.end), Number(d.snapshot_wait_days ?? 5)), "yyyy-MM-dd");
    if (!waited) {
      const { data: widgets } = await db().from("widgets").select("metric_ids, settings").eq("workspace_id", workspaceId).eq("dashboard_id", d.id);
      const ids = [...new Set((widgets ?? []).flatMap((w) => widgetMetricIds(w.metric_ids ?? [], w.settings)))];
      const { data: metrics } = ids.length ? await db().from("metrics").select("id, period").eq("workspace_id", workspaceId).in("id", ids) : { data: [] };
      if (!(await allLocked(workspaceId, (metrics ?? []) as { id: number; period: Period }[], p, yearStart))) continue;
    }
    // In the owner's name, with their role in the workspace and what they see.
    const { data: member } = await db().from("memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", d.owner_id).maybeSingle();
    if (!member) { failed++; continue; }
    const owner: Actor = { personId: d.owner_id as string, workspaceId, role: member.role as Actor["role"] };
    let id: number;
    try {
      id = await takeSnapshot(owner, d.id as number, { kind: p.kind, start: p.start }, { automatic: true, today });
      taken++;
    } catch {
      // Such as a Metric on it the owner does not see: they can take it by hand once that is sorted out.
      failed++;
      continue;
    }
    try {
      await effects.notify(workspaceId, {
        recipientId: owner.personId,
        subject: `Snapshot of ${p.label} ready to write up`,
        text: `Ziffr took the Snapshot of ${p.label} of your dashboard ${d.name}. Write its introduction and headlines, then show it to everyone who may open the dashboard.`,
        link: `/dashboards/${d.id}/snapshots/${id}`,
      });
    } catch {
      // The Snapshot is there either way; it shows as a draft in the dashboard's Snapshots.
      console.error("Automatic Snapshot: the owner could not be told");
    }
  }
  return { taken, failed };
}
