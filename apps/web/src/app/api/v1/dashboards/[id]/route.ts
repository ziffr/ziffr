// /api/v1/dashboards/{id} (spec 0014; stories folded into dashboards by spec 0013). GET: one dashboard with its
// introduction and widgets, Metrics by slug, without settings or values (scope dashboards:read); one the key's creator
// does not see, of another workspace, or missing is 404. PATCH: its name or introduction (scope dashboards:write).
import { getDashboardWithKey, updateDashboardWithKey } from "@ziffr/core/api-dashboards";
import { json, jsonBody, keyRoute } from "@/lib/api";
import { build, withUrl } from "@/lib/api-build";
import { ApiDashboard, idParam, UpdateDashboard } from "../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Describes one visible dashboard. */
export const GET = keyRoute("dashboards:read", async (actor, req, ctx: Ctx) => {
  const id = idParam.parse((await ctx.params).id);
  return json(ApiDashboard.parse(withUrl(req, await getDashboardWithKey(actor, id))));
});

/** Changes a dashboard's name or introduction. */
export const PATCH = keyRoute("dashboards:write", async (actor, req, ctx: Ctx) => {
  const id = idParam.parse((await ctx.params).id);
  const input = UpdateDashboard.parse(await jsonBody(req));
  return build(actor, req, "change", "update_dashboard", input, async () => ({ status: 200, body: ApiDashboard.parse(withUrl(req, await updateDashboardWithKey(actor, id, input))) }));
});
