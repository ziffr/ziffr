// /api/v1/metrics/{slug}/thread?period= (ticket #407; GLOSSARY: Thread): GET reads the Threads on one period of a Metric
// (scope metrics:read), only those the key's creator may read, through the same core rules as the app.
import { metricRoute } from "@/lib/api-metric-route";
import { getThreads } from "@ziffr/core/api";
import { json, query } from "@/lib/api";
import { ThreadAnswer, threadQuery } from "../../../schemas";

/** The readable Threads on one period of one visible Metric, with authors, times and words. */
export const GET = metricRoute("metrics:read", async (actor, req, slug) => {
  const { period } = threadQuery.parse(query(req));
  return json(ThreadAnswer.parse(await getThreads(actor, slug, period)));
});
