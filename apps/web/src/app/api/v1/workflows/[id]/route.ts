// GET, PATCH and DELETE /api/v1/workflows/{id} (ticket #433; GLOSSARY: Workflow): read, change or delete a Workflow the
// key's creator owns, steps included. Someone else's, one of another workspace, or a missing one is 404. Reading needs
// metrics:read, the rest workflows:write; Approve and Tell steps are changed only with workflows:people.
import { deleteWorkflowWithKey, getWorkflowWithKey, updateWorkflowWithKey } from "@ziffr/core/api-workflows";
import { json, jsonBody, keyRoute } from "@/lib/api";
import { ApiWorkflowDetail, idParam, RemovedWorkflow, UpdateWorkflow } from "../../schemas";
import { refusedAs422 } from "../refusal";

type Ctx = { params: Promise<{ id: string }> };

/** The Workflow with its steps. */
export const GET = keyRoute("metrics:read", async (actor, _req, ctx: Ctx) => {
  return json(ApiWorkflowDetail.parse(await getWorkflowWithKey(actor, idParam.parse((await ctx.params).id))));
});

/** Changes a Workflow. */
export const PATCH = keyRoute("workflows:write", async (actor, req, ctx: Ctx) => {
  const id = idParam.parse((await ctx.params).id);
  const patch = UpdateWorkflow.parse(await jsonBody(req));
  return refusedAs422(async () => json(ApiWorkflowDetail.parse(await updateWorkflowWithKey(actor, id, patch))));
});

/** Deletes a Workflow. */
export const DELETE = keyRoute("workflows:write", async (actor, _req, ctx: Ctx) => {
  const id = idParam.parse((await ctx.params).id);
  return refusedAs422(async () => {
    await deleteWorkflowWithKey(actor, id);
    return json(RemovedWorkflow.parse({ removed: id }));
  });
});
