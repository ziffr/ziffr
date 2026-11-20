// GET /api/cloud/v1/limits?after=<id>&limit=<n> (spec 0029, ticket #267): the Workspaces whose limit Ziffr Cloud set,
// by id, a page at a time, for reconciling with its payments. The same numbers as one Workspace's, nothing more.
import { z } from "zod";
import { cloudLimits } from "@ziffr/core/cloud-api";
import { cloudJson, cloudRoute } from "@/lib/cloud-route";

const Query = z.object({
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

/** One page of Workspaces with a limit Ziffr Cloud set. */
export const GET = cloudRoute(async (caller, _body, req) => {
  const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return cloudJson(await cloudLimits(caller, { after: q.after ?? null, limit: q.limit }));
});
