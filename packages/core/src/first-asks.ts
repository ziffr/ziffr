// The first requests of a new Metric (GLOSSARY: Prompt, Submitter, Outbox), read from the Deliveries the core made, so
// the sentence on the new Metric's page matches the Outbox. Only the Metric's owner, whose requests they are, may read it.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { CONNECTORS, type ConnectorId } from "./connectors/index";
import { editableMetric } from "./metrics";
import { openNames } from "./sealed-columns";
import { firstAsksMessage, type FirstAsk } from "./asked-message";
import { combinedListing } from "./internal/combined-delivery";

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
  // Their own requests, whether each went alone or with others (GLOSSARY: Combined Prompt).
  const own = () => db().from("deliveries").select("id, recipient_id, connector, mail_state").eq("workspace_id", actor.workspaceId).eq("kind", "prompt").eq("sender_id", actor.personId).order("id");
  const listed = (await combinedListing(actor.workspaceId, ids)).map((l) => l.deliveryId);
  const [alone, together] = await Promise.all([ids.length ? own().in("prompt_id", ids) : null, listed.length ? own().in("id", listed) : null]);
  const rows = [...(alone?.data ?? []), ...(together?.data ?? [])].sort((a, b) => (a.id as number) - (b.id as number));
  // One line per person: their first request.
  const first = new Map<string, { connector: ConnectorId; state: FirstAsk["state"] }>();
  for (const r of rows) {
    const state = (r.mail_state === "sending" ? "queued" : ["sent", "queued", "outbox", "failed"].includes(r.mail_state) ? r.mail_state : "outbox") as FirstAsk["state"];
    if (!first.has(r.recipient_id)) first.set(r.recipient_id, { connector: r.connector as ConnectorId, state });
  }
  const people = first.size ? await openNames(actor.workspaceId, (await db().from("profiles").select("id, name").in("id", [...first.keys()])).data) : [];
  const asked = [...first].map(([personId, f]) => ({ personId, name: String(people.find((p) => p.id === personId)?.name ?? "Someone"), connector: f.connector, label: CONNECTORS[f.connector].label, state: f.state }));
  return firstAsksMessage({ submitters, asked });
}
