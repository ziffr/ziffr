// /api/v1/invitations (ticket #434, GLOSSARY: Workspace Role). GET: the open invitations, never their tokens. POST: invites
// an address with a role and emails it. Scope people:write, only a program's own Access Key; Owners and Admins only.
import { inviteWithKey, listInvitationsWithKey } from "@ziffr/core/api-sharing";
import { json, jsonBody, sensitiveRoute } from "@/lib/api";
import { ApiInvitation, CreateInvitation, InvitationList } from "../schemas";

/** The open invitations. */
export const GET = sensitiveRoute("people:write", async (actor) => json(InvitationList.parse({ items: await listInvitationsWithKey(actor) })));

/** Invites an address; 201 with the invitation (no token: the link goes to that address only). */
export const POST = sensitiveRoute("people:write", async (actor, req) => {
  const input = CreateInvitation.parse(await jsonBody(req));
  return json(ApiInvitation.parse(await inviteWithKey(actor, input)), 201);
});
