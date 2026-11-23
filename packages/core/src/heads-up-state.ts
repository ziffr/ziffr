// What a person chose about Heads-ups, and their list (GLOSSARY: Heads-up, Metric; spec 0041, ticket 14): whether they are shown
// at all, whether they are also told by message, which ones were marked Not useful and which Metrics were muted. All of it is the
// acting person's own: a function takes the Actor first, and there is no person to pass, so nobody can change or read another's.
//
// Security: the list is `listHeadsUps` (only Heads-ups about Metrics the person may see, both of them) with the person's own
// Not useful and mutes taken off, so a choice can only make the list shorter. A key or a Metric id from a browser is untrusted:
// it is checked for its shape and, so that "not found" and "not yours to see" look the same, for sight of every Metric it names.
import { Forbidden, type Actor } from "./actor";
import { refuseInDemo } from "./demo";
import { db } from "./db";
import { listHeadsUpsWith, type HeadsUpMetric } from "./heads-ups";
import type { HeadsUp } from "./methods/heads-up";
import { visibleMetricIds } from "./access";
import { allRows, getMetrics } from "./workspace-data";

/** The most Heads-ups a person can mark Not useful in a Workspace. The database counts it (a trigger, under a lock), so two calls at once cannot pass it. */
export const MAX_NOT_USEFUL = 2000;
/** The most Metrics a person can mute in a Workspace (counted in the database too). */
export const MAX_MUTES = 500;

/** A key as the database stores it: a kind in lower case and one or two Metric ids ("moving-together:12:40"). */
const KEY = /^[a-z][a-z-]{0,39}(:\d{1,10}){1,2}$/;

/** A person's choices: `show` (the list; on unless switched off) and `byMessage` (also told by message; off unless switched on). */
export type HeadsUpSettings = { show: boolean; byMessage: boolean };

/** A Heads-up as the list shows it: the Heads-up and the Metrics it is about, by name, for the person's Mute buttons. */
export type HeadsUpView = HeadsUp & { named: HeadsUpMetric[] };

/** The person's list: `on` is false when they switched Heads-ups off for themselves (then `items` is empty). */
export type MyHeadsUps = { on: boolean; items: HeadsUpView[] };

const own = (actor: Actor) => {
  if (actor.key) throw new Forbidden();
};

/** The ids a key names: what it is about. Null when the key is not a key. */
export function keyMetricIds(key: unknown): number[] | null {
  if (typeof key !== "string" || !KEY.test(key)) return null;
  const ids = key.split(":").slice(1).map(Number);
  return ids.every((id) => Number.isSafeInteger(id) && id > 0) ? ids : null;
}

/** The person's choices in a Workspace (the defaults when they made none), read for a given person: the core's own use, for the job. */
export async function settingsOf(ws: string, personId: string): Promise<HeadsUpSettings> {
  const { data, error } = await db().from("heads_up_settings").select("show, by_message").eq("workspace_id", ws).eq("person_id", personId).maybeSingle();
  // A failed read is an error, never the defaults: a message must not go to someone who switched them off.
  if (error) throw new Error("Your Heads-up settings could not be read.");
  return { show: data ? Boolean(data.show) : true, byMessage: data ? Boolean(data.by_message) : false };
}

/** The actor's own choices about Heads-ups. */
export async function headsUpSettings(actor: Actor): Promise<HeadsUpSettings> {
  own(actor);
  return settingsOf(actor.workspaceId, actor.personId);
}

