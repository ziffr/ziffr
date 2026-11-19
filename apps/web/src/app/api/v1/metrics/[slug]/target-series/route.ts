// /api/v1/metrics/{slug}/target-series (ticket #211; GLOSSARY: Target Series): GET lists a Metric's Target Series (scope
// metrics:read), POST sets or removes some of its periods (scope metrics:edit). Written once in lib/api-series.ts.
import { seriesRoutes } from "@/lib/api-series";

const routes = seriesRoutes("target");

/** Lists the Metric's Target Series. */
export const GET = routes.GET;

/** Sets or removes periods of the Metric's Target Series. */
export const POST = routes.POST;
