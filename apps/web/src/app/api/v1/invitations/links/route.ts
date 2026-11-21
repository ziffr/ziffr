// POST /api/v1/invitations/links (ticket #434): an invite link for Members or Guests, good for 7 days. Scope people:write,
// only a program's own Access Key. Anyone with the link joins: keep it as you would a password.
import { inviteLinkWithKey } from "@ziffr/core/api-sharing";
import { json, jsonBody, sensitiveRoute } from "@/lib/api";
import { CreateInviteLink, InviteLink } from "../../schemas";

/** Makes a link; 201 with it, shown this once. */
export const POST = sensitiveRoute("people:write", async (actor, req) => {
  const { role } = CreateInviteLink.parse(await jsonBody(req));
  return json(InviteLink.parse(await inviteLinkWithKey(actor, role)), 201);
});
