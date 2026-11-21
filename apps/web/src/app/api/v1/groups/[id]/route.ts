// PATCH and DELETE /api/v1/groups/{id} (ticket #434, GLOSSARY: Group): rename or delete a Group (never Everyone). Scope
// groups:write, only a program's own Access Key; Owners and Admins only, as in the app.
import { deleteGroupWithKey, renameGroupWithKey } from "@ziffr/core/api-sharing";
import { json, jsonBody, sensitiveRoute } from "@/lib/api";
import { ChangedGroup, GroupName, pathId, RemovedGroup } from "../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Renames a Group. */
export const PATCH = sensitiveRoute("groups:write", async (actor, req, ctx: Ctx) => {
  const id = pathId.parse((await ctx.params).id);
  const { name } = GroupName.parse(await jsonBody(req));
  return json(ChangedGroup.parse(await renameGroupWithKey(actor, id, name)));
});

/** Deletes a Group: what was shared with it stops being shared. */
export const DELETE = sensitiveRoute("groups:write", async (actor, _req, ctx: Ctx) => {
  const id = pathId.parse((await ctx.params).id);
  return json(RemovedGroup.parse(await deleteGroupWithKey(actor, id)));
});
