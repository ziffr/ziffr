// POST /api/v1/join-requests/{id} (ticket #434): approves a request to join (as Member) or declines it. Scope
// people:write, only a program's own Access Key; Owners and Admins only.
import { decideJoinRequestWithKey } from "@ziffr/core/api-sharing";
import { json, jsonBody, sensitiveRoute } from "@/lib/api";
import { DecideJoin, pathId, JoinDecided } from "../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Decides it. */
export const POST = sensitiveRoute("people:write", async (actor, req, ctx: Ctx) => {
  const id = pathId.parse((await ctx.params).id);
  const { approve } = DecideJoin.parse(await jsonBody(req));
  return json(JoinDecided.parse(await decideJoinRequestWithKey(actor, id, approve)));
});
