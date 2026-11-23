// @ts-nocheck
// Usage: View Counts (GLOSSARY: Usage, View Count; spec 0031). How often a dashboard, deck or Metric is opened per day,
// as a number and never by whom: nothing here stores or even receives an actor's person. Reading comes with the Usage
// page's loaders; this file only counts and forgets.
import { db } from "./db";
import { daysStrict } from "./keep-days";
import type { Actor, KeyActor } from "./actor";
import { DEMO_WORKSPACE_ID } from "./team";

/** What can be counted as opened. */
export type ViewSubject = { kind: "dashboard" | "deck" | "metric"; id: number };

/** Days View Counts are kept unless the Installation sets otherwise (ZIFFR_KEEP_VIEW_COUNT_DAYS; 13 months: a 90-day rule
 * with room, and a quarter against last year's). */
export const VIEW_COUNT_DAYS = 400;

/** Counts one open of a subject in the actor's Workspace, today (UTC): `app` for a signed-in person's page, `link` for a
 * View Link, `api` for a program's read through an Access Key. A single upsert, best effort: it never throws, and counts nothing in the
 * demo, nothing for a subject outside the actor's Workspace, and nothing for a malformed one. The caller has loaded
 * the subject for the actor already; the database checks only that it belongs to the Workspace. Stores no person. */
export async function recordView(actor: Pick<Actor | KeyActor, "workspaceId">, subject: ViewSubject, via: "app" | "link" | "api" = "app"): Promise<void> {
  try {
    if (actor.workspaceId === DEMO_WORKSPACE_ID || !Number.isSafeInteger(subject.id) || subject.id <= 0) return;
    await db().rpc("record_view", { p_workspace: actor.workspaceId, p_kind: subject.kind, p_subject: subject.id, p_via: via });
  } catch (e) {
    console.error("recordView failed", e instanceof Error ? e.message : "unknown");
  }
}

/** Deletes View Counts older than the days the Installation keeps them (fails, and deletes nothing, when the setting cannot be read), for every Workspace (the daily rollup job calls it); returns how
 * many rows went. Takes no actor: it is a job's, reached only with the job secret. */
export async function pruneViewCounts(): Promise<number> {
  const { data, error } = await db().rpc("prune_view_counts", { p_days: await daysStrict("ZIFFR_KEEP_VIEW_COUNT_DAYS") });
  if (error) throw new Error("Forgetting old View Counts did not work.");
  return Number(data ?? 0);
}
