// The Workflow Template file format, ziffr.workflow-template/1 (GLOSSARY: Workflow Template, Workflow, Pack): a
// Workflow's Due Date and steps as a file, with its people left open. The schema below is the only definition, checked
// wherever such a file is read; docs/reference is generated from it.
// Security: a Workflow Template names no person: an Approve step says only how many Approvers to pick when it is used,
// a Checklist Item holds only its words (plain text, as every name in a Pack is) and when, never who it goes to or who
// ticks it off, and Send Snapshot only that it is there, never which dashboard or whom.
import { checkFormat, parseJson, type FormatCheck, type Schema } from "./json-check.js";
import { plainText } from "./file-text.js";
import type { WorkflowTemplateStep } from "./kinds.js";

/** The format this Ziffr writes; it reads every version in `WORKFLOW_TEMPLATE_FORMATS`. */
export const WORKFLOW_TEMPLATE_FORMAT = "ziffr.workflow-template/1";
/** Every Workflow Template file format Ziffr ever published, oldest first. */
export const WORKFLOW_TEMPLATE_FORMATS = [WORKFLOW_TEMPLATE_FORMAT] as const;
/** The exact limits a Workflow Template file is held to, as the Workflow editor keeps a Workflow. */
export const WORKFLOW_TEMPLATE_LIMITS = { bytes: 24_576, depth: 5, steps: 33, checklistItems: 20, otherSteps: 12, text: 500, name: 80, description: 300 } as const;

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
          step("checklist", "A Checklist Item: its words, and when. \"info\" is sent to people chosen when the template is used, `day` working days after the period ends; \"tick\" is given to a person chosen then, due `dueWorkingDays` after it ends.", { kind: { enum: ["info", "tick"] }, text: { ...plainText(WORKFLOW_TEMPLATE_LIMITS.text), minLength: 1 }, day: { type: "integer", minimum: 1, maximum: 30, description: "For \"info\": working days after the period ends." }, dueWorkingDays: days("For \"tick\": working days after the period ends by which it is due.") }, ["kind", "text"]),
          step("send_snapshot", "Send a dashboard's Snapshot of the period to people chosen when the template is used, once the period is finished. The dashboard and the people are left open.", {}, []),
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
  // The rules the Workflow editor keeps: at most one check, approval, Send Snapshot and publish step, 20 Checklist Items
  // and 12 other steps, and publishing last.
  meaning(t: WorkflowTemplateFile, at: (path: string, message: string) => void) {
    const items = t.steps.flatMap((s, i) => (s.type === "checklist" ? [i] : []));
    for (const i of items.slice(WORKFLOW_TEMPLATE_LIMITS.checklistItems)) at(`steps[${i}]`, `is checklist item ${WORKFLOW_TEMPLATE_LIMITS.checklistItems + 1} or later; a Workflow has at most ${WORKFLOW_TEMPLATE_LIMITS.checklistItems}.`);
    t.steps.forEach((s, i) => {
      if (s.type !== "checklist") return;
      const loose = s as { kind: string; day?: number; dueWorkingDays?: number };
      if (loose.kind === "info" && loose.day === undefined) at(`steps[${i}]`, "is a checklist item for information and needs “day”.");
      if (loose.kind === "info" && loose.dueWorkingDays !== undefined) at(`steps[${i}].dueWorkingDays`, "is for an item to tick off; an item for information has “day”.");
      if (loose.kind === "tick" && loose.dueWorkingDays === undefined) at(`steps[${i}]`, "is a checklist item to tick off and needs “dueWorkingDays”.");
      if (loose.kind === "tick" && loose.day !== undefined) at(`steps[${i}].day`, "is for an item for information; an item to tick off has “dueWorkingDays”.");
    });
    const others = t.steps.flatMap((s, i) => (s.type !== "checklist" ? [i] : []));
    for (const i of others.slice(WORKFLOW_TEMPLATE_LIMITS.otherSteps)) at(`steps[${i}]`, `is step ${WORKFLOW_TEMPLATE_LIMITS.otherSteps + 1} or later, not counting checklist items; a Workflow has at most ${WORKFLOW_TEMPLATE_LIMITS.otherSteps}.`);
    for (const type of ["check", "approve", "send_snapshot", "publish"] as const) {
      const all = t.steps.flatMap((s, i) => (s.type === type ? [i] : []));
      for (const i of all.slice(1)) at(`steps[${i}]`, `is a second “${type}” step; a Workflow has at most one.`);
    }
    const publish = t.steps.findIndex((s) => s.type === "publish");
    if (publish >= 0 && publish !== t.steps.length - 1) at(`steps[${publish}]`, "comes before other steps; publishing is the last step.");
    // The editor's rule (spec 0045): a Send Snapshot step goes when the period is finished, so the Publish step locks.
    // Checked here, so a file the editor would refuse is refused when it is checked, not halfway through using it.
    const send = t.steps.findIndex((s) => s.type === "send_snapshot");
    if (send >= 0 && !t.steps.some((s) => s.type === "publish" && (s as { lock?: boolean }).lock === true)) at(`steps[${send}]`, "needs a “publish” step with “lock”: true; a Send Snapshot step goes once the period is locked.");
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
