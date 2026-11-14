// GET /api/v1/metrics (spec 0002): the Metrics the key's creator sees, a page at a time. Scope metrics:read.
import { listMetrics } from "@ziffr/core/api";
import { json, keyRoute, pageQuery, query, toCursor } from "@/lib/api";
import { MetricList } from "../schemas";

/** Lists the visible Metrics. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { limit, cursor } = pageQuery.parse(query(req));
  const page = await listMetrics(actor, { after: cursor, limit });
  return json(MetricList.parse({ items: page.items, next: toCursor(page.next) }));
});
