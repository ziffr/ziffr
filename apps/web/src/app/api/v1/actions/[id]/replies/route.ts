// POST /api/v1/actions/{id}/replies (ticket #427; GLOSSARY: Thread, Correction): the key's creator replies in an
// Action's Thread (scope actions:write), if they are on it. The reply is only words: it never decides a Self-check or an
// Approval, whatever it says.
import { replyWithKey } from "@ziffr/core/api-actions";
import { json, jsonBody, keyRoute } from "@/lib/api";
import { ApiAction, ReplyToAction } from "../../../schemas";
import { actionId, refusedAs422, sourceOfCall, type ActionCtx } from "../../actions";

/** Posts the reply; 201 with the Action as it is now. */
export const POST = keyRoute("actions:write", async (actor, req, ctx: ActionCtx) => {
  const id = await actionId(ctx);
  const input = ReplyToAction.parse(await jsonBody(req));
  return refusedAs422(async () => json(ApiAction.parse(await replyWithKey(actor, id, input, sourceOfCall())), 201));
});
