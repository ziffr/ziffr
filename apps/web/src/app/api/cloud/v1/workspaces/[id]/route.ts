// GET /api/cloud/v1/workspaces/{id} (spec 0029, ticket #267): a Workspace's numbers for Ziffr Cloud: whether it
// exists, its Metric count, limit, label and room, since when it is over, its trial's end and who set its limit.
// Never a name, Metric, value or person.
import { cloudWorkspace } from "@ziffr/core/cloud-api";
import { cloudJson, cloudRoute } from "@/lib/cloud-route";

type Ctx = { params: Promise<{ id: string }> };

/** Reads one Workspace's numbers. */
export const GET = cloudRoute(async (caller, _body, _req, ctx: Ctx) => cloudJson(await cloudWorkspace(caller, (await ctx.params).id)));
