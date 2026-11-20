// POST /api/v1/actions/{id}/approval (ticket #427; GLOSSARY: Approval, Approver): the key's creator approves a value
// waiting for them, or sends it back. Scope values:approve, which only a program's Access Key can hold: this route is not
// among the ones the remote MCP Server reaches (api-in-process.ts), so an assistant's token cannot get here, and the
// core refuses any key that is not a program's. Nobody approves their own value; only the Approver the Workflow names.
import { decideApprovalWithKey } from "@ziffr/core/api-actions";
import { json, jsonBody, keyRoute } from "@/lib/api";
import { ApiAction, ApprovalDecision } from "../../../schemas";
import { actionId, refusedAs422, sourceOfCall, type ActionCtx } from "../../actions";

/** Approves or sends back; the Action as it is now. */
export const POST = keyRoute("values:approve", async (actor, req, ctx: ActionCtx) => {
  const id = await actionId(ctx);
  const input = ApprovalDecision.parse(await jsonBody(req));
  return refusedAs422(async () => json(ApiAction.parse(await decideApprovalWithKey(actor, id, input, sourceOfCall()))));
});
