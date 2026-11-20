// Installation Usage (spec 0031; GLOSSARY: Usage, Usage Key, Installation Admin): the Installation's figures per day,
// as counts, for an Installation Admin on the Installation Settings page and for a program with a Usage Key. Never a
// Workspace's id or name, a Metric's or dashboard's name, a person or a value: the daily rollup writes counts only,
// and what is returned is rebuilt from a fixed list of keys, so a later change to a table cannot widen it.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Forbidden } from "./actor";
import { db } from "./db";
import { assertInstallationAdmin, recordInstallationEvent, type InstallationActor } from "./installation-admins";
import { settingsInEffect } from "./settings-in-effect";

/** The fewest Workspaces a figure that names a group may rest on, and the fewest an Installation needs for any split
 * (spec 0031, small numbers). One constant, so a stricter number is one change. */
export const USAGE_MIN_WORKSPACES = 3;

/** Calls a Usage Key may make in an hour. */
export const USAGE_KEY_CALLS_PER_HOUR = 60;

/** The most days one answer holds. */
export const USAGE_MAX_DAYS = 400;

/** Figures that are shown only where at least USAGE_MIN_WORKSPACES Workspaces are behind them: they split by kind or
 * Source. Below that the totals stay and these are named in `withheld`. */
export const USAGE_SPLIT_FIGURES = ["workspaces_trial", "workspaces_free", "workspaces_paid", "values_web", "values_email", "values_slack", "values_telegram", "values_api", "values_feed", "values_mcp", "values_derived"] as const;

/** Figures that are totals: shown whatever the number of Workspaces. */
export const USAGE_TOTAL_FIGURES = [
  "workspaces", "workspaces_created", "trials_started", "trials_kept", "trials_closed", "sizes_booked", "workspaces_deleted",
  "people", "signups", "people_active_7d", "workspaces_active_7d",
  "metrics", "metrics_archived", "dashboards", "widgets", "decks", "workflows", "feeds", "packs_installed",
  "api_calls", "feed_calls", "mcp_calls", "emails_sent", "views_dashboards", "views_decks", "views_metrics",
] as const;

/** Every key a day may hold besides `day`, `packs` and `withheld`. */
export const USAGE_FIGURES: readonly string[] = [...USAGE_TOTAL_FIGURES, ...USAGE_SPLIT_FIGURES];

/** One day as returned: `day`, whole numbers by the keys above, `packs` ({ id, installs } of Marketplace Packs held by
 * at least 3 Workspaces) and `withheld` (the names of figures left out). */
export type UsageDay = { day: string; packs?: { id: string; installs: number }[]; withheld: string[] } & { [figure: string]: number | string | string[] | { id: string; installs: number }[] | undefined };

/** The Actor of a Usage Key: no person and no Workspace. Only authenticateUsageKey makes one. */
declare const usageKeyBrand: unique symbol;
/** What an authenticated Usage Key is: marks the call as the key's, with no person and no Workspace. */
export type UsageKeyActor = { readonly usageKey: true; readonly [usageKeyBrand]: true };

const hashOf = (secret: string) => createHash("sha256").update(secret).digest("hex");
const DAY = 86_400_000;
const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const utcToday = () => new Date().toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The Usage Key as an Installation Admin sees it: when it was made and last used, never the secret or its hash. */
export type UsageKeyInfo = { id: number; prefix: string; createdAt: string; lastUsedAt: string | null; createdByName: string | null };

/** The live Usage Key, if there is one. Installation Admins only. */
export async function usageKeyInfo(actor: InstallationActor): Promise<UsageKeyInfo | null> {
  await assertInstallationAdmin(actor);
  const { data } = await db().from("usage_keys").select("id, prefix, created_at, last_used_at, created_by").is("revoked_at", null).maybeSingle();
  if (!data) return null;
  const { data: by } = data.created_by ? await db().from("profiles").select("name").eq("id", data.created_by).maybeSingle() : { data: null };
  return { id: Number(data.id), prefix: String(data.prefix), createdAt: String(data.created_at), lastUsedAt: (data.last_used_at as string | null) ?? null, createdByName: (by?.name as string | undefined) ?? null };
}

/** Makes a Usage Key, replacing the live one (which stops working at once), and returns the secret this once. Only its
 * hash is stored. Installation Admins only; the Installation's audit says it was made, never the secret. */
