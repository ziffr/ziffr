// POST /api/v1/groups/{id}/members (ticket #434, GLOSSARY: Group): puts a member of the workspace into a Group. Scope
// groups:write, only a program's own Access Key.
import { setGroupMemberWithKey } from "@ziffr/core/api-sharing";
import { json, jsonBody, sensitiveRoute } from "@/lib/api";
import { AddGroupMember, GroupMemberChanged, pathId } from "../../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Adds a member; adding one who is in already changes nothing. */
export const POST = sensitiveRoute("groups:write", async (actor, req, ctx: Ctx) => {
  const id = pathId.parse((await ctx.params).id);
  const { person } = AddGroupMember.parse(await jsonBody(req));
  return json(GroupMemberChanged.parse(await setGroupMemberWithKey(actor, id, person, true)));
});
