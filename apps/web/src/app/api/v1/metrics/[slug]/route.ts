// GET /api/v1/metrics/{slug} (spec 0002): one Metric's description. Scope metrics:read. A Metric the key's creator
// may not see, of another workspace, or missing answers 404 alike (the core's Forbidden).
// DELETE /api/v1/metrics/{slug}?confirm=<its exact name>: deletes it as the key's creator (scope metrics:write), only
// when they own it and nothing uses it, as in the app; the Audit Log names the key.
// PATCH /api/v1/metrics/{slug} (ticket #211; GLOSSARY: Target Range): changes its Polarity, Target Range or Attainment
// method as the key's creator (scope metrics:edit), only when they own it or are its Editor.
import { metricRoute } from "@/lib/api-metric-route";
import { getMetric } from "@ziffr/core/api";
import { deleteMetricWithKey, MetricChangeRefused, updateMetricWithKey } from "@ziffr/core/api-metrics";
import { MetricKept } from "@ziffr/core/metrics";
import { Forbidden } from "@ziffr/core/actor";
import { ApiError, apiError, json, jsonBody } from "@/lib/api";
import { DeletedMetric, deleteMetricQuery, MetricDescription, UpdateMetric } from "../../schemas";

/** Describes one visible Metric. */
export const GET = metricRoute("metrics:read", async (actor, _req, slug) => {
  return json(MetricDescription.parse(await getMetric(actor, slug)));
});

/** Deletes one Metric the key's creator owns. The name must be repeated in `confirm`, so a wrong slug deletes nothing. */
export const DELETE = metricRoute("metrics:write", async (actor, req, slug) => {
  const parsed = deleteMetricQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) throw new ApiError("invalid_request", "Repeat the Metric's exact name in ?confirm= to delete it.");
  const { confirm } = parsed.data;
  try {
    return json(DeletedMetric.parse({ deleted: slug, ...(await deleteMetricWithKey(actor, slug, confirm)) }));
  } catch (e) {
    // Without a reason: missing or hidden, which keyRoute answers 404 like any other. With one: seen but not theirs.
    if (e instanceof Forbidden) { if (e.message === "Forbidden") throw e; return apiError("forbidden", e.message); }
    // In use, or the name does not match: nothing was deleted, and the reason is said. Anything else stays a 500.
    if (e instanceof MetricKept) return apiError("unprocessable", e.message);
    throw e;
  }
});

/** Changes parts of one Metric's description. 200 with the Metric; 403 when the creator sees it but may not change it,
 * or their role may not create; 422 when the change is refused, such as a lower target above the upper one. */
export const PATCH = metricRoute("metrics:edit", async (actor, req, slug) => {
  const patch = UpdateMetric.parse(await jsonBody(req));
  try {
    return json(MetricDescription.parse(await updateMetricWithKey(actor, slug, patch)));
  } catch (e) {
    // Without a reason: missing or hidden (404). With one: seen, but not theirs to change.
    if (e instanceof Forbidden) { if (e.message === "Forbidden") throw e; return apiError("forbidden", e.message); }
    if (e instanceof MetricChangeRefused) return apiError("unprocessable", e.message);
    throw e;
  }
});
