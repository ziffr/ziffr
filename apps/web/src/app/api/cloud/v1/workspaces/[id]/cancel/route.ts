// POST /api/cloud/v1/workspaces/{id}/cancel (spec 0040, #679): Ziffr Cloud tells that the Workspace's Size was cancelled or
// its payment failed for good. The Workspace closes as an ended trial does and is deleted after the grace days, with the
// Workspace Export offered to its Owner. 409 for a trial, the demo or a Workspace whose Size Ziffr Cloud did not set. The body is empty or `{}`; nothing in it is read. Answers the Workspace as GET does.
import { cancelCloudWorkspace } from "@ziffr/core/cloud-api";
import { cloudJson, cloudRoute } from "@/lib/cloud-route";

type Ctx = { params: Promise<{ id: string }> };

/** Closes one Workspace whose Size was cancelled. */
export const POST = cloudRoute(async (caller, _body, _req, ctx: Ctx) => cloudJson(await cancelCloudWorkspace(caller, (await ctx.params).id)));
