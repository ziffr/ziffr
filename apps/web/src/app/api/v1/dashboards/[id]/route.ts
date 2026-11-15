// GET /api/v1/dashboards/{id} (spec 0014): one dashboard or story with its widgets, Metrics by slug, without settings
// or values (scope dashboards:read). One the key's creator does not see, of another workspace, or missing is 404.
import { getDashboardWithKey } from "@ziffr/core/api-dashboards";
import { json, keyRoute } from "@/lib/api";
import { withUrl } from "@/lib/api-build";
import { ApiDashboard, idParam } from "../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Describes one visible dashboard or story. */
export const GET = keyRoute("dashboards:read", async (actor, req, ctx: Ctx) => {
  const id = idParam.parse((await ctx.params).id);
  return json(ApiDashboard.parse(withUrl(req, await getDashboardWithKey(actor, id))));
});
