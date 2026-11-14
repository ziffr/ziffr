// GET /api/v1/metrics/{slug}/observations (spec 0002): a Metric's values for a range of periods, with Breakdowns, a
// page at a time. Scope metrics:read.
import { listObservations } from "@ziffr/core/api";
import { json, keyRoute, observationsQuery, query, slugParam, toCursor } from "@/lib/api";
import { ObservationList } from "../../../schemas";

type Ctx = { params: Promise<{ slug: string }> };

/** Lists one visible Metric's values, oldest first. */
export const GET = keyRoute("metrics:read", async (actor, req, ctx: Ctx) => {
  const slug = slugParam.parse((await ctx.params).slug);
  const { limit, cursor, from, to } = observationsQuery.parse(query(req));
  const page = await listObservations(actor, slug, { from, to, after: cursor, limit });
  return json(ObservationList.parse({ items: page.items, next: toCursor(page.next) }));
});
