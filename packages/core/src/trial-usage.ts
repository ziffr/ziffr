// What a trial has used of its Trial Limits (spec 0040; GLOSSARY: Trial Limit, Trial Workspace): "3 of 5 people, 4 of 10
// invitations today, 12 of 25 Metrics", and the words of a limit that was reached, with when it resets. Only the Owners
// and Admins of a running Trial Workspace see the counts; everyone else in it sees nothing but the trial's end, which
// trialStatus gives. Counts of this Workspace only: nothing of the Installation's other trials is read or said.
import { db } from "./db";
import type { Actor } from "./actor";
import { trialEndsAt } from "./trials";
import { trialLimitsInEffect } from "./trial-limits-in-effect";

const DAY = 86_400_000;

// Members and invitations still open, as the database counts them for the limit (trial_people).
async function trialPeople(workspaceId: string): Promise<number> {
  const { data } = await db().rpc("trial_people", { p_workspace: workspaceId });
  return typeof data === "number" ? data : 0;
}

/** One Trial Limit and how much of it a trial has used. `resetsAt` is when the oldest use of a daily limit leaves it. */
export type TrialUsageRow = { key: "people" | "invitations" | "metrics"; label: string; used: number; limit: number; reached: boolean; resetsAt: string | null; words: string };

/** The trial's usage for the actor, or null when they may not see it (not an Owner or Admin) or there is no running trial. */
export async function trialUsage(actor: Actor): Promise<TrialUsageRow[] | null> {
  if (actor.role !== "owner" && actor.role !== "admin") return null;
  const ends = await trialEndsAt(actor.workspaceId);
  if (!ends || ends.getTime() <= Date.now()) return null;
  const since = new Date(Date.now() - DAY).toISOString();
  const [limits, people, sends, metrics] = await Promise.all([
    trialLimitsInEffect(),
    trialPeople(actor.workspaceId),
    db().from("invitation_emails").select("sent_at").eq("workspace_id", actor.workspaceId).gt("sent_at", since).order("sent_at").limit(100),
    db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId),
  ]);
  const sent = (sends.data ?? []) as { sent_at: string }[];
  const usedSends = sent.length;
  const resetsAt = usedSends >= limits.invitationsPerDay && sent[0] ? new Date(new Date(sent[0].sent_at).getTime() + DAY).toISOString() : null;
  const rows: TrialUsageRow[] = [
    { key: "people", label: "people", used: people, limit: limits.people, reached: people >= limits.people, resetsAt: null,
      words: `${people} of ${limits.people} people, the Owner and the invitations still open included.` },
    { key: "invitations", label: "invitation emails today", used: usedSends, limit: limits.invitationsPerDay, reached: usedSends >= limits.invitationsPerDay, resetsAt,
      words: `${usedSends} of ${limits.invitationsPerDay} invitation emails today.` },
    { key: "metrics", label: "Metrics", used: metrics.count ?? 0, limit: limits.metrics, reached: (metrics.count ?? 0) >= limits.metrics, resetsAt: null,
      words: `${metrics.count ?? 0} of ${limits.metrics} Metrics.` },
  ];
  return rows;
}

/** The one line for the trial bar: "3 of 5 people, 4 of 10 invitation emails today, 12 of 25 Metrics". */
export const usageLine = (rows: TrialUsageRow[]): string => rows.map((r) => `${r.used} of ${r.limit} ${r.label}`).join(", ");

/** What a reached limit says and when it ends, or null while there is room. */
export function reachedWords(row: TrialUsageRow): string | null {
  if (!row.reached) return null;
  if (row.key === "invitations") return `You have sent all ${row.limit} invitation emails of today${row.resetsAt ? `; more can go from ${row.resetsAt.slice(11, 16)} UTC` : ""}. An invitation that was not emailed stays as a link you send yourself.`;
  if (row.key === "people") return `The trial holds as many people as it may (${row.limit}). Revoke an open invitation to invite someone else.`;
  return `The trial holds as many Metrics as it may (${row.limit}). Archive or delete one to make another.`;
}