/** Sets the actor's own choices; a field left out is kept. Refused in the demo. */
export async function setHeadsUpSettings(actor: Actor, input: { show?: unknown; byMessage?: unknown }): Promise<HeadsUpSettings> {
  own(actor);
  refuseInDemo(actor);
  for (const v of [input?.show, input?.byMessage]) if (v !== undefined && typeof v !== "boolean") throw new Error("Pick on or off.");
  // Only a member has choices (the database refuses the row of someone who left, also when this call raced their leaving).
  const { data: member } = await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle();
  if (!member) throw new Forbidden();
  const now = await settingsOf(actor.workspaceId, actor.personId);
  const next = { show: input.show === undefined ? now.show : (input.show as boolean), byMessage: input.byMessage === undefined ? now.byMessage : (input.byMessage as boolean) };
  const { error } = await db().from("heads_up_settings").upsert({ workspace_id: actor.workspaceId, person_id: actor.personId, show: next.show, by_message: next.byMessage, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,person_id" });
  if (error) throw new Error("Your Heads-up settings could not be saved.");
  // Switched off: what they were told no longer stands open (the job only looks at people who ask for messages).
  if (!(next.show && next.byMessage)) {
    const { error: endError } = await db().rpc("end_heads_up_told", { p_ws: actor.workspaceId, p_person: actor.personId, p_standing: [], p_now: new Date().toISOString() });
    if (endError) throw new Error("Your Heads-up settings could not be saved.");
  }
  return next;
}

/** What the person marked Not useful and muted, in a Workspace. */
export async function choicesOf(ws: string, personId: string): Promise<{ notUseful: Set<string>; muted: Set<number> }> {
  const [notUseful, muted] = await Promise.all([
    allRows<{ key: string }>((from, to) => db().from("heads_up_dismissed").select("key").eq("workspace_id", ws).eq("person_id", personId).order("key").range(from, to)),
    allRows<{ metric_id: number }>((from, to) => db().from("heads_up_mutes").select("metric_id").eq("workspace_id", ws).eq("person_id", personId).order("metric_id").range(from, to)),
  ]);
  return { notUseful: new Set(notUseful.map((r) => r.key)), muted: new Set(muted.map((r) => r.metric_id)) };
}

/** The Heads-ups the person is shown (and told): about Metrics they see, none they marked Not useful, none about a Metric they
 * muted. Works for a person's own Actor only. `now` is for tests. */
export async function myHeadsUps(actor: Actor, opts: { now?: number; lane?: "page" | "job" } = {}): Promise<MyHeadsUps> {
  own(actor);
  const settings = await settingsOf(actor.workspaceId, actor.personId);
  if (!settings.show) return { on: false, items: [] };
  const [{ heads, metrics }, { notUseful, muted }] = await Promise.all([listHeadsUpsWith(actor, opts), choicesOf(actor.workspaceId, actor.personId)]);
  const items = heads
    .filter((h) => !notUseful.has(h.key) && !h.metrics.some((id) => muted.has(id)))
    // (Every Metric of a Heads-up is one the person sees: the list is made over those alone.)
    .map((h): HeadsUpView => ({ ...h, named: h.metrics.map((id) => metrics.get(id)!) }));
  return { on: true, items };
}

// The Metric ids of a request, as long as the person sees all of them. The same refusal whether a Metric does not exist or is
// not theirs to see.
async function seenOnly(actor: Actor, ids: readonly number[]): Promise<void> {
  const metrics = await getMetrics(actor.workspaceId);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  if (!ids.every((id) => seen.has(id))) throw new Error("That Heads-up is not there any more.");
}

/** Marks a Heads-up Not useful for the actor: it is not shown or sent to them again. `key` is the Heads-up's key. */
export async function markNotUseful(actor: Actor, key: unknown): Promise<void> {
  own(actor);
  refuseInDemo(actor);
  const ids = keyMetricIds(key);
  if (!ids) throw new Error("That Heads-up is not there any more.");
  await seenOnly(actor, ids);
  const ws = actor.workspaceId;
  const { notUseful } = await choicesOf(ws, actor.personId);
  if (!notUseful.has(key as string) && notUseful.size >= MAX_NOT_USEFUL) throw new Error("You have marked as many Heads-ups Not useful as Ziffr keeps.");
  const { error } = await db().from("heads_up_dismissed").upsert({ workspace_id: ws, person_id: actor.personId, key: key as string }, { onConflict: "workspace_id,person_id,key" });
  if (error?.message.includes("heads_up_choice_cap")) throw new Error("You have marked as many Heads-ups Not useful as Ziffr keeps.");
  if (error) throw new Error("That could not be saved.");
}

/** Mutes a Metric for the actor: no Heads-up about it is shown or sent to them. They must see the Metric. */
export async function muteMetric(actor: Actor, metricId: unknown): Promise<void> {
  own(actor);
  refuseInDemo(actor);
  if (typeof metricId !== "number" || !Number.isSafeInteger(metricId) || metricId <= 0) throw new Error("That Metric is not there.");
  await seenOnly(actor, [metricId]);
  const { muted } = await choicesOf(actor.workspaceId, actor.personId);
  if (!muted.has(metricId) && muted.size >= MAX_MUTES) throw new Error("You have muted as many Metrics as Ziffr keeps.");
  const { error } = await db().from("heads_up_mutes").upsert({ workspace_id: actor.workspaceId, person_id: actor.personId, metric_id: metricId }, { onConflict: "workspace_id,person_id,metric_id" });
  if (error?.message.includes("heads_up_choice_cap")) throw new Error("You have muted as many Metrics as Ziffr keeps.");
  if (error) throw new Error("That could not be saved.");
}

/** Lets the actor hear about a Metric again. Only their own mute is removed; nothing says whether there was one. */
export async function unmuteMetric(actor: Actor, metricId: unknown): Promise<void> {
  own(actor);
  refuseInDemo(actor);
  if (typeof metricId !== "number" || !Number.isSafeInteger(metricId) || metricId <= 0) throw new Error("That Metric is not there.");
  const { error } = await db().from("heads_up_mutes").delete().eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).eq("metric_id", metricId);
  if (error) throw new Error("That could not be saved.");
}

/** The Metrics the actor muted, by name: only those they still see (the name of one they do not would show that it exists). */
export async function mutedMetrics(actor: Actor): Promise<{ id: number; name: string }[]> {
  own(actor);
  const { muted } = await choicesOf(actor.workspaceId, actor.personId);
  if (!muted.size) return [];
  const metrics = await getMetrics(actor.workspaceId);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  return metrics.filter((m) => muted.has(m.id) && seen.has(m.id) && !m.archived_at).map((m) => ({ id: m.id, name: m.name }));
}
