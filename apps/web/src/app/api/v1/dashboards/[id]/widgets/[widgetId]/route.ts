// PATCH and DELETE /api/v1/dashboards/{id}/widgets/{widgetId} (spec 0014): changes a widget's view, Metrics, title or
// allowed settings, or removes it (scope dashboards:write). The dashboard's Versions keep what came before.
import { removeWidgetWithKey, updateWidgetWithKey } from "@ziffr/core/api-dashboards";
import { jsonBody, keyRoute } from "@/lib/api";
import { build } from "@/lib/api-build";
import { ApiWidget, idParam, RemovedWidget, UpdateWidget } from "../../../../schemas";

type Ctx = { params: Promise<{ id: string; widgetId: string }> };

/** Changes a widget. */
export const PATCH = keyRoute("dashboards:write", async (actor, req, ctx: Ctx) => {
  const p = await ctx.params;
  const [id, widgetId] = [idParam.parse(p.id), idParam.parse(p.widgetId)];
  const input = UpdateWidget.parse(await jsonBody(req));
  return build(actor, req, "change", "update_widget", input, async () => ({ status: 200, body: ApiWidget.parse(await updateWidgetWithKey(actor, id, widgetId, input)) }));
});

/** Removes a widget. */
export const DELETE = keyRoute("dashboards:write", async (actor, req, ctx: Ctx) => {
  const p = await ctx.params;
  const [id, widgetId] = [idParam.parse(p.id), idParam.parse(p.widgetId)];
  return build(actor, req, "change", "remove_widget", {}, async () => {
    await removeWidgetWithKey(actor, id, widgetId);
    return { status: 200, body: RemovedWidget.parse({ removed: widgetId }) };
  });
});
