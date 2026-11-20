// /api/v1/metrics. GET (spec 0002): the Metrics the key's creator sees, a page at a time (scope metrics:read); the
// Archived Metrics only with ?archived=true (spec 0029).
// POST (spec 0003): creates a Metric owned by the key's creator (scope metrics:write), with an optional
// Idempotency-Key and at most 50 a day per key; its Sources, and its Submitters with metrics:edit too (ticket #217).
import { Forbidden } from "@ziffr/core/actor";
import { admitMetric, createMetricWithKey, MetricChangeRefused, METRICS_PER_DAY, TooManyMetrics } from "@ziffr/core/api-metrics";
import { once, type StoredAnswer } from "@ziffr/core/api-submissions";
import { listMetrics } from "@ziffr/core/api";
import { errorBody, json, jsonBody, keyRoute, limitErrorBody, query, toCursor } from "@/lib/api";
import { LimitReached } from "@ziffr/core/workspace-limits";
import { idempotencyKey, idempotentAnswer } from "@/lib/api-idempotency";
import { CreateMetric, MetricDescription, MetricList, metricsQuery } from "../schemas";

/** Lists the visible Metrics. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { limit, cursor, archived } = metricsQuery.parse(query(req));
  const page = await listMetrics(actor, { after: cursor, limit, archived });
  return json(MetricList.parse({ items: page.items, next: toCursor(page.next) }));
});

/** Creates a Metric. 201 with the Metric; 403 when the creator's role may not create; 409 for a reused
 * Idempotency-Key with another body. */
export const POST = keyRoute("metrics:write", async (actor, req) => {
  const idem = idempotencyKey(req);
  const input = CreateMetric.parse(await jsonBody(req));
  let retryAfter: number | null = null;
  const limited = (seconds: number): StoredAnswer => {
    retryAfter = seconds;
    return { ...errorBody("rate_limited", `This key created ${METRICS_PER_DAY} Metrics in the last 24 hours; try again in ${seconds} seconds.`), keep: false };
  };
  const answer = async (): Promise<StoredAnswer> => {
    const admitted = await admitMetric(actor);
    if (!admitted.ok) return limited(admitted.retryAfter);
    try {
      return { status: 201, body: MetricDescription.parse(await createMetricWithKey(actor, input)) };
    } catch (e) {
      // Parallel calls that passed the early check meet the database's limit here.
      if (e instanceof TooManyMetrics) {
        const now = await admitMetric(actor);
        return limited(now.ok ? 60 : now.retryAfter);
      }
      // There is no Metric to hide here: a refusal is about the key's creator, so it is said (403), not "not found".
      if (e instanceof Forbidden) return errorBody("forbidden", e.message === "Forbidden" ? "The key's creator may not create Metrics." : e.message);
      // A Source or Submitter refused: checked before the Metric exists, so nothing was created.
      if (e instanceof MetricChangeRefused) return errorBody("unprocessable", e.message);
      // The Workspace Limit (spec 0029): nothing was created; the same words as the app, with the count and limit.
      if (e instanceof LimitReached) return { ...limitErrorBody(e), keep: false };
      throw e;
    }
  };
  // The body that is hashed names the endpoint, so the same key text reused for a submission is a conflict, never a
  // replay of the other endpoint's answer.
  const result = idem === null ? await answer() : await once(actor, idem, { endpoint: "create_metric", ...input }, answer);
  return idempotentAnswer(result, "creation", retryAfter);
});
