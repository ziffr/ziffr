// /api/v1/metrics. GET (spec 0002): the Metrics the key's creator sees, a page at a time (scope metrics:read).
// POST (spec 0003): creates a Metric owned by the key's creator (scope metrics:write), with an optional
// Idempotency-Key and at most 50 a day per key.
import { Forbidden } from "@ziffr/core/actor";
import { admitMetric, createMetricWithKey, METRICS_PER_DAY, TooManyMetrics } from "@ziffr/core/api-metrics";
import { once, type StoredAnswer } from "@ziffr/core/api-submissions";
import { listMetrics } from "@ziffr/core/api";
import { ApiError, errorBody, json, jsonBody, keyRoute, query, toCursor } from "@/lib/api";
import { CreateMetric, IdempotencyKey, MetricDescription, MetricList, pageQuery } from "../schemas";

/** Lists the visible Metrics. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { limit, cursor } = pageQuery.parse(query(req));
  const page = await listMetrics(actor, { after: cursor, limit });
  return json(MetricList.parse({ items: page.items, next: toCursor(page.next) }));
});

/** Creates a Metric. 201 with the Metric; 403 when the creator's role may not create; 409 for a reused
 * Idempotency-Key with another body. */
export const POST = keyRoute("metrics:write", async (actor, req) => {
  const idem = req.headers.get("idempotency-key");
  if (idem !== null && !IdempotencyKey.safeParse(idem).success) throw new ApiError("invalid_request", "Idempotency-Key: 1 to 200 visible ASCII characters.");
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
      throw e;
    }
  };
  // The body that is hashed names the endpoint, so the same key text reused for a submission is a conflict, never a
  // replay of the other endpoint's answer.
  const result = idem === null ? await answer() : await once(actor, idem, { endpoint: "create_metric", ...input }, answer);
  if ("conflict" in result) {
    return json(errorBody("conflict", result.conflict === "in_progress" ? "A creation with this Idempotency-Key is still running." : "This Idempotency-Key was used with another body.").body, 409);
  }
  const headers: Record<string, string> = {};
  if (retryAfter !== null) headers["retry-after"] = String(retryAfter);
  if ("replayed" in result && result.replayed) headers["idempotent-replayed"] = "true";
  return json(result.body, result.status, headers);
});
