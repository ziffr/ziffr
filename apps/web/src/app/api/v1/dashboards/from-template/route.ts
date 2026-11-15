// POST /api/v1/dashboards/from-template (spec 0014): a whole dashboard from a Dashboard Template in one call, with
// Metric slugs per Slot (scope dashboards:write). Counts as one of the key's 50 new dashboards a day.
import { createDashboardFromTemplateWithKey } from "@ziffr/core/api-dashboards";
import { jsonBody, keyRoute } from "@/lib/api";
import { build, withUrl } from "@/lib/api-build";
import { ApiDashboard, CreateFromTemplate } from "../../schemas";

/** Makes a dashboard from a template. 201 with it; 422 when a Slot is not filled or names a Metric not seen. */
export const POST = keyRoute("dashboards:write", async (actor, req) => {
  const input = CreateFromTemplate.parse(await jsonBody(req));
  return build(actor, req, "create", "create_dashboard_from_template", input, async () => ({ status: 201, body: ApiDashboard.parse(withUrl(req, await createDashboardFromTemplateWithKey(actor, input))) }));
});
