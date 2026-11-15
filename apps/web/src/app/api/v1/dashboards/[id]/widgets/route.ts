// POST /api/v1/dashboards/{id}/widgets (spec 0014): adds a widget, a built-in view with Metrics or a team Widget
// Template with its Slots, in the first free place (scope dashboards:write). Only on a dashboard the key's creator
// may change; any other is 404.
import { addWidgetWithKey } from "@ziffr/core/api-dashboards";
import { jsonBody, keyRoute } from "@/lib/api";
import { build } from "@/lib/api-build";
import { AddWidget, ApiWidget, idParam } from "../../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Adds a widget. 201 with it. */
export const POST = keyRoute("dashboards:write", async (actor, req, ctx: Ctx) => {
  const id = idParam.parse((await ctx.params).id);
  const input = AddWidget.parse(await jsonBody(req));
  return build(actor, req, "change", "add_widget", input, async () => ({ status: 201, body: ApiWidget.parse(await addWidgetWithKey(actor, id, input)) }));
});
