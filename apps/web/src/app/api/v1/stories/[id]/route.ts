// PATCH /api/v1/stories/{id} (spec 0014): changes a story's title or introduction (scope dashboards:write). Read a
// story with GET /dashboards/{id}.
import { updateStoryWithKey } from "@ziffr/core/api-dashboards";
import { jsonBody, keyRoute } from "@/lib/api";
import { build, withUrl } from "@/lib/api-build";
import { ApiDashboard, idParam, UpdateStory } from "../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Changes a story's words. */
export const PATCH = keyRoute("dashboards:write", async (actor, req, ctx: Ctx) => {
  const id = idParam.parse((await ctx.params).id);
  const input = UpdateStory.parse(await jsonBody(req));
  return build(actor, req, "change", "update_story", input, async () => ({ status: 200, body: ApiDashboard.parse(withUrl(req, await updateStoryWithKey(actor, id, input))) }));
});
