// /api/v1/dashboards (spec 0014). GET: the dashboards the key's creator sees, a page at a time (scope
// dashboards:read). POST: creates an empty dashboard owned by the key's creator, with an optional introduction (scope
// dashboards:write), with an optional Idempotency-Key and at most 50 a day per key.
import { createDashboardWithKey, listDashboardsWithKey } from "@ziffr/core/api-dashboards";
import { json, jsonBody, keyRoute, query, toCursor } from "@/lib/api";
import { build, withUrl } from "@/lib/api-build";
import { ApiDashboard, CreateDashboard, DashboardList, dashboardsQuery } from "../schemas";

/** Lists the visible dashboards. */
export const GET = keyRoute("dashboards:read", async (actor, req) => {
  const { limit, cursor } = dashboardsQuery.parse(query(req));
  const page = await listDashboardsWithKey(actor, { after: cursor, limit });
  return json(DashboardList.parse({ items: page.items.map((d) => withUrl(req, d)), next: toCursor(page.next) }));
});

/** Creates a dashboard. 201 with it; 403 when the creator's role may not create. */
export const POST = keyRoute("dashboards:write", async (actor, req) => {
  const input = CreateDashboard.parse(await jsonBody(req));
  return build(actor, req, "create", "create_dashboard", input, async () => ({ status: 201, body: ApiDashboard.parse(withUrl(req, await createDashboardWithKey(actor, input))) }));
});
