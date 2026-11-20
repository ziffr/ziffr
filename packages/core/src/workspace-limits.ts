// Workspace Limits (GLOSSARY: Workspace Limit, Size, Archived Metric; spec 0029, ticket #265): the most Metrics a
// Workspace may hold, unlimited unless someone sets it. The rule over the limit lives here and, with the same
// numbers, in the database's trigger metrics_within_limit; a database test runs both on one table of cases.
// The open code knows a Size only as a limit with a name (`label`); prices and payments are Ziffr Cloud's (ADR 0013).
import { can, type Actor } from "./actor";
import { db } from "./db";
import { settingsInEffect, type Settings } from "./settings-in-effect";

/** Days a Workspace may stay over its limit, within its room, before new Metrics wait. */
export const GRACE_DAYS = 14;

/** The database's code for a Metric refused by the limit (trigger metrics_within_limit). */
export const LIMIT_CODE = "ZF441";

/** Most Metrics a limit may be set to; a larger Workspace is "no limit". */
export const LIMIT_MAX = 1_000_000;

/** Longest name of a limit, such as "Small". */
export const LABEL_MAX = 30;

/** How many Metrics a Workspace may hold for a while over its limit: 10 % more, at least one. */
export const roomOf = (limit: number): number => limit + Math.max(1, Math.floor(limit / 10));

/** What one more Metric does: it fits ("allow"), it takes the Workspace over its limit within the room and the grace
 * ("over"), or it waits ("refuse"). `count` is how many Metrics the Workspace holds now, Archived Metrics not
 * counted; `since` when it went over its limit, or null. Pure; the trigger answers the same. */
export function limitRule(count: number, limit: number | null, since: Date | null, now: Date): "allow" | "over" | "refuse" {
  if (limit === null || count + 1 <= limit) return "allow";
  if (count + 1 > roomOf(limit)) return "refuse";
  if (since && now.getTime() >= since.getTime() + GRACE_DAYS * 86_400_000) return "refuse";
  return "over";
}

/** A Workspace's limit: how many Metrics, and the name to show (a Size, such as "Small"); null when it has none. */
export type WorkspaceLimit = { metrics: number; label: string | null };

/** The words for a Metric refused by the limit, the same in the app, the API and the MCP Server. */
export function limitRefusal(count: number, limit: WorkspaceLimit): string {
  const holds = `This Workspace holds ${count.toLocaleString("en-US")} Metric${count === 1 ? "" : "s"}`;
  const what = limit.label ? `its Size ${limit.label}` : "its limit";
  const allows = count > limit.metrics ? `, more than the ${limit.metrics.toLocaleString("en-US")} ${what} allows` : `, as many as ${what} allows`;
  const change = limit.label ? "ask an Owner to change the Size" : "ask whoever runs this Ziffr to raise the limit";
  return `${holds}${allows}. Archive a Metric, or ${change}.`;
}

/** Thrown when the limit refuses a new Metric, or bringing an Archived Metric back. Its message is for people; the
 * API also gives the count and the limit. */
export class LimitReached extends Error {
  constructor(readonly count: number, readonly limit: WorkspaceLimit) {
    super(limitRefusal(count, limit));
    this.name = "LimitReached";
  }
}

/** A whole number of Metrics from a setting or a form: 1 to LIMIT_MAX, or null for none (empty). Throws on anything
 * else, so a mistyped limit is never read as "no limit". */
