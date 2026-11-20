// POST /api/v1/actions/{id}/self-check (ticket #427; GLOSSARY: Self-check): the key's creator confirms their own value,
// or corrects it (scope values:submit, as it is their own value that is recorded). Only the Self-check that is theirs.
import { selfCheckWithKey } from "@ziffr/core/api-actions";
import { json, jsonBody, keyRoute } from "@/lib/api";
import { ApiAction, SelfCheckDecision } from "../../../schemas";
import { actionId, refusedAs422, sourceOfCall, type ActionCtx } from "../../actions";

/** Confirms or corrects; the Action as it is now. */
export const POST = keyRoute("values:submit", async (actor, req, ctx: ActionCtx) => {
  const id = await actionId(ctx);
  const input = SelfCheckDecision.parse(await jsonBody(req));
  return refusedAs422(async () => json(ApiAction.parse(await selfCheckWithKey(actor, id, input, sourceOfCall()))));
});
