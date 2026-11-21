// Workflow Templates (spec 0030, GLOSSARY: Workflow Template, Workflow, Approval): listing them and starting a
// Workflow from one, with its people picked. Every function takes the Actor first; a Workflow made from a template is
// an independent copy, saved through saveWorkflow, so its Approvers are checked as members like any other. Saving a
// Workflow as a template is in templates.ts.
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { fromWorkflowTemplate } from "./team-templates";
import { saveWorkflow } from "./workflows";
import { assertMembersIn } from "./sharing";
import type { WorkflowTemplate } from "./types";

/** A Workflow Template as a person picks one. It names no person, so all of it may be shown to the team. */
export type WorkflowTemplateSummary = Pick<WorkflowTemplate, "id" | "owner_id" | "name" | "description" | "body">;

/** The team's Workflow Templates, by name. */
export async function listWorkflowTemplates(actor: Pick<Actor, "workspaceId"> & Pick<Actor, "role">): Promise<WorkflowTemplateSummary[]> {
  // A Guest creates nothing, so the team's templates are not theirs to read (rule 3).
  if (actor.role === "guest") return [];
  const { data } = await db().from("team_templates").select("id, owner_id, name, description, body").eq("workspace_id", actor.workspaceId).eq("kind", "workflow").order("name");
  return (data ?? []) as WorkflowTemplateSummary[];
}

/** Makes a Workflow owned by the actor from a Workflow Template, with the Approvers its Approve step asks for picked
 * in order; Guests create nothing. Returns the new Workflow's id. */
export async function createWorkflowFromTemplate(actor: Actor, input: { template: number; name: string; approvers: string[] }): Promise<number> {
  assertCan(actor, "create");
  const { data } = await db().from("team_templates").select("name, body").eq("id", Number(input.template)).eq("workspace_id", actor.workspaceId).eq("kind", "workflow").maybeSingle();
  if (!data) throw new Forbidden();
  const approvers = Array.isArray(input.approvers) ? input.approvers.slice(0, 3).map(String) : [];
  const config = fromWorkflowTemplate((data as Pick<WorkflowTemplate, "body">).body, approvers);
  if (!config) throw new Error("Pick each Approver the template asks for, each person once.");
  // Approvers must be members, not Contacts or anyone outside: saveWorkflow would drop them without a word.
  await assertMembersIn(actor, approvers);
  return saveWorkflow(actor, null, String(input.name ?? "").trim() || String(data.name), config, { message: `Made from the Workflow Template “${data.name}”` });
}
