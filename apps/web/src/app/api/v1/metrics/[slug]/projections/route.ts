// /api/v1/metrics/{slug}/projections (ticket #211; GLOSSARY: Projection): GET lists a Metric's Projections (scope
// metrics:read), POST sets or removes some of its periods (scope metrics:edit). Written once in lib/api-series.ts.
import { seriesRoutes } from "@/lib/api-series";

const routes = seriesRoutes("projection");

/** Lists the Metric's Projections. */
export const GET = routes.GET;

/** Sets or removes periods of the Metric's Projections. */
export const POST = routes.POST;
