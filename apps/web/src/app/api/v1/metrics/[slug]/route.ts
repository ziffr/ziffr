// GET /api/v1/metrics/{slug} (spec 0002): one Metric's description. Scope metrics:read. A Metric the key's creator
// may not see, of another workspace, or missing answers 404 alike (the core's Forbidden).
// DELETE /api/v1/metrics/{slug}?confirm=<its exact name>: deletes it as the key's creator (scope metrics:write), only
// when they own it and nothing uses it, as in the app; the Audit Log names the key.
import { getMetric } from "@ziffr/core/api";
import { deleteMetricWithKey } from "@ziffr/core/api-metrics";
import { MetricKept } from "@ziffr/core/metrics";
import { Forbidden } from "@ziffr/core/actor";
import { ApiError, apiError, json, keyRoute } from "@/lib/api";
import { DeletedMetric, deleteMetricQuery, MetricDescription, slugParam } from "../../schemas";

type Ctx = { params: Promise<{ slug: string }> };

/** Describes one visible Metric. */
export const GET = keyRoute("metrics:read", async (actor, _req, ctx: Ctx) => {
  const slug = slugParam.parse((await ctx.params).slug);
  return json(MetricDescription.parse(await getMetric(actor, slug)));
});

/** Deletes one Metric the key's creator owns. The name must be repeated in `confirm`, so a wrong slug deletes nothing. */
export const DELETE = keyRoute("metrics:write", async (actor, req, ctx: Ctx) => {
  const slug = slugParam.parse((await ctx.params).slug);
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
