// PATCH /api/v1/stories/{id}/findings/{findingId} (spec 0014): changes a Finding's words (scope dashboards:write). A
// Finding is removed like a widget, with DELETE /dashboards/{id}/widgets/{findingId}.
import { updateFindingWithKey } from "@ziffr/core/api-dashboards";
import { jsonBody, keyRoute } from "@/lib/api";
import { build } from "@/lib/api-build";
import { ApiWidget, idParam, UpdateFinding } from "../../../../schemas";

type Ctx = { params: Promise<{ id: string; findingId: string }> };

/** Changes a Finding's words. */
export const PATCH = keyRoute("dashboards:write", async (actor, req, ctx: Ctx) => {
  const p = await ctx.params;
  const [id, findingId] = [idParam.parse(p.id), idParam.parse(p.findingId)];
  const input = UpdateFinding.parse(await jsonBody(req));
  return build(actor, req, "change", "update_finding", input, async () => ({ status: 200, body: ApiWidget.parse(await updateFindingWithKey(actor, id, findingId, input)) }));
});
