// /api/v1/workflows (tickets #410, #433; GLOSSARY: Workflow). GET: the workspace's Workflows, id and name only, to name
// the one to ask about with GET /workflows/{id}/period-status (scope metrics:read). POST: makes a Workflow owned by the
// key's creator, steps included (scope workflows:write); who approves needs workflows:people, a program's key only.
import { listWorkflowNames } from "@ziffr/core/period-timeline";
import { createWorkflowWithKey } from "@ziffr/core/api-workflows";
import { json, jsonBody, keyRoute, query, toCursor } from "@/lib/api";
import { ApiWorkflowDetail, CreateWorkflow, pageQuery, WorkflowList } from "../schemas";
import { refusedAs422 } from "./refusal";

/** Lists the workspace's Workflows. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { limit, cursor } = pageQuery.parse(query(req));
  const page = await listWorkflowNames(actor, { after: cursor, limit });
  return json(WorkflowList.parse({ items: page.items, next: toCursor(page.next) }));
});

/** Makes a Workflow. 201 with it; 422 with the words when its steps are refused. */
export const POST = keyRoute("workflows:write", async (actor, req) => {
  const input = CreateWorkflow.parse(await jsonBody(req));
  return refusedAs422(async () => json(ApiWorkflowDetail.parse(await createWorkflowWithKey(actor, input)), 201));
});
