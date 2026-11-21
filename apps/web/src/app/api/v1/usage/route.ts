// GET /api/v1/usage (ticket #370, spec 0031; GLOSSARY: Usage, Access Key): the key's own Workspace's Usage figures as
// counts, for a program's key with the scope usage:read whose creator is an Owner or Admin. Not reachable from the MCP
// Server: an assistant is never given the scope. The core decides who may read and what is left out.
import { UsageLimit, UsageRangeError, workspaceUsageFigures } from "@ziffr/core/api-usage";
import { Forbidden } from "@ziffr/core/actor";
import { apiError, errorBody, json, keyRoute, query } from "@/lib/api";
import { usageQuery, WorkspaceUsageResponse } from "../schemas";

/** The days of figures in the range, and the state as of now. */
export const GET = keyRoute("usage:read", async (actor, req) => {
  const range = usageQuery.safeParse(query(req));
  if (!range.success) return apiError("invalid_request", "`from` and `to` are days written YYYY-MM-DD.");
  try {
    return json(WorkspaceUsageResponse.parse(await workspaceUsageFigures(actor, range.data)));
  } catch (e) {
    if (e instanceof UsageRangeError) { const { status, body } = errorBody("invalid_request", e.message); return json(body, status); }
    if (e instanceof UsageLimit) return apiError("rate_limited", e.message, { "retry-after": "3600" });
    if (e instanceof Forbidden) return apiError("forbidden", "Only a program's key whose creator is an Owner or Admin reads usage figures.");
    throw e;
  }
});
