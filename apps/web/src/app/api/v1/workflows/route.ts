// GET /api/v1/workflows (ticket #410; GLOSSARY: Workflow): the workspace's Workflows, id and name only, to name the one
// to ask about with GET /workflows/{id}/period-status. Scope metrics:read.
import { listWorkflowNames } from "@ziffr/core/period-timeline";
import { json, keyRoute, query, toCursor } from "@/lib/api";
import { pageQuery, WorkflowList } from "../schemas";

/** Lists the workspace's Workflows. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { limit, cursor } = pageQuery.parse(query(req));
  const page = await listWorkflowNames(actor, { after: cursor, limit });
  return json(WorkflowList.parse({ items: page.items, next: toCursor(page.next) }));
});
