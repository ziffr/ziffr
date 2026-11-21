// POST /api/v1/invitations/{id}/resend (ticket #434): emails an open invitation again; the core allows three sends, a
// minute apart. Scope people:write, only a program's own Access Key.
import { resendInvitationWithKey } from "@ziffr/core/api-sharing";
import { json, sensitiveRoute } from "@/lib/api";
import { pathId, Resent } from "../../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Emails it again. */
export const POST = sensitiveRoute("people:write", async (actor, _req, ctx: Ctx) => {
  const id = pathId.parse((await ctx.params).id);
  return json(Resent.parse(await resendInvitationWithKey(actor, id)));
});