export async function makeUsageKey(actor: InstallationActor): Promise<{ secret: string }> {
  await assertInstallationAdmin(actor);
  const prefix = randomBytes(3).toString("hex");
  const secret = `zu_${prefix}_${randomBytes(32).toString("base64url")}`;
  // One live key at a time: the database revokes the old one and inserts the new one together, under a lock.
  const { error } = await db().rpc("make_usage_key", { p_prefix: prefix, p_hash: hashOf(secret), p_by: String(actor.personId).slice(0, 64) });
  if (error) throw new Error("The Usage Key could not be made. Try again.");
  await recordInstallationEvent(actor.personId, "usage_key.made", null);
  return { secret };
}

/** Revokes the live Usage Key. Installation Admins only. */
export async function revokeUsageKey(actor: InstallationActor): Promise<void> {
  await assertInstallationAdmin(actor);
  const { data, error } = await db().from("usage_keys").update({ revoked_at: new Date().toISOString() }).is("revoked_at", null).select("id");
  if (error) throw new Error("The Usage Key could not be revoked. Try again.");
  if (data?.length) await recordInstallationEvent(actor.personId, "usage_key.revoked", null);
}

/** Who a presented secret is: the Usage Key's Actor, "limited" for the live key past its calls this hour, or null for
 * anything else (no key, a wrong one, an Access Key, a Feed Key, the job secret). The hashes are compared in constant
 * time against the one live key. */
export async function authenticateUsageKey(secret: string | null | undefined): Promise<UsageKeyActor | "limited" | null> {
  const given = hashOf(String(secret ?? "").slice(0, 200));
  const { data } = await db().from("usage_keys").select("id, secret_hash").is("revoked_at", null).maybeSingle();
  // Always compared, also when there is no live key, so the answer takes as long either way.
  const wanted = Buffer.from(String(data?.secret_hash ?? "0".repeat(64)), "hex");
  const same = timingSafeEqual(Buffer.from(given, "hex"), wanted) && Boolean(data);
  if (!same || !data) return null;
  const { data: within, error } = await db().rpc("touch_usage_key", { p_id: data.id, p_limit: USAGE_KEY_CALLS_PER_HOUR });
  if (error) throw new Error("The Usage Key could not be checked.");
  return within === true ? ({ usageKey: true } as UsageKeyActor) : "limited";
}

/** A refusal of a range, in words for the caller. */
export class UsageRangeError extends Error {}

/** The days asked for: `from` and `to` as YYYY-MM-DD, `to` clamped to yesterday (the newest day with figures), at most
 * USAGE_MAX_DAYS. Left out: the last 30 days. */
export function usageRange(input: { from?: unknown; to?: unknown }): { from: string; to: string } {
  const yesterday = addDays(utcToday(), -1);
  if ((input.to != null && !isDay(input.to)) || (input.from != null && !isDay(input.from))) throw new UsageRangeError("Days are written YYYY-MM-DD.");
  const to = input.to != null && (input.to as string) < yesterday ? (input.to as string) : yesterday;
  const from = input.from != null ? (input.from as string) : addDays(to, -29);
  if (from > to) throw new UsageRangeError("`from` is after `to`, or the range is only today or later.");
  if ((Date.parse(to) - Date.parse(from)) / DAY + 1 > USAGE_MAX_DAYS) throw new UsageRangeError(`At most ${USAGE_MAX_DAYS} days at a time.`);
  return { from, to };
}

/** Shapes one stored day: only listed keys and only whole numbers, and the small-number rule applied here, never by the
 * caller. Pure, so it is tested without a database. */
