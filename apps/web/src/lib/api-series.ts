// The two series of a Metric over the API (ticket #211; GLOSSARY: Target Series, Projection): GET lists one (scope
// metrics:read, for a Metric the key's creator sees), POST sets or removes 1 to 500 of its periods (scope
// metrics:edit, as the key's creator, only when they own the Metric or are its Editor). Both routes are the same but
// for the kind, so they are written once here.
import { Forbidden } from "@ziffr/core/actor";
import { listSeriesWithKey, MetricChangeRefused, setSeriesWithKey, type SeriesKind } from "@ziffr/core/api-metrics";
import { apiError, json, jsonBody, keyRoute } from "@/lib/api";
import { SeriesAnswer, SeriesList, SetSeries, slugParam } from "@/app/api/v1/schemas";

type Ctx = { params: Promise<{ slug: string }> };

/** The GET and POST handlers for one kind of series. */
export function seriesRoutes(kind: SeriesKind) {
  /** Every period of the series that has a value, oldest first: periods and values only. */
  const GET = keyRoute("metrics:read", async (actor, _req, ctx: Ctx) => {
    const slug = slugParam.parse((await ctx.params).slug);
    return json(SeriesList.parse({ items: await listSeriesWithKey(actor, slug, kind) }));
  });

  /** Sets or removes periods. 200 with how many; 403 when the creator may not change the Metric; 422 when an item is
   * refused (not a period's first day, or a Projection for a period that is over), and then nothing was written. */
  const POST = keyRoute("metrics:edit", async (actor, req, ctx: Ctx) => {
    const slug = slugParam.parse((await ctx.params).slug);
    const { items } = SetSeries.parse(await jsonBody(req));
    try {
      return json(SeriesAnswer.parse(await setSeriesWithKey(actor, slug, kind, items)));
    } catch (e) {
      // Without a reason: missing or hidden (404). With one: seen, but not theirs to change.
      if (e instanceof Forbidden) { if (e.message === "Forbidden") throw e; return apiError("forbidden", e.message); }
      if (e instanceof MetricChangeRefused) return apiError("unprocessable", e.message);
      throw e;
    }
  });

  return { GET, POST };
}
