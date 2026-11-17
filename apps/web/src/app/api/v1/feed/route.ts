// /api/v1/feed (spec 0012, GLOSSARY: Feed, Feed Key). GET: the Feed's name, the workspace's year start and the Metrics it submits to, with the
// periods that already have a value, a page at a time. Only for Feed Keys; it holds no value of any Metric.
import { feedOverview } from "@ziffr/core/feeds";
import { feedRoute, json, query, toCursor } from "@/lib/api";
import { FeedOverview, pageQuery } from "../schemas";

/** The Feed and its Metrics. */
export const GET = feedRoute(async (feed, req) => {
  const { limit, cursor } = pageQuery.parse(query(req));
  const o = await feedOverview(feed, { after: cursor, limit });
  return json(FeedOverview.parse({ name: o.name, year_start_month: o.yearStartMonth, metrics: { items: o.metrics.items, next: toCursor(o.metrics.next) } }));
});
