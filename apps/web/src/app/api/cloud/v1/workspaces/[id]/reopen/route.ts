// POST /api/cloud/v1/workspaces/{id}/reopen (spec 0040, #679): Ziffr Cloud undoes a cancellation during the grace days. Only a
// Workspace closed by a cancellation opens again (409 otherwise); its keys and Slack, Telegram and Calendar connections
// stay revoked. The body is empty or `{}`; nothing in it is read. Answers the Workspace as GET does.
import { reopenCloudWorkspace } from "@ziffr/core/cloud-api";
import { cloudJson, cloudRoute } from "@/lib/cloud-route";

type Ctx = { params: Promise<{ id: string }> };

/** Opens one cancelled Workspace again. */
export const POST = cloudRoute(async (caller, _body, _req, ctx: Ctx) => cloudJson(await reopenCloudWorkspace(caller, (await ctx.params).id)));