export function usageDayView(day: string, stored: unknown): UsageDay {
  const f = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const whole = (k: string) => (typeof f[k] === "number" && Number.isSafeInteger(f[k]) && (f[k] as number) >= 0 ? (f[k] as number) : null);
  const workspaces = whole("workspaces");
  const small = workspaces === null || workspaces < USAGE_MIN_WORKSPACES;
  const out: UsageDay = { day, withheld: [] };
  for (const k of USAGE_TOTAL_FIGURES) { const n = whole(k); if (n !== null) out[k] = n; }
  // A figure that names a group is shown only where at least 3 Workspaces are in the group. The three kinds of Workspace
  // go together (one left out would be the total less the other two); a Source's figure rests on the number of
  // Workspaces that recorded a value by it that day, which the rollup keeps beside it and which is never returned.
  const kinds = ["workspaces_trial", "workspaces_free", "workspaces_paid"];
  const kindsOk = !small && kinds.every((k) => whole(k) === 0 || (whole(k) ?? 0) >= USAGE_MIN_WORKSPACES);
  for (const k of USAGE_SPLIT_FIGURES) {
    const n = whole(k);
    if (n === null) continue;
    const behind = kinds.includes(k) ? (kindsOk ? USAGE_MIN_WORKSPACES : 0) : n === 0 ? USAGE_MIN_WORKSPACES : whole(`${k}_ws`) ?? 0;
    if (small || behind < USAGE_MIN_WORKSPACES) out.withheld.push(k); else out[k] = n;
  }
  // Marketplace Packs: each only with at least 3 Workspaces behind it (the rollup keeps only those; checked again).
  const packs = Array.isArray(f.packs) ? f.packs : [];
  const shown = small ? [] : packs
    .filter((p): p is { id: string; installs: number } => Boolean(p) && typeof (p as { id?: unknown }).id === "string" && /^[a-z0-9][a-z0-9._-]{1,99}$/i.test((p as { id: string }).id) && Number.isSafeInteger((p as { installs?: unknown }).installs) && (p as { installs: number }).installs >= USAGE_MIN_WORKSPACES)
    .map((p) => ({ id: p.id, installs: p.installs }));
  if (!small && "packs" in f) out.packs = shown;
  const total = whole("packs_installed");
  if (total !== null && total > shown.reduce((s, p) => s + p.installs, 0)) out.withheld.push("packs");
  return out;
}

/** The days in the range from the rollup, oldest first. For an Installation Admin or a Usage Key; reads only
 * installation_usage_daily, never a Workspace's tables. */
export async function installationUsage(actor: InstallationActor | UsageKeyActor, input: { from?: unknown; to?: unknown } = {}): Promise<UsageDay[]> {
  if ("personId" in actor) await assertInstallationAdmin(actor);
  else if ((actor as { usageKey?: unknown }).usageKey !== true) throw new Forbidden();
  const { from, to } = usageRange(input);
  const { data, error } = await db().from("installation_usage_daily").select("day, figures").gte("day", from).lte("day", to).order("day", { ascending: true }).limit(USAGE_MAX_DAYS);
  if (error) throw new Error("The figures could not be read.");
  return (data ?? []).map((r) => usageDayView(String(r.day), r.figures));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Workspace left out of every figure (ZIFFR_USAGE_EXCLUDE_WORKSPACE), or null. A value that is not an id is
 * ignored and said in the log. */
export async function usageExcludedWorkspace(): Promise<string | null> {
  const raw = (await settingsInEffect()).ZIFFR_USAGE_EXCLUDE_WORKSPACE?.trim();
  if (!raw) return null;
  if (!UUID.test(raw)) { console.error("Usage: ZIFFR_USAGE_EXCLUDE_WORKSPACE is not a Workspace id; nothing is left out."); return null; }
  return raw.toLowerCase();
}

/** Most days one run fills in. */
const MAX_FILL = 30;

/** The daily rollup (a job): writes yesterday's figures, and fills the days since the last stored one with the figures
 * that can be rebuilt (events; states only for yesterday). Prunes nothing else. Takes no actor: only the job secret
 * reaches it. Answers counts. */
export async function usageRollupJob(): Promise<{ days: number }> {
  const yesterday = addDays(utcToday(), -1);
  const { data: last } = await db().from("installation_usage_daily").select("day").order("day", { ascending: false }).limit(1).maybeSingle();
  const first = last?.day ? addDays(String(last.day), 1) : yesterday;
  const start = first < addDays(yesterday, -(MAX_FILL - 1)) ? addDays(yesterday, -(MAX_FILL - 1)) : first;
  const exclude = await usageExcludedWorkspace();
  let days = 0;
  for (let day = start; day <= yesterday; day = addDays(day, 1)) {
    const { data, error } = await db().rpc("usage_rollup_day", { p_day: day, p_exclude: exclude, p_states: day === yesterday });
    if (error) throw new Error("The day's figures could not be counted.");
    const { error: writeError } = await db().from("installation_usage_daily").upsert({ day, figures: data });
    if (writeError) throw new Error("The day's figures could not be stored.");
    days++;
  }
  return { days };
}
