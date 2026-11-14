// GET /api/v1/metrics/{slug} (spec 0002): one Metric's description. Scope metrics:read. A Metric the key's creator
// may not see, of another workspace, or missing answers 404 alike (the core's Forbidden).
import { getMetric } from "@ziffr/core/api";
import { json, keyRoute, slugParam } from "@/lib/api";
import { MetricDescription } from "../../schemas";

type Ctx = { params: Promise<{ slug: string }> };

/** Describes one visible Metric. */
export const GET = keyRoute("metrics:read", async (actor, _req, ctx: Ctx) => {
  const slug = slugParam.parse((await ctx.params).slug);
  return json(MetricDescription.parse(await getMetric(actor, slug)));
});
