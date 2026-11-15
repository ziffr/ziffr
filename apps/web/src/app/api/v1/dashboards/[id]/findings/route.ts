// POST /api/v1/dashboards/{id}/findings (spec 0014; spec 0013): adds a Finding about one Metric below everything on a
// dashboard, full width, with its words (scope dashboards:write). What a program writes is a draft for the dashboard's
// owner to finish.
import { addFindingWithKey } from "@ziffr/core/api-dashboards";
import { jsonBody, keyRoute } from "@/lib/api";
import { build } from "@/lib/api-build";
import { AddFinding, ApiWidget, idParam } from "../../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Adds a Finding. 201 with it. */
export const POST = keyRoute("dashboards:write", async (actor, req, ctx: Ctx) => {
  const id = idParam.parse((await ctx.params).id);
  const input = AddFinding.parse(await jsonBody(req));
  return build(actor, req, "change", "add_finding", input, async () => ({ status: 201, body: ApiWidget.parse(await addFindingWithKey(actor, id, input)) }));
});
