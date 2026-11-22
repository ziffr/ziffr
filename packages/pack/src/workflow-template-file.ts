// The Workflow Template file format, ziffr.workflow-template/1 (GLOSSARY: Workflow Template, Workflow, Pack): a
// Workflow's Due Date and steps as a file, with its people left open. The schema below is the only definition, checked
// wherever such a file is read; docs/reference is generated from it.
// Security: a Workflow Template names no person: an Approve step says only how many Approvers to pick when it is used.
import { checkFormat, parseJson, type FormatCheck, type Schema } from "./json-check.js";
import { plainText } from "./file-text.js";
import type { WorkflowTemplateStep } from "./kinds.js";

/** The format this Ziffr writes; it reads every version in `WORKFLOW_TEMPLATE_FORMATS`. */
export const WORKFLOW_TEMPLATE_FORMAT = "ziffr.workflow-template/1";
/** Every Workflow Template file format Ziffr ever published, oldest first. */
export const WORKFLOW_TEMPLATE_FORMATS = [WORKFLOW_TEMPLATE_FORMAT] as const;
/** The exact limits a Workflow Template file is held to, as the Workflow editor keeps a Workflow. */
export const WORKFLOW_TEMPLATE_LIMITS = { bytes: 8_192, depth: 5, steps: 12, name: 80, description: 300 } as const;

/** A Workflow Template as a file (GLOSSARY: Workflow Template), in the newest format. */
export type WorkflowTemplateFile = { format: typeof WORKFLOW_TEMPLATE_FORMAT; name: string; description?: string; dueWorkingDays: number; steps: WorkflowTemplateStep[] };

const days = (description: string): Schema => ({ type: "integer", minimum: 0, maximum: 30, description });
const step = (type: string, description: string, props: Record<string, Schema>, required: string[]): Schema => ({
  type: "object", description, properties: { type: { const: type }, ...props }, required: ["type", ...required], additionalProperties: false,
});

/** The JSON Schema of ziffr.workflow-template/1: the one definition the checks run and docs/reference is generated from. */
export const WORKFLOW_TEMPLATE_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.net/schemas/ziffr.workflow-template-1.json",
  title: "Ziffr Workflow Template (ziffr.workflow-template/1)",
  description: "A starting point for a Workflow: its Due Date, steps and reminders, with the people left open to be picked when it is used. It holds no code and names no person.",
  type: "object",
  properties: {
    format: { const: WORKFLOW_TEMPLATE_FORMAT, description: "The format and its version." },
    name: { ...plainText(WORKFLOW_TEMPLATE_LIMITS.name), minLength: 1 },
    description: plainText(WORKFLOW_TEMPLATE_LIMITS.description),
    dueWorkingDays: days("The Due Date: how many working days after a period ends its values are due."),
    steps: {
      type: "array", minItems: 1, maxItems: WORKFLOW_TEMPLATE_LIMITS.steps, description: "What happens each period, in order.",
      items: {
        oneOf: [
          step("remind", "Remind each Submitter some days before the Due Date.", { daysBefore: days("Working days before the Due Date.") }, ["daysBefore"]),
          step("escalate", "Ask the Stand-in, or the Metric's owner, when a value is late.", { to: { enum: ["stand-in", "owner"] }, daysAfter: days("Working days after the Due Date.") }, ["to", "daysAfter"]),
          step("check", "Mark a value as unusual when it moves this much, or falls outside its Target Range.", { changePct: { type: "integer", minimum: 1, maximum: 1000 }, outsideTarget: { type: "boolean" } }, ["changePct", "outsideTarget"]),
          step("approve", "Hold values back for Approval.", { approvers: { type: "integer", minimum: 0, maximum: 3, description: "How many Approvers are picked when the template is used; with 0, no value waits." }, values: { enum: ["unusual", "every"], description: "Which values wait: Unusual Values only, or every value." }, nobodyElse: { enum: ["self-check", "count"], description: "When nobody but the submitter could approve a value: they check it themselves (a Self-check, the default), or it counts without Approval." } }, ["approvers"]),
          step("publish", "Publish the period's values, and lock it if asked.", { lock: { type: "boolean" } }, ["lock"]),
        ],
      },
    },
  },
  required: ["format", "name", "dueWorkingDays", "steps"],
  additionalProperties: false,
};

const FORMAT = {
  family: "ziffr.workflow-template",
  reads: WORKFLOW_TEMPLATE_FORMATS,
  schema: WORKFLOW_TEMPLATE_SCHEMA,
  // The rules the Workflow editor keeps: at most one check, approval and publish step, and publishing last.
  meaning(t: WorkflowTemplateFile, at: (path: string, message: string) => void) {
    for (const type of ["check", "approve", "publish"] as const) {
      const all = t.steps.flatMap((s, i) => (s.type === type ? [i] : []));
      for (const i of all.slice(1)) at(`steps[${i}]`, `is a second “${type}” step; a Workflow has at most one.`);
    }
    const publish = t.steps.findIndex((s) => s.type === "publish");
    if (publish >= 0 && publish !== t.steps.length - 1) at(`steps[${publish}]`, "comes before other steps; publishing is the last step.");
  },
};

/** Checks a Workflow Template file's text: size and depth, the schema, then the Workflow editor's rules. */
export function checkWorkflowTemplateFile(textIn: string): FormatCheck<WorkflowTemplateFile> {
  const parsed = parseJson(textIn, { maxBytes: WORKFLOW_TEMPLATE_LIMITS.bytes, maxDepth: WORKFLOW_TEMPLATE_LIMITS.depth });
  if (!parsed.ok) return parsed;
  return checkWorkflowTemplateFileValue(parsed.value, parsed.lines);
}

/** Checks a Workflow Template file already read from JSON (`lines` names where each path starts, when known). */
export function checkWorkflowTemplateFileValue(value: unknown, lines: Map<string, number> = new Map(), schema: Schema = WORKFLOW_TEMPLATE_SCHEMA): FormatCheck<WorkflowTemplateFile> {
  return checkFormat(schema === WORKFLOW_TEMPLATE_SCHEMA ? FORMAT : { ...FORMAT, schema }, value, lines);
}
