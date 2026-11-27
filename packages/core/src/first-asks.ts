// The first requests of a new Metric (GLOSSARY: Prompt, Submitter, Outbox), read from the Deliveries the core made, so
// the sentence on the new Metric's page matches the Outbox. Only the Metric's owner, whose requests they are, may read it.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { CONNECTORS, type ConnectorId } from "./connectors/index";
import { editableMetric } from "./metrics";
import { openNames } from "./sealed-columns";
import { firstAsksMessage, type FirstAsk } from "./asked-message";
import { stoppedWays } from "./prompt-reach";
import type { PromptWay } from "./prompt-route";

/** What the first requests of a Metric did, as the sentence to show, or null for someone who may not change the Metric. */
export async function firstAsksFor(actor: Actor, metricId: number): Promise<string | null> {
  try {
    // Only the owner, who made the Metric and sent its first requests: an Editor sees no one else's Deliveries.
    if ((await editableMetric(actor, metricId)).owner_id !== actor.personId) return null;
  } catch (e) {
    if (e instanceof Forbidden) return null;
    throw e;
  }
  const [{ data: tokens }, { data: prompts }] = await Promise.all([
    db().from("tokens").select("submitter_id").eq("metric_id", metricId).eq("workspace_id", actor.workspaceId).is("stands_in_for", null),
    db().from("prompts").select("id").eq("metric_id", metricId),
  ]);
  const submitters = new Set((tokens ?? []).map((t) => t.submitter_id as string)).size;
  const ids = (prompts ?? []).map((p) => p.id as number);
  const { data: rows } = ids.length
    ? await db().from("deliveries").select("recipient_id, connector, mail_state").eq("workspace_id", actor.workspaceId).eq("kind", "prompt").eq("sender_id", actor.personId).in("prompt_id", ids).order("id")
    : { data: [] };
  // One line per person: their first request that may leave, else the first by a way they stopped, which says so.
  const stops = await stoppedWays(actor.workspaceId, [...new Set((rows ?? []).map((r) => r.recipient_id as string))]);
  const first = new Map<string, { connector: ConnectorId; state: FirstAsk["state"]; stopped: boolean }>();
  for (const r of rows ?? []) {
    const stopped = r.mail_state !== "sent" && Boolean(stops.get(r.recipient_id)?.has(r.connector as PromptWay));
    const state = (stopped ? "failed" : r.mail_state === "sending" ? "queued" : ["sent", "queued", "outbox", "failed"].includes(r.mail_state) ? r.mail_state : "outbox") as FirstAsk["state"];
    const had = first.get(r.recipient_id);
    if (!had || (had.stopped && !stopped)) first.set(r.recipient_id, { connector: r.connector as ConnectorId, state, stopped });
  }
  const people = first.size ? await openNames(actor.workspaceId, (await db().from("profiles").select("id, name").in("id", [...first.keys()])).data) : [];
  const asked = [...first].map(([personId, f]) => ({ personId, name: String(people.find((p) => p.id === personId)?.name ?? "Someone"), connector: f.connector, label: CONNECTORS[f.connector].label, state: f.state, stopped: f.stopped }));
  return firstAsksMessage({ submitters, asked });
}
