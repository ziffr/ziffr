// DELETE /api/v1/invitations/{id} (ticket #434): revokes an open invitation of the workspace. Scope people:write, only a
// program's own Access Key.
import { revokeInvitationWithKey } from "@ziffr/core/api-sharing";
import { json, sensitiveRoute } from "@/lib/api";
import { pathId, RemovedInvitation } from "../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Revokes the invitation. */
export const DELETE = sensitiveRoute("people:write", async (actor, _req, ctx: Ctx) => {
  const id = pathId.parse((await ctx.params).id);
  return json(RemovedInvitation.parse(await revokeInvitationWithKey(actor, id)));
});
