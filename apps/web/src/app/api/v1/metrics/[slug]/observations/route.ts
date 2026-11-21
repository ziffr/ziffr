// /api/v1/metrics/{slug}/observations (spec 0002). GET: a Metric's values for a range of periods, with Breakdowns, a
// page at a time (scope metrics:read). POST: submits a value (scope values:submit) through the same core path as a
// form or Slack, with an optional Idempotency-Key and at most 1,000 values a day per key.
import { metricRoute } from "@/lib/api-metric-route";
import { admitValues, once, submitObservation, VALUES_PER_DAY, type StoredAnswer } from "@ziffr/core/api-submissions";
import { listObservations } from "@ziffr/core/api";
import { errorBody, json, jsonBody, query, toCursor } from "@/lib/api";
import { idempotencyKey, idempotentAnswer } from "@/lib/api-idempotency";
import { ObservationList, observationsQuery, SubmissionAnswer, SubmitObservation } from "../../../schemas";

/** Lists one visible Metric's values, oldest first. */
export const GET = metricRoute("metrics:read", async (actor, req, slug) => {
  const { limit, cursor, from, to } = observationsQuery.parse(query(req));
  const page = await listObservations(actor, slug, { from, to, after: cursor, limit });
  return json(ObservationList.parse({ items: page.items, next: toCursor(page.next) }));
});

/** Submits a value for one Metric. 201 when taken, 422 when locked or refused by a rule, 409 for a reused
 * Idempotency-Key with another body. */
export const POST = metricRoute("values:submit", async (actor, req, slug) => {
  const idem = idempotencyKey(req);
  const input = SubmitObservation.parse(await jsonBody(req));
  let retryAfter: number | null = null;
  const answer = async (): Promise<StoredAnswer> => {
    const admitted = await admitValues(actor);
    if (!admitted.ok) {
      retryAfter = admitted.retryAfter;
      return { ...errorBody("rate_limited", `This key submitted ${VALUES_PER_DAY} values in the last 24 hours; try again in ${admitted.retryAfter} seconds.`), keep: false };
    }
    const r = await submitObservation(actor, slug, input);
    if (r.ok) return { status: 201, body: SubmissionAnswer.parse({ status: r.status, period: r.period, value: r.value, detail: r.detail }) };
    if (r.reason === "locked") return errorBody("locked", r.detail);
    if (r.reason === "period_condensed") return errorBody("period_condensed", r.detail);
    if (r.reason === "not_submitter") return errorBody("forbidden", r.detail);
    return errorBody("unprocessable", r.detail);
  };
  const result = idem === null ? await answer() : await once(actor, idem, { slug, ...input }, answer);
  // Counted towards the daily limit only when a value was taken now, not when a stored answer is replayed.
  return idempotentAnswer(result, "submission", retryAfter, "status" in result && result.status === 201 ? { "x-ziffr-submitted": "1" } : {});
});