export function limitNumber(raw: unknown): number | null {
  const typed = String(raw ?? "").trim();
  if (!typed) return null;
  // Digits, with thousands written in groups of three if at all ("1,000", "1.000", "1 000"); never a fraction.
  const text = /^\d{1,3}([,. '’_]\d{3})+$/.test(typed) ? typed.replace(/\D/g, "") : typed;
  if (!/^\d{1,7}$/.test(text) || Number(text) < 1 || Number(text) > LIMIT_MAX) throw new Error(`A limit is a whole number of Metrics from 1 to ${LIMIT_MAX.toLocaleString("en-US")}, or empty for none.`);
  return Number(text);
}

/** A limit's name from a setting or a form: plain text of at most LABEL_MAX characters, or null for none. */
export function limitLabel(raw: unknown): string | null {
  // Plain text: control characters and markup characters out, spaces made one.
  const text = String(raw ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length > LABEL_MAX) throw new Error(`A limit's name has at most ${LABEL_MAX} characters.`);
  return text;
}

/** The Installation's default from the settings in effect (ZIFFR_DEFAULT_METRICS_LIMIT, ZIFFR_DEFAULT_LIMIT_LABEL),
 * each read on its own: a name that cannot be read only loses the name. A limit that cannot be read (such as "10k" in
 * the server's environment; the page checks what it saves) cannot be guessed, so no default applies, and `problem`
 * says so on the Installation Settings page and in the server log. */
export function defaultLimitFrom(settings: Settings): { metrics: number | null; label: string | null; problem: string | null } {
  let metrics: number | null = null;
  let problem: string | null = null;
  try {
    metrics = limitNumber(settings.ZIFFR_DEFAULT_METRICS_LIMIT);
  } catch {
    problem = "ZIFFR_DEFAULT_METRICS_LIMIT cannot be read: write a whole number of Metrics. Until then no default limit applies.";
  }
  let label: string | null = null;
  try {
    label = limitLabel(settings.ZIFFR_DEFAULT_LIMIT_LABEL);
  } catch {
    label = limitLabel(String(settings.ZIFFR_DEFAULT_LIMIT_LABEL).slice(0, LABEL_MAX));
  }
  return { metrics, label, problem };
}

// The default as last written to the database, so it is written only when it changed.
let synced: { key: string; at: number } | null = null;
const SYNC_EVERY_MS = 5_000;

/** Writes the Installation's default limit to the database when it changed, so the trigger checks the one in effect
 * (the setting may live in the server's environment, which the database cannot read). Called before a Metric is
 * made or brought back, and when the setting is saved. */
export async function syncDefaultLimit(force = false): Promise<void> {
  const d = defaultLimitFrom(await settingsInEffect());
  if (d.problem && !synced) console.error(`Workspace Limits: ${d.problem}`);
  const key = JSON.stringify([d.metrics, d.label]);
  if (!force && synced && synced.key === key && Date.now() - synced.at < SYNC_EVERY_MS) return;
  const { data } = await db().from("installation_limit_default").select("metrics, label").eq("only_row", true).maybeSingle();
  if (!data || data.metrics !== d.metrics || data.label !== d.label) {
    const { error } = await db().from("installation_limit_default").upsert({ only_row: true, metrics: d.metrics, label: d.label, updated_at: new Date().toISOString() });
    if (error) throw new Error("The Installation's default limit could not be saved.");
  }
  synced = { key, at: Date.now() };
}

/** A Workspace's limit in effect: its own, else the Installation's default; null for none (and in the demo). */
export async function limitOf(workspaceId: string): Promise<WorkspaceLimit | null> {
  await syncDefaultLimit();
  const { data, error } = await db().rpc("workspace_limit_of", { p_workspace: workspaceId });
  if (error) throw new Error("The Workspace's limit could not be read.");
  const row = (data as { metrics: number | null; label: string | null }[] | null)?.[0];
  return row && row.metrics !== null ? { metrics: row.metrics, label: row.label } : null;
}

/** How many Metrics a Workspace holds for its limit: every one that is not archived, Derived Metrics included. */
export async function metricCount(workspaceId: string): Promise<number> {
  const { data, error } = await db().rpc("workspace_metric_count", { p_workspace: workspaceId });
  if (error) throw new Error("The Workspace's Metrics could not be counted.");
  return Number(data ?? 0);
}

/** The refusal for a database error with the limit's code, built from the count and limit as they are now; null for
 * any other error. */
export async function limitReachedFrom(error: { code?: string } | null | undefined, workspaceId: string): Promise<LimitReached | null> {
  if (error?.code !== LIMIT_CODE) return null;
  const [count, limit] = await Promise.all([metricCount(workspaceId), limitOf(workspaceId)]);
  return new LimitReached(count, limit ?? { metrics: count, label: null });
}

/** The refusal a new Metric would meet now in the actor's Workspace, in the limit's words, or null when one may be
 * made: for the New Metric form, so it says so before anyone fills it in. Only for someone who may create Metrics: it
 * holds the Workspace's count of Metrics, which a Guest does not need. */
export async function newMetricRefusal(actor: Actor): Promise<string | null> {
  if (!can(actor, "create")) return null;
  const limit = await limitOf(actor.workspaceId);
  if (!limit) return null;
  const [count, { data }] = await Promise.all([
    metricCount(actor.workspaceId),
    db().from("workspaces").select("over_limit_since").eq("id", actor.workspaceId).maybeSingle(),
  ]);
  const since = data?.over_limit_since ? new Date(data.over_limit_since as string) : null;
  return limitRule(count, limit.metrics, since, new Date()) === "refuse" ? limitRefusal(count, limit) : null;
}
