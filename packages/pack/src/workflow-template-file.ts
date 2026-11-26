// The Workflow Template file format, ziffr.workflow-template/1 (GLOSSARY: Workflow Template, Workflow, Pack): a
// Workflow's Due Date and steps as a file, with its people left open. The schema below is the only definition, checked
// wherever such a file is read; docs/reference is generated from it.
// Format /2 (spec 0058) lets steps name Positions of the Pack that holds the template, and carry Tell steps that wait
// for a share; /1 is read for ever and means what it always meant.
// Security: a Workflow Template names no person: an Approve step says only how many Approvers to pick when it is used,
// a Checklist Item holds only its words (plain text, as every name in a Pack is) and when, never who it goes to or who
// ticks it off, and Send Snapshot only that it is there, never which dashboard or whom. In /2 a step may name a
// Position, a key such as “sales-lead” that a person fills at Set up, never a person, Group, address or id; a Tell step
// never holds a level (a number of someone's business) or a Webhook.
import { checkFormat, parseJson, type FormatCheck, type Schema } from "./json-check.js";
import { itemKey, plainText } from "./file-text.js";
import { refusedOutsidePack } from "./dashboard-template-file.js";
import type { WorkflowTemplateFileStep } from "./kinds.js";

/** The first format, which Ziffr writes for a template that names no Position, so an older Ziffr reads it. */
export const WORKFLOW_TEMPLATE_FORMAT = "ziffr.workflow-template/1";
/** The format with Positions and Tell steps (spec 0058). */
export const WORKFLOW_TEMPLATE_FORMAT_2 = "ziffr.workflow-template/2";
/** Every Workflow Template file format Ziffr ever published, oldest first. */
export const WORKFLOW_TEMPLATE_FORMATS = [WORKFLOW_TEMPLATE_FORMAT, WORKFLOW_TEMPLATE_FORMAT_2] as const;
/** The exact limits a Workflow Template file is held to, as the Workflow editor keeps a Workflow: among them at most 3
 * Tell steps, each naming at most 20 Positions, at a share from 1 to 1,000 %. */
export const WORKFLOW_TEMPLATE_LIMITS = { bytes: 24_576, depth: 5, steps: 33, checklistItems: 20, otherSteps: 12, text: 500, name: 80, description: 300, approvers: 3, tellSteps: 3, told: 20, shareMin: 1, shareMax: 1000 } as const;

/** A Workflow Template as a file (GLOSSARY: Workflow Template), in either format. */
export type WorkflowTemplateFile = { format: (typeof WORKFLOW_TEMPLATE_FORMATS)[number]; name: string; description?: string; dueWorkingDays: number; steps: WorkflowTemplateFileStep[] };

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

const L = WORKFLOW_TEMPLATE_LIMITS;
const position = itemKey("the key of a Position of the Pack that holds the template");
const told: Schema = { type: "array", minItems: 1, maxItems: L.told, uniqueItems: true, items: position, description: "Positions of the Pack whose people get it." };

/** What each step gains in /2: the Positions it names. */
const STEP_PLACES: Record<string, Record<string, Schema>> = {
  approve: { by: { type: "array", minItems: 1, maxItems: L.approvers, uniqueItems: true, items: position, description: "One Position for each Approver, in order: as many as “approvers”." } },
  checklist: {
    to: { ...told, description: "For \"info\": Positions of the Pack whose people are told." },
    assignee: itemKey("for \"tick\": the key of a Position for one person, whose Task it is"),
    standIn: itemKey("for \"tick\": the key of a Position for one person, who stands in for the Assignee"),
  },
  send_snapshot: { to: { ...told, description: "Positions of the Pack whose people get the Snapshot." }, dashboard: itemKey("the key of a Dashboard Template of the same Pack, whose dashboard is sent") },
};

const TELL = step("tell", "Tell people when a Metric of the Workflow reaches a share of its target, or changes more than a share on the period before. A level is never carried.", {
  condition: {
    type: "object",
    properties: {
      kind: { enum: ["share_of_target", "changed_more"] },
      share: { type: "string", maxLength: 17, pattern: "^[0-9]{1,4}(?:\\.[0-9]{1,12})?$", description: "a share in % as a plain number from 1 to 1000, such as “90”" },
    },
    required: ["kind", "share"],
    additionalProperties: false,
  },
  to: told,
}, ["condition"]);

/** Schema /2 made from schema /1: the same file, with Positions named by its steps, and Tell steps. */
function workflowTemplateSchema2(base: Schema): Schema {
  const steps = base.properties!.steps;
  const placed = steps.items!.oneOf!.map((s) => {
    const places = STEP_PLACES[s.properties!.type.const as string];
    return places ? { ...s, properties: { ...s.properties, ...places } } : s;
  });
  return {
    ...base,
    $id: "https://ziffr.net/schemas/ziffr.workflow-template-2.json",
    title: "Ziffr Workflow Template (ziffr.workflow-template/2)",
    description: "A starting point for a Workflow, as ziffr.workflow-template/1, whose steps may name Positions of the Pack that holds it, and which may tell people when a share is reached. It holds no code and names no person.",
    properties: {
      ...base.properties,
      format: { const: WORKFLOW_TEMPLATE_FORMAT_2, description: "The format and its version." },
      steps: { ...steps, items: { oneOf: [...placed, TELL] } },
    },
  };
}

/** The JSON Schema of ziffr.workflow-template/2. */
export const WORKFLOW_TEMPLATE_2_SCHEMA: Schema = workflowTemplateSchema2(WORKFLOW_TEMPLATE_SCHEMA);

