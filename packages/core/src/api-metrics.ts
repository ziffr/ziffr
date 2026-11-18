// Metrics created by programs (spec 0003; GLOSSARY: Metric, Access Key). A key with metrics:write creates a Metric
// as its creator, through the web form's createMetric, so every field is checked the same way and the creator's role
// must still allow creating. Nothing else of a Metric is writable by a key: not sharing, not Submitters beyond its
// creator, not a formula or a Catalog entry.
import { assertScope, Forbidden, type Actor, type KeyActor } from "./actor";
import { toApi, type ApiMetric } from "./api";
import { db } from "./db";
import { createMetric, deleteMetric, metricEffects, TooManyMetrics, type MetricEffects } from "./metrics";
import { normalizeMetric } from "./metric-row";
import { DEMO_WORKSPACE_ID } from "./team";
import { getMetrics } from "./workspace-data";
import { visibleMetricIds } from "./access";
import type { Metric } from "./types";

/** Metrics one key may create in any 24 hours; the database enforces it (migration 20261116090000). */
export const METRICS_PER_DAY = 50;

export { TooManyMetrics };

/** What a program sends to create a Metric: the description as programs read it, and whether the key's creator
 * submits its values (they get a Token, so a key that may submit values can do so at once). */
export type ApiMetricInput = {
  name: string;
  description?: string;
  unit?: string;
  unit_position?: string;
  format?: string;
  decimals?: number;
  period?: string;
  submission_rule?: string;
  polarity?: string;
  aggregation?: string;
  target_min?: number | null;
  target_max?: number | null;
  attainment_method?: string | null;
  submit?: boolean;
};

/** Creates a Metric owned by the key's creator (scope metrics:write) and returns it as programs see it. Refused when
 * the creator's current role may not create (Guests), and in the demo. */
export async function createMetricWithKey(actor: Actor | KeyActor, input: ApiMetricInput, effects: MetricEffects = metricEffects): Promise<ApiMetric> {
  assertScope(actor, "metrics:write");
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo has no Access Keys.");
  // The key's creator, with their role as it is now (actorForKey reads it on every call).
  const creator: Actor = { personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role };
  const keyName = actor.key ? await nameOf(actor) : null;
  const { id } = await createMetric(creator, {
    name: String(input?.name ?? ""),
    description: input.description, unit: input.unit, unitPosition: input.unit_position, format: input.format, decimals: input.decimals, period: input.period,
    submissionRule: input.submission_rule, polarity: input.polarity, aggregation: input.aggregation,
    targetMin: input.target_min, targetMax: input.target_max, attainmentMethod: input.attainment_method,
    // As in the form: every way Ziffr knows, the API among them, so the key can submit to it at once.
    sources: ["web_form", "mail", "slack", "telegram", "api"],
    submitters: input.submit ? [actor.personId] : [],
  }, {
    ...effects,
    recordCreated: (metricId, by) => effects.recordCreated(metricId, by, keyName ? `Created through the API (key “${keyName}”)` : "Created through the API"),
  }, { accessKeyId: actor.key ? Number(actor.key.id) : undefined });
  const { data } = await db().from("metrics").select("*").eq("id", id).eq("workspace_id", actor.workspaceId).single();
  return toApi(normalizeMetric(data) as Metric);
}

/** Deletes a Metric for a key with metrics:write, as its creator: only when they own it, with its exact name to
 * confirm, and never while anything uses it, exactly as in the app. The Audit Log names the key. */
export async function deleteMetricWithKey(actor: Actor | KeyActor, slug: string, confirmName: string): Promise<{ values: number }> {
  assertScope(actor, "metrics:write");
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo has no Access Keys.");
  const metrics = await getMetrics(actor.workspaceId);
  const m = metrics.find((x) => x.slug === String(slug));
  // A Metric that is missing, of another workspace or hidden from the creator is refused without a reason (404).
  if (!m || !(await visibleMetricIds(actor.workspaceId, actor.personId, metrics)).has(m.id)) throw new Forbidden();
  const creator: Actor = { personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role };
  return deleteMetric(creator, m.id as number, String(confirmName ?? ""), { accessKeyId: actor.key ? Number(actor.key.id) : undefined });
}

async function nameOf(actor: KeyActor): Promise<string | null> {
  const { data } = await db().from("access_keys").select("name").eq("id", Number(actor.key.id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/** Whether the key may create another Metric now; if not, the seconds until it may. Counted from the Metrics the key
 * created in the last 24 hours. This answers early and says when to retry; the database's trigger is what holds the
 * limit, also for parallel calls (createMetricWithKey then throws TooManyMetrics). */
export async function admitMetric(actor: KeyActor): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await db().from("metrics").select("created_at").eq("workspace_id", actor.workspaceId).eq("access_key_id", Number(actor.key.id))
    .gt("created_at", since).order("created_at", { ascending: false }).limit(METRICS_PER_DAY);
  const rows = data ?? [];
  if (rows.length < METRICS_PER_DAY) return { ok: true };
  // The oldest of the newest 50 leaves the window first.
  const oldest = new Date(rows[rows.length - 1].created_at).getTime();
  return { ok: false, retryAfter: Math.max(1, Math.ceil((oldest + 86_400_000 - Date.now()) / 1000)) };
}
