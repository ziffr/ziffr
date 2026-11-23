// Workspace Limits (GLOSSARY: Workspace Limit, Size, Archived Metric; spec 0029, ticket #265): the most Metrics a
// Workspace may hold, unlimited unless someone sets it. The rule over the limit lives here and, with the same
// numbers, in the database's trigger metrics_within_limit; a database test runs both on one table of cases.
// The open code knows a Size only as a limit with a name (`label`); prices and payments are Ziffr Cloud's (ADR 0013).
import { can, type Actor } from "./actor";
import { db } from "./db";
import { daysSetting } from "./installation-days";
import { settingsInEffect, settingsInEffectStrict, type Settings } from "./settings-in-effect";

/** Days a Workspace may stay over its limit, within its room, before new Metrics wait, unless the Installation sets
 * otherwise (ZIFFR_LIMIT_GRACE_DAYS; 0 to 90). */
export const GRACE_DAYS = 14;

/** Days that must pass after a grace started before the Workspace may have another (ticket #457), unless the
 * Installation sets otherwise (ZIFFR_LIMIT_GRACE_EVERY_DAYS; 0 to 730). */
export const GRACE_EVERY_DAYS = 90;

/** The days over the limit and the days between two such periods. */
export type Grace = { days: number; every: number };

/** The grace in effect for these settings. */
export const graceFrom = (settings: Settings): Grace => ({ days: daysSetting("ZIFFR_LIMIT_GRACE_DAYS", settings), every: daysSetting("ZIFFR_LIMIT_GRACE_EVERY_DAYS", settings) });

/** The grace in effect now. */
export const graceNow = async (): Promise<Grace> => graceFrom(await settingsInEffect());

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
 * counted; `since` when it went over its limit, or null; `lastGrace` when its last grace started, or null: going over
 * again within GRACE_EVERY_DAYS of it gets no new grace. Pure; the trigger answers the same. */
export function limitRule(count: number, limit: number | null, since: Date | null, now: Date, lastGrace: Date | null = null, grace: Grace = { days: GRACE_DAYS, every: GRACE_EVERY_DAYS }): "allow" | "over" | "refuse" {
  if (limit === null || count + 1 <= limit) return "allow";
  if (count + 1 > roomOf(limit)) return "refuse";
  if (grace.days <= 0) return "refuse";
  if (since && now.getTime() >= since.getTime() + grace.days * 86_400_000) return "refuse";
  // Archived down during the grace and over again before its 14 days ran out: what is left of that grace, not a new one.
  if (!since && lastGrace && now.getTime() < lastGrace.getTime() + grace.days * 86_400_000) return "over";
  if (!since && lastGrace && now.getTime() < lastGrace.getTime() + grace.every * 86_400_000) return "refuse";
  return "over";
}

/** How many Metrics may be made one after another now, up to `cap`: the rule above applied to each in turn, the first
 * one over the limit starting the grace as the database does. `limit` null is no limit. Pure; Set up from a Pack tells
 * a person this before it asks. */
export function metricsAllowed(count: number, limit: number | null, since: Date | null, now: Date, lastGrace: Date | null, grace: Grace, cap: number): number {
  if (limit === null) return cap;
  let at = since;
  for (let i = 0; i < cap; i++) {
    const rule = limitRule(count + i, limit, at, now, lastGrace, grace);
    if (rule === "refuse") return i;
    if (rule === "over" && !at) at = lastGrace && now.getTime() < lastGrace.getTime() + grace.days * 86_400_000 ? lastGrace : now;
  }
  return cap;
}

/** When the Workspace may next have a grace: GRACE_EVERY_DAYS after its last one started, or null when it may have one
 * now (never had one, or the 90 days have passed). */
export function nextGraceOn(lastGrace: Date | null, now: Date, every = GRACE_EVERY_DAYS): Date | null {
  if (!lastGrace) return null;
  const on = new Date(lastGrace.getTime() + every * 86_400_000);
  return on.getTime() > now.getTime() ? on : null;
}

/** A Workspace's limit: how many Metrics, and the name to show (a Size, such as "Small"); null when it has none. */
export type WorkspaceLimit = { metrics: number; label: string | null };

/** The words for a Metric refused by the limit, the same in the app, the API and the MCP Server. The date of the next
 * grace is in them for everyone who is refused: it says only when a rule lets go, nothing about the Workspace's data. */
