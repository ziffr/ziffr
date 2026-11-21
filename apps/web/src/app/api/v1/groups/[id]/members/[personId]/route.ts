// DELETE /api/v1/groups/{id}/members/{personId} (ticket #434, GLOSSARY: Group): takes a member out of a Group. Scope
// groups:write, only a program's own Access Key.
import { setGroupMemberWithKey } from "@ziffr/core/api-sharing";
import { json, sensitiveRoute } from "@/lib/api";
import { GroupMemberChanged, pathId, personIdParam } from "../../../../schemas";

type Ctx = { params: Promise<{ id: string; personId: string }> };

/** Takes a member out. */
export const DELETE = sensitiveRoute("groups:write", async (actor, _req, ctx: Ctx) => {
  const p = await ctx.params;
  return json(GroupMemberChanged.parse(await setGroupMemberWithKey(actor, pathId.parse(p.id), personIdParam.parse(p.personId), false)));
});
