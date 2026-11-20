// Size and usage (spec 0029, ticket #266; GLOSSARY: Workspace Limit, Size): what a Workspace's Owners and Admins see
// of its limit, the note people see on the New Metric form near the limit, the banner while it is over, and the two
// emails to Owners when the 14 days over the limit start and end. Only numbers of the actor's own Workspace: never
// another Workspace's, never a price or a payment detail, which Ziffr does not hold (ADR 0013).
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { deliverNotice } from "./deliveries";
import { DEMO_WORKSPACE_ID } from "./team";
import { GRACE_DAYS, limitOf, limitRule, metricCount, roomOf } from "./workspace-limits";

/** A Workspace's Size and usage: how many Metrics it holds, its limit and the name to show, its room over the limit,
 * when it went over and when new Metrics start to wait, whether they wait now, and a coming change if one is set. */
export type Usage = {
  metrics: number;
  limit: number | null;
  label: string | null;
  room: number | null;
  overSince: string | null;
  graceEnds: string | null;
  waiting: boolean;
  next: { label: string; on: string } | null;
};

const DAY = 86_400_000;

/** The actor's Workspace's usage, for everyone in it (the New Metric form shows it to Members too). */
export async function workspaceUsage(actor: Pick<Actor, "workspaceId">): Promise<Usage> {
  const ws = actor.workspaceId;
  const [metrics, limit, { data: w }, { data: own }] = await Promise.all([
    metricCount(ws), limitOf(ws),
    db().from("workspaces").select("id, over_limit_since").eq("id", ws).maybeSingle(),
    db().from("workspace_limits").select("next_label, next_on").eq("workspace_id", ws).maybeSingle(),
  ]);
  const overSince = (w?.over_limit_since as string | null) ?? null;
  const since = overSince ? new Date(overSince) : null;
  return {
    metrics, limit: limit?.metrics ?? null, label: limit?.label ?? null, room: limit ? roomOf(limit.metrics) : null,
    overSince, graceEnds: since ? new Date(since.getTime() + GRACE_DAYS * DAY).toISOString() : null,
    waiting: limit ? limitRule(metrics, limit.metrics, since, new Date()) === "refuse" : false,
    next: own?.next_label && own.next_on ? { label: own.next_label as string, on: own.next_on as string } : null,
  };
}

/** Size and usage for Workspace settings: Owners and Admins only, never in the demo. */
export async function sizeAndUsage(actor: Actor): Promise<Usage> {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden("Only Owners and Admins see the Size and usage.");
  return workspaceUsage(actor);
}

/** "48 of 50 Metrics" once the Workspace holds 90 % of its limit or more, else null. Pure. */
export function nearLimitNote(u: Pick<Usage, "metrics" | "limit">): string | null {
  if (u.limit === null || u.metrics < u.limit * 0.9) return null;
  return `${u.metrics.toLocaleString("en-US")} of ${u.limit.toLocaleString("en-US")} Metrics`;
}

/** A day as "3 December 2026", in UTC like the stored times. */
export const dayWords = (iso: string): string => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The banner's words for Owners and Admins while the Workspace is over its limit, else null. Pure. */
export function overLimitBanner(u: Usage): string | null {
  if (u.limit === null || !u.overSince || u.metrics <= u.limit) return null;
  const size = u.label ? `its Size ${u.label}` : "its limit";
  const holds = `This Workspace holds ${u.metrics.toLocaleString("en-US")} Metrics, more than the ${u.limit.toLocaleString("en-US")} ${size} allows.`;
  return u.waiting
    ? `${holds} New Metrics wait now. Everything else keeps working.`
    : `${holds} New Metrics can be made until ${dayWords(u.graceEnds!)}. Everything else keeps working.`;
}

/** The two emails to a Workspace's Owners: when the 14 days over the limit start and when they end. Each goes once
 * per time over (keyed by over_limit_since), so a Workspace that goes back under and over again is told again. Run
 * by the hourly Workflows job; returns how many notices went out. */
export async function sendLimitNotices(now: Date = new Date()): Promise<number> {
  const { data } = await db().from("workspaces").select("id, over_limit_since, limit_started_told, limit_ended_told").not("over_limit_since", "is", null).neq("id", DEMO_WORKSPACE_ID).limit(500);
  let sent = 0;
  for (const w of data ?? []) {
    const since = w.over_limit_since as string;
    const ended = now.getTime() >= new Date(since).getTime() + GRACE_DAYS * DAY;
    const kind = w.limit_started_told !== since ? "started" : ended && w.limit_ended_told !== since ? "ended" : null;
    if (!kind) continue;
    // Claimed first in the database, only while still unclaimed for this time over, so two jobs at once send it once.
    const { data: claimed } = await db().rpc("claim_limit_notice", { p_workspace: w.id, p_kind: kind, p_since: since });
    if (claimed !== true) continue;
    const u = await workspaceUsage({ workspaceId: w.id as string });
    if (u.limit === null) continue;
    const { data: owners } = await db().from("memberships").select("user_id").eq("workspace_id", w.id).eq("role", "owner");
    const size = u.label ? `its Size ${u.label}` : "its limit";
    const subject = kind === "started" ? "Your Workspace is over its limit" : "New Metrics now wait in your Workspace";
    const text = kind === "started"
      ? `Your Workspace holds ${u.metrics} Metrics, more than the ${u.limit} ${size} allows. Until ${dayWords(u.graceEnds!)} new Metrics can still be made, up to ${u.room}. After that they wait until it holds fewer than ${u.limit}. Everything else keeps working, and values keep arriving. Archive Metrics you no longer track, or change the Size.`
      : `The 14 days over the limit have ended. Your Workspace holds ${u.metrics} Metrics and ${size} allows ${u.limit}, so new Metrics wait until it holds fewer. Everything else keeps working, and values keep arriving. Archive Metrics you no longer track, or change the Size.`;
    for (const o of owners ?? []) {
      await deliverNotice(w.id as string, { recipientId: o.user_id as string, senderId: null, subject, text, link: "/settings/workspace#size" });
      sent++;
    }
  }
  return sent;
}