export function limitRefusal(count: number, limit: WorkspaceLimit, graceOn: Date | null = null, graceDays = GRACE_DAYS): string {
  const holds = `This Workspace holds ${count.toLocaleString("en-US")} Metric${count === 1 ? "" : "s"}`;
  const what = limit.label ? `its Size ${limit.label}` : "its limit";
  const allows = count > limit.metrics ? `, more than the ${limit.metrics.toLocaleString("en-US")} ${what} allows` : `, as many as ${what} allows`;
  const change = limit.label ? "ask an Owner to change the Size" : "ask whoever runs this Ziffr to raise the limit";
  const grace = graceOn ? ` The Workspace had its ${graceDays} days over the limit recently; the next ones are possible from ${graceOn.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.` : "";
  return `${holds}${allows}.${grace} Archive a Metric, or ${change}.`;
}

/** Thrown when the limit refuses a new Metric, or bringing an Archived Metric back. Its message is for people; the
 * API also gives the count and the limit. */
export class LimitReached extends Error {
  constructor(readonly count: number, readonly limit: WorkspaceLimit, readonly graceOn: Date | null = null, graceDays = GRACE_DAYS) {
    super(limitRefusal(count, limit, graceOn, graceDays));
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
  // Strict: what the database enforces is never written from a guess. When the stored settings cannot be read, what the
  // database has stays as it is until the next good read.
  let settings: Settings;
  try { settings = await settingsInEffectStrict(); } catch { return; }
  const d = defaultLimitFrom(settings);
  if (d.problem && !synced) console.error(`Workspace Limits: ${d.problem}`);
  const grace = graceFrom(settings);
  const key = JSON.stringify([d.metrics, d.label, grace.days, grace.every]);
  if (!force && synced && synced.key === key && Date.now() - synced.at < SYNC_EVERY_MS) return;
  const { data } = await db().from("installation_limit_default").select("metrics, label, grace_days, grace_every_days").eq("only_row", true).maybeSingle();
  if (!data || data.metrics !== d.metrics || data.label !== d.label || data.grace_days !== grace.days || data.grace_every_days !== grace.every) {
    const { error } = await db().from("installation_limit_default").upsert({ only_row: true, metrics: d.metrics, label: d.label, grace_days: grace.days, grace_every_days: grace.every, updated_at: new Date().toISOString() });
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
  const [count, limit, { data }] = await Promise.all([
    metricCount(workspaceId), limitOf(workspaceId),
    db().from("workspaces").select("over_limit_since, last_grace_started_at").eq("id", workspaceId).maybeSingle(),
  ]);
  // Only a Workspace with no grace running is told when the next one is possible.
  const last = !data?.over_limit_since && data?.last_grace_started_at ? new Date(data.last_grace_started_at as string) : null;
  const grace = await graceNow();
  return new LimitReached(count, limit ?? { metrics: count, label: null }, nextGraceOn(last, new Date(), grace.every), grace.days);
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
    db().from("workspaces").select("over_limit_since, last_grace_started_at").eq("id", actor.workspaceId).maybeSingle(),
  ]);
  const since = data?.over_limit_since ? new Date(data.over_limit_since as string) : null;
  const last = data?.last_grace_started_at ? new Date(data.last_grace_started_at as string) : null;
  const now = new Date();
  return limitRule(count, limit.metrics, since, now, last) === "refuse" ? limitRefusal(count, limit, since ? null : nextGraceOn(last, now)) : null;
}

/** Whether one person may own only one Workspace on the Installation's default limit (ZIFFR_ONE_DEFAULT_PER_PERSON=1,
 * hosted Ziffr's "one Free Workspace per person"); only while a default limit is in effect. */
export async function oneDefaultPerPerson(env: Settings = process.env): Promise<boolean> {
  if (env.ZIFFR_ONE_DEFAULT_PER_PERSON?.trim() !== "1") return false;
  return defaultLimitFrom(await settingsInEffect()).metrics !== null;
}

/** Thrown when a person who already owns a Workspace on the default limit makes another; its message is for people. */
export class DefaultWorkspaceTaken extends Error {
  constructor() {
    super("You already own a Workspace on this Ziffr's default limit. Each person gets one: change its Size for more room, or ask to join another Workspace.");
    this.name = "DefaultWorkspaceTaken";
  }
}

/** Refuses a new Workspace on the default limit to a person who owns one already, where that rule is on. */
export async function assertMayOwnDefault(personId: string): Promise<void> {
  if (!(await oneDefaultPerPerson())) return;
  const { data, error } = await db().rpc("owns_default_workspace", { p_person: personId });
  if (error) throw new Error("The workspace could not be created.");
  if (data === true) throw new DefaultWorkspaceTaken();
}
