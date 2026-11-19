// POST /api/v1/metrics/{slug}/archive and /restore (spec 0029; GLOSSARY: Archived Metric): one handler for both, as
// the key's creator (scope metrics:write), when they see the Metric and are an Owner, an Admin or its Metric Owner.
import { setMetricArchivedWithKey } from "@ziffr/core/api-metrics";
import { RestoreRefused } from "@ziffr/core/archived-metrics";
import { Forbidden } from "@ziffr/core/actor";
import { apiError, json, keyRoute } from "@/lib/api";
import { MetricDescription, slugParam } from "@/app/api/v1/schemas";

type Ctx = { params: Promise<{ slug: string }> };

/** Archives the Metric, or with `archived` false brings it back. 200 with the Metric as it is now; 403 when the
 * creator sees it but may not; 422 when bringing it back is refused. Doing it twice changes nothing. */
export const archiveRoute = (archived: boolean) => keyRoute("metrics:write", async (actor, _req, ctx: Ctx) => {
  const slug = slugParam.parse((await ctx.params).slug);
  try {
    return json(MetricDescription.parse(await setMetricArchivedWithKey(actor, slug, archived)));
  } catch (e) {
    // Without a reason: missing or hidden (404). With one: seen, but not theirs to archive or bring back.
    if (e instanceof Forbidden) { if (e.message === "Forbidden") throw e; return apiError("forbidden", e.message); }
    if (e instanceof RestoreRefused) return apiError("unprocessable", e.message);
    throw e;
  }
});
