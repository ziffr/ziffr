// The Workflow Template file format, ziffr.workflow-template/1 (GLOSSARY: Workflow Template): the format lives in @ziffr/pack (MIT), so a creator checks a file exactly as Ziffr does;
// this module adds how a checked file becomes what a Workflow Template stores.
import type { WorkflowTemplateFile } from "@ziffr/pack/workflow-template-file";
import type { WorkflowTemplateBody } from "./types";

export * from "@ziffr/pack/workflow-template-file";

/** A checked Workflow Template file as the body a Workflow Template stores. */
export function workflowTemplateFromFile(t: WorkflowTemplateFile): WorkflowTemplateBody {
  return { dueWorkingDays: t.dueWorkingDays, steps: t.steps.map((s) => (s.type === "approve" ? { type: "approve", approvers: s.approvers, values: s.values ?? "unusual", ...(s.nobodyElse ? { nobodyElse: s.nobodyElse } : {}) } : s)) };
}
