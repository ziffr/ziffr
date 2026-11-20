// What every route under /api/v1/actions/{id} shares (ticket #427): the id from the path, the source a change is
// recorded with (the remote MCP Server in this process, or the API), and a refusal in Ziffr's words as 422.
import { ActionRefused, type ActionSource } from "@ziffr/core/api-actions";
import { errorBody, json } from "@/lib/api";
import { calledFromMcp } from "@/lib/mcp-context";
import { idParam } from "../schemas";

/** The context Next.js hands a route under /actions/[id]. */
export type ActionCtx = { params: Promise<{ id: string }> };

/** The Action's id from the path, validated. */
export async function actionId(ctx: ActionCtx): Promise<number> {
  return idParam.parse((await ctx.params).id);
}

/** Where a change comes from, for the Webhook event: "mcp" for a call the remote MCP Server makes, else "api". */
export const sourceOfCall = (): ActionSource => (calledFromMcp() ? { type: "mcp" } : { type: "api" });

/** Runs a change; a refusal in words (not yours, done already) answers 422 with them, anything else passes on. */
export async function refusedAs422(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (!(e instanceof ActionRefused)) throw e;
    const { status, body } = errorBody("unprocessable", e.message);
    return json(body, status);
  }
}
