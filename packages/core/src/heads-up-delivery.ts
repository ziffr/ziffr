// Telling people about Heads-ups by message (GLOSSARY: Heads-up, Delivery, Delivery Preference, Quiet Hours; spec 0041, ticket 14).
// After a Workspace is scanned, each person who switched on Heads-ups by message (and has them shown) is given the strongest ones
// they were not told yet, at most 3 in any 7 days, each once until it has ended and returned. A message goes through the same
// path as an Alert: their Delivery Preference for updates, quiet hours, the Outbox; nothing new.
//
// Security: a person's Heads-ups are `myHeadsUps` (only Metrics they may see, both of a pair; not Not useful, not muted). Their
// sight of every Metric of a Heads-up is asked once more just before the claim and again at the moment the message leaves
// (internal/delivery-send.ts), and a person without it gets nothing: no message, and no trace of one. The text is the Takeaway's
// words about Metrics they see (heads-up-message.ts). Nothing is sent from the demo. A person's counts, timing and choices are
// their own: nothing here reads another person's. Logs hold no names, no ids and no numbers.
import type { Actor, WorkspaceRoleName } from "./actor";
import { visibleMetricIds } from "./access";
import { db } from "./db";
import { deliverHeadsUp } from "./deliveries";
import { headsUpMessage, WEEKLY_CAP } from "./heads-up-message";
import { myHeadsUps, settingsOf } from "./heads-up-state";
import { DEMO_WORKSPACE_ID } from "./team";
import { getMetrics } from "./workspace-data";

/** What one run of the delivery did, in counts: people looked at, messages made, people for whom it failed. */
export type HeadsUpDeliveryResult = { people: number; sent: number; failed: number };

/** The most people one Workspace's run looks at; the rest are reached by the next run (those looked at longest ago go first). */
export const MAX_PEOPLE = 200;

/** Tells one person of their Heads-ups, by message, within their week's cap: the number of messages made. `now` is for tests. Reads
 * and writes only what is this person's in this Workspace. */
export async function deliverHeadsUpsTo(ws: string, personId: string, opts: { now?: Date } = {}): Promise<number> {
  if (ws === DEMO_WORKSPACE_ID) return 0;
  const now = opts.now ?? new Date();
  const { data: member } = await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", personId).maybeSingle();
  // Only a member is told: a Contact or someone who left is not.
  if (!member) return 0;
  const settings = await settingsOf(ws, personId);
  if (!settings.show || !settings.byMessage) return 0;
  const actor: Actor = { personId, workspaceId: ws, role: member.role as WorkspaceRoleName };
  const { items } = await myHeadsUps(actor, { now: now.getTime() });
  // What no longer stands has ended: if it returns, it is said again.
  const { error: endError } = await db().rpc("end_heads_up_told", { p_ws: ws, p_person: personId, p_standing: items.map((h) => h.key), p_now: now.toISOString() });
  if (endError) throw new Error("Heads-ups could not be recorded.");
  if (!items.length) return 0;
  // Sight asked again, now: a message is made only for Heads-ups about Metrics the person sees at this moment.
  const metrics = await getMetrics(ws);
  const seen = await visibleMetricIds(ws, personId, metrics);
  let made = 0;
  for (const h of items) {
    if (!h.metrics.every((id) => seen.has(id) && metrics.some((m) => m.id === id && !m.archived_at))) continue;
    const message = headsUpMessage(h, h.named.map((m) => m.name));
    if (!message) continue;
    const { data: claim, error } = await db().rpc("claim_heads_up_message", { p_ws: ws, p_person: personId, p_key: h.key, p_cap: WEEKLY_CAP, p_now: now.toISOString() });
    if (error) throw new Error("Heads-ups could not be recorded.");
    // The week's messages are used up: the others wait in the app (and for a later run).
    if (claim === "cap") break;
    if (claim !== "send") continue;
    await deliverHeadsUp(ws, { recipientId: personId, subject: message.subject, text: message.text, link: "/analyze#heads-ups", metricIds: h.metrics });
    made++;
  }
  return made;
}

/** Tells everyone in a Workspace who asked for it (the demo has none): the people whose turn it is, at most MAX_PEOPLE, within
 * `budgetMs`. A person for whom it fails is counted and the rest go on. Answers counts only. */
export async function deliverHeadsUps(ws: string, opts: { now?: Date; budgetMs?: number } = {}): Promise<HeadsUpDeliveryResult> {
  const result: HeadsUpDeliveryResult = { people: 0, sent: 0, failed: 0 };
  if (ws === DEMO_WORKSPACE_ID) return result;
  const { data: asked, error } = await db().from("heads_up_settings").select("person_id").eq("workspace_id", ws).eq("show", true).eq("by_message", true)
    .order("checked_at", { ascending: true, nullsFirst: true }).order("person_id").limit(MAX_PEOPLE);
  if (error) throw new Error("Heads-ups could not be read.");
  const started = Date.now();
  for (const { person_id } of asked ?? []) {
    if (Date.now() - started > (opts.budgetMs ?? Infinity)) break;
    result.people++;
    try {
      result.sent += await deliverHeadsUpsTo(ws, person_id as string, { now: opts.now });
    } catch {
      // The words stay out of the log: a person's or a Metric's name may be in a database error.
      console.error("Heads-ups: a person's messages failed");
      result.failed++;
    }
    // Looked at either way, so one person for whom it keeps failing does not stand in front of everyone else.
    await db().from("heads_up_settings").update({ checked_at: (opts.now ?? new Date()).toISOString() }).eq("workspace_id", ws).eq("person_id", person_id);
  }
  return result;
}
