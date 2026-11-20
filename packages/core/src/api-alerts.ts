// Alerts for programs and assistants (GLOSSARY: Alert, Access Key; spec 0032, ticket #376). A key with metrics:read
// lists its creator's own Alerts; one with alerts:write makes, changes and removes them. A key acts only for the person
// who made it, through the very functions the web app uses (alerts.ts), so it sees only Metrics its creator sees, holds
// at most what the creator may hold, and can never reach another person's Alert: not an Owner's, not a teammate's.
// Everything a person must be able to read stays in words they can act on; a Metric the creator cannot see is answered
// like one that does not exist (Forbidden, so the API says 404), and the key's own Alerts of a Metric it lost sight of
// are not listed.
import { assertScope, Forbidden, type Actor, type KeyActor } from "./actor";
import { visibleMetricIds } from "./access";
import type { AlertCondition } from "./alert-rules";
import { AlertRefused, createAlert, deleteAlert, listMyAlerts, updateAlert, type AlertChange, type AlertDelivery, type MyAlert } from "./alerts";
import { getMetrics } from "./workspace-data";

/** An Alert as a program sees it: its Metric by slug, never anyone else's data (an Alert holds no value itself). */
export type ApiAlert = {
  id: number;
  metric: { slug: string; name: string };
  condition: AlertCondition;
  delivery: AlertDelivery;
  include_unapproved: boolean;
  paused_by_person: boolean;
  paused: MyAlert["paused"];
  state: MyAlert["state"];
  fired_at: string | null;
  created_at: string;
};

const asApi = (a: MyAlert): ApiAlert => ({ id: a.id, metric: { slug: a.metric.slug, name: a.metric.name }, condition: a.condition, delivery: a.delivery, include_unapproved: a.includeUnapproved, paused_by_person: a.pausedByPerson, paused: a.paused, state: a.state, fired_at: a.firedAt, created_at: a.createdAt });

/** What a key must hold to change Alerts: Manage alerts, and Read metrics, since a change answers the Alert with its Metric's name and state. */
function assertWriting(actor: KeyActor): void {
  assertScope(actor, "alerts:write");
  assertScope(actor, "metrics:read");
}

/** The key's creator: Alerts are always theirs, whatever the key. */
const creatorOf = (actor: KeyActor): Actor => ({ personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role });

export { AlertRefused };

/** The Metric's id for a slug the creator sees; any other slug is "not found", the same whether it exists or not. */
async function metricIdOf(actor: Actor, slug: unknown): Promise<number> {
  const metrics = await getMetrics(actor.workspaceId);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  const m = metrics.find((x) => x.slug === slug);
  if (!m || !seen.has(m.id)) throw new Forbidden("That Metric was not found.");
  return m.id;
}

/** The key's creator's own Alerts they can still see, newest first; of one Metric when `metric` (a slug) is given
 * (scope metrics:read). A slug the creator cannot see lists nothing. */
export async function listAlertsWithKey(actor: KeyActor, filter: { metric?: string } = {}): Promise<ApiAlert[]> {
  assertScope(actor, "metrics:read");
  const creator = creatorOf(actor);
  let metricId: number | undefined;
  if (filter.metric !== undefined) {
    try { metricId = await metricIdOf(creator, filter.metric); } catch { return []; }
  }
  return (await listMyAlerts(creator, metricId)).map(asApi);
}

/** Makes an Alert for the key's creator on a Metric they see (scope alerts:write); the core checks the condition and
 * the limits. Returns it as it is stored. */
export async function createAlertWithKey(actor: KeyActor, input: { metric: string; condition: AlertCondition; delivery?: AlertDelivery; include_unapproved?: boolean }): Promise<ApiAlert> {
  assertWriting(actor);
  const creator = creatorOf(actor);
  const metricId = await metricIdOf(creator, input.metric);
  const id = await createAlert(creator, { metricId, condition: input.condition, delivery: input.delivery, includeUnapproved: input.include_unapproved });
  return one(creator, id);
}

/** Changes one of the creator's own Alerts (scope alerts:write): its condition, way of delivery, option or pause. An
 * Alert of anyone else, or one that is not there, is "not found". */
export async function updateAlertWithKey(actor: KeyActor, id: number, change: { condition?: AlertCondition; delivery?: AlertDelivery; include_unapproved?: boolean; paused?: boolean }): Promise<ApiAlert> {
  assertWriting(actor);
  const creator = creatorOf(actor);
  const patch: AlertChange = { condition: change.condition, delivery: change.delivery, includeUnapproved: change.include_unapproved, paused: change.paused };
  await updateAlert(creator, id, patch);
  return one(creator, id);
}

/** Removes one of the creator's own Alerts (scope alerts:write). */
export async function deleteAlertWithKey(actor: KeyActor, id: number): Promise<void> {
  assertWriting(actor);
  await deleteAlert(creatorOf(actor), id);
}

/** One Alert of the creator's as it is now, without a scope check: what the key just changed is answered back. */
async function one(creator: Actor, id: number): Promise<ApiAlert> {
  const a = (await listMyAlerts(creator)).find((x) => x.id === id);
  if (!a) throw new Forbidden("That Alert was not found.");
  return asApi(a);
}
