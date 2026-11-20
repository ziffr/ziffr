// POST /api/v1/actions/{id}/done (ticket #427; GLOSSARY: Task): the key's creator marks their own open Task done (scope
// actions:write). Never an Approval or a Self-check: those have their own endpoints.
import { markDoneWithKey } from "@ziffr/core/api-actions";
import { json, keyRoute } from "@/lib/api";
import { ApiAction } from "../../../schemas";
import { actionId, refusedAs422, sourceOfCall, type ActionCtx } from "../../actions";

/** Marks it done; the Action as it is now. */
export const POST = keyRoute("actions:write", async (actor, _req, ctx: ActionCtx) => {
  const id = await actionId(ctx);
  return refusedAs422(async () => json(ApiAction.parse(await markDoneWithKey(actor, id, sourceOfCall()))));
});
