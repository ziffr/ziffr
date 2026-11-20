// PATCH /api/v1/actions/{id} (ticket #427; GLOSSARY: Action): the key's creator closes or reopens an Action they asked
// (scope actions:write). An Action they may not read, or one of another Workspace, is 404.
import { setStatusWithKey } from "@ziffr/core/api-actions";
import { json, jsonBody, keyRoute } from "@/lib/api";
import { ApiAction, ChangeAction } from "../../schemas";
import { actionId, refusedAs422, sourceOfCall, type ActionCtx } from "../actions";

/** Closes or reopens. */
export const PATCH = keyRoute("actions:write", async (actor, req, ctx: ActionCtx) => {
  const id = await actionId(ctx);
  const { status } = ChangeAction.parse(await jsonBody(req));
  return refusedAs422(async () => json(ApiAction.parse(await setStatusWithKey(actor, id, status, sourceOfCall()))));
});
