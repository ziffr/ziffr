// The Workflow Template file format, ziffr.workflow-template/1 (GLOSSARY: Workflow Template): the format lives in @ziffr/pack (MIT), so a creator checks a file exactly as Ziffr does;
// this module adds how a checked file becomes what a Workflow Template stores.
import type { WorkflowTemplateFile } from "@ziffr/pack/workflow-template-file";
import type { WorkflowTemplateBody, WorkflowTemplateStep } from "./types";

export * from "@ziffr/pack/workflow-template-file";

/** A checked Workflow Template file as the body a Workflow Template stores. A stored template has no Positions yet
 * (spec 0058, #1183): what a /2 step names, and its Tell steps, stay in the file, so each step is rebuilt from the
 * fields a template keeps and nothing else from the file reaches a Workflow. */
export function workflowTemplateFromFile(t: WorkflowTemplateFile): WorkflowTemplateBody {
  return {
    dueWorkingDays: t.dueWorkingDays,
    steps: t.steps.flatMap((s): WorkflowTemplateStep[] => {
      switch (s.type) {
        case "tell": return [];
        case "approve": return [{ type: "approve", approvers: s.approvers, values: s.values ?? "unusual", ...(s.nobodyElse ? { nobodyElse: s.nobodyElse } : {}) }];
        case "checklist": return [s.kind === "tick" ? { type: "checklist", kind: "tick", text: s.text, dueWorkingDays: s.dueWorkingDays } : { type: "checklist", kind: "info", text: s.text, day: s.day }];
        case "send_snapshot": return [{ type: "send_snapshot" }];
        default: return [s];
      }
    }),
  };
}
