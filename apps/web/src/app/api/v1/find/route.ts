// GET /api/v1/find (ticket #412; GLOSSARY: Metric, Period Record): finds Metrics by name and "Metric + period" for words
// such as "churn march 2026". Scope metrics:read. The core chooses only among Metrics the key's creator sees; this only
// shapes the answer and returns slug, name and period, nothing else of a Metric.
import { findMetrics } from "@ziffr/core/search";
import { json, keyRoute, query } from "@/lib/api";
import { FindAnswer, findQuery } from "../schemas";

/** Metrics and Metric + period matching the words. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { q } = findQuery.parse(query(req));
  return json(FindAnswer.parse({ items: await findMetrics(actor, q) }));
});