/** A Position a step names: where, its key, and whether the place takes one person only. */
type Named = { path: string; key: string; one: boolean };

/** The Positions a step names. An Escalate step's `to` is “stand-in” or “owner”, never a Position. */
function stepPositions(s: WorkflowTemplateFileStep): Named[] {
  const x = s as { by?: string[]; assignee?: string; standIn?: string; to?: string[] };
  const one = (path: string, key: string | undefined): Named[] => (key === undefined ? [] : [{ path, key, one: true }]);
  const several = s.type === "escalate" ? [] : (x.to ?? []).map((key, n) => ({ path: `to[${n}]`, key, one: false }));
  return [...(x.by ?? []).flatMap((key, n) => one(`by[${n}]`, key)), ...one("assignee", x.assignee), ...one("standIn", x.standIn), ...several];
}

/** The things of a Pack a checked Workflow Template names (none in /1): Positions, and the Dashboard Template its Send
 * Snapshot step sends. */
export function workflowTemplateReferences(t: WorkflowTemplateFile): { positions: Named[]; dashboards: { path: string; key: string }[] } {
  return {
    positions: t.steps.flatMap((s, i) => stepPositions(s).map((r) => ({ ...r, path: `steps[${i}].${r.path}` }))),
    dashboards: t.steps.flatMap((s, i) => (s.type === "send_snapshot" && s.dashboard !== undefined ? [{ path: `steps[${i}].dashboard`, key: s.dashboard }] : [])),
  };
}

/** What /2 adds to the editor's rules: a Position for each Approver or none, places that fit a Checklist Item's kind,
 * and the limits of Tell steps. A /1 file has none of these fields. */
function placeRules(t: WorkflowTemplateFile, at: (path: string, message: string) => void) {
  t.steps.forEach((s, i) => {
    const here = `steps[${i}]`;
    if (s.type === "approve" && s.by && s.by.length !== s.approvers) at(`${here}.by`, `names ${s.by.length} ${s.by.length === 1 ? "Position" : "Positions"} where “approvers” is ${s.approvers}: name one for each Approver, or none.`);
    if (s.type === "tell" && !(Number(s.condition.share) >= L.shareMin && Number(s.condition.share) <= L.shareMax)) at(`${here}.condition.share`, `must be from ${L.shareMin} to ${L.shareMax}.`);
    if (s.type !== "checklist") return;
    const x = s as { kind: string; to?: string[]; assignee?: string; standIn?: string };
    if (x.kind === "info") for (const f of ["assignee", "standIn"] as const) if (x[f] !== undefined) at(`${here}.${f}`, "is for an item to tick off; an item for information has “to”.");
    if (x.kind !== "tick") return;
    if (x.to !== undefined) at(`${here}.to`, "is for an item for information; an item to tick off has “assignee”.");
    if (x.standIn !== undefined && x.assignee === undefined) at(`${here}.standIn`, "needs “assignee”: a Stand-in stands in for the Assignee.");
    else if (x.standIn !== undefined && x.standIn === x.assignee) at(`${here}.standIn`, "is the Assignee already: a Stand-in is another Position.");
  });
  const tells = t.steps.flatMap((s, i) => (s.type === "tell" ? [i] : []));
  for (const i of tells.slice(L.tellSteps)) at(`steps[${i}]`, `is Tell step ${L.tellSteps + 1} or later; a Workflow has at most ${L.tellSteps}.`);
}

const FORMAT = {
  family: "ziffr.workflow-template",
  // The rules the Workflow editor keeps: at most one check, approval, Send Snapshot and publish step, 20 Checklist Items
  // and 12 other steps, and publishing last.
  meaning(t: WorkflowTemplateFile, at: (path: string, message: string) => void) {
    placeRules(t, at);
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

/** Checks a Workflow Template file's text on its own: size and depth, the schema, the Workflow editor's rules, and that
 * it names no Position or dashboard, which only a Pack holding it can give. */
export function checkWorkflowTemplateFile(textIn: string): FormatCheck<WorkflowTemplateFile> {
  const parsed = parseJson(textIn, { maxBytes: WORKFLOW_TEMPLATE_LIMITS.bytes, maxDepth: WORKFLOW_TEMPLATE_LIMITS.depth });
  if (!parsed.ok) return parsed;
  const res = checkWorkflowTemplateFileValue(parsed.value, parsed.lines);
  if (!res.ok) return res;
  return refusedOutsidePack(res, Object.values(workflowTemplateReferences(res.value)).flat(), parsed.lines);
}

/** Checks a Workflow Template file already read from JSON (`lines` names where each path starts, when known); which
 * things of a Pack it names is checked by its Pack. A reader that gives a `schema` of its own (a Workspace Export,
 * which carries no Positions) reads /1 only. */
export function checkWorkflowTemplateFileValue(value: unknown, lines: Map<string, number> = new Map(), schema?: Schema): FormatCheck<WorkflowTemplateFile> {
  const second = (value as { format?: unknown } | null)?.format === WORKFLOW_TEMPLATE_FORMAT_2;
  return checkFormat({ ...FORMAT, reads: schema ? [WORKFLOW_TEMPLATE_FORMAT] : WORKFLOW_TEMPLATE_FORMATS, schema: schema ?? (second ? WORKFLOW_TEMPLATE_2_SCHEMA : WORKFLOW_TEMPLATE_SCHEMA) }, value, lines);
}
