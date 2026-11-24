// Every free-text or identifying input of the actions spec 0051 ticket 8 opened is checked before it can be shown to other visitors:
// by the text rules (demoTextForVisit, demoPasteText) or by a fixed shape or list. This lists them, without a database, and fails when an
// opened action is not here, so a new input cannot be added unseen.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoOperations, demoClassOf } from "@ziffr/core/demo-changes";

/** Opened action -> its inputs and what holds each (a marker that must appear in its source or its core function's). */
const INPUTS: Record<string, { file: string; checks: string[]; why: string }> = {
  "series-actions:recordValue": { file: "series-actions.ts", checks: ['demoTextForVisit(visiting, String(input?.value', "demoTextForVisit(visiting, String(input?.breakdown"], why: "value, breakdown text; period is one of the offered periods (core)" },
  "series-actions:askMeNow": { file: "series-actions.ts", checks: ["Number(metricId)"], why: "a Metric id only" },
  "actions:submitWebForm": { file: "actions.ts", checks: ["tk-[A-Za-z0-9_-]", 'demoTextForVisit(visiting, String(form.get("value")', 'demoTextForVisit(visiting, String(form.get("breakdown")'], why: "token code shape, value, breakdown" },
  "actions:recordSimulatedMessage": { file: "actions.ts", checks: ['demoTextForVisit(visiting, String(input.text'], why: "text; source is slack or mail and the sender one of the demo's people (core demo-channels.ts)" },
  "actions:decideCorrection": { file: "actions.ts", checks: ["Boolean(accept)"], why: "an id and a boolean" },
  "paste-actions:recordPaste": { file: "paste-actions.ts", checks: ["demoPasteText(input.text)"], why: "pasted text; the rest is shape-checked by the core (check())" },
  "fill-in-actions:fillInForSubmitter": { file: "fill-in-actions.ts", checks: ['demoTextForVisit(visiting, String(input?.value', 'demoTextForVisit(visiting, String(input?.breakdown'], why: "value, breakdown; person id by shape, period as a day (core fill-in.ts)" },
  "connector-actions:recordSimulatedReply": { file: "connector-actions.ts", checks: ['demoTextForVisit(visiting, String(text ?? ""), "message")'], why: "reply text; a Delivery id" },
  "connector-actions:recordSimulatedPromptAnswer": { file: "connector-actions.ts", checks: ['demoTextForVisit(visiting, String(text ?? ""), "message")'], why: "answer text; a Delivery id" },
  "connector-actions:recordSimulatedTicketClose": { file: "connector-actions.ts", checks: ["Number(deliveryId)"], why: "a Delivery id only" },
  "connector-actions:askForMissingValues": { file: "connector-actions.ts", checks: ["workflowRun: true"], why: "no input" },
  "connector-actions:sendDueReminders": { file: "connector-actions.ts", checks: ["workflowRun: true"], why: "no input" },
  "workflow-actions:approveValue": { file: "workflow-actions.ts", checks: ["Number(actionId)"], why: "an id" },
  "workflow-actions:confirmOwnValue": { file: "workflow-actions.ts", checks: ["Number(actionId)"], why: "an id" },
  "workflow-actions:correctOwnValue": { file: "workflow-actions.ts", checks: ["Number(value)"], why: "an id and a number" },
  "workflow-actions:sendValueBack": { file: "workflow-actions.ts", checks: ['demoTextForVisit(visiting, String(comment ?? "")'], why: "comment" },
  "workflow-actions:proposeValueCorrection": { file: "workflow-actions.ts", checks: ['demoTextForVisit(visiting, String(why ?? "")'], why: "reason; value is a finite number" },
  "workflow-actions:lockPeriod": { file: "workflow-actions.ts", checks: ["demoTextForVisit(visiting, String(reason)"], why: "reason; period parsed as a day" },
  "workflow-actions:closeWorkflowPeriod": { file: "workflow-actions.ts", checks: ["Number(workflowId)"], why: "an id and a day within 90 days (core)" },
  "workflow-actions:runWorkflowsNow": { file: "workflow-actions.ts", checks: ["workflowRun: true"], why: "a day within 90 days (core)" },
  "workflow-actions:setStandIn": { file: "workflow-actions.ts", checks: ["String(standInId)"], why: "person ids, checked against the Workspace's people (core)" },
  "workflow-actions:setAway": { file: "workflow-actions.ts", checks: ["String(userId)"], why: "a person id checked against the people, two days within the Away rule (core and database)" },
};

describe("the inputs of the opened actions", () => {
  const opened = demoOperations().filter((k) => ["open", "limited"].includes(demoClassOf(k)?.class ?? ""));

  it("are all listed here", () => {
    for (const k of Object.keys(INPUTS)) expect(opened, k).toContain(k);
    // What else is open belongs to another ticket (9: dashboards, widgets, the Pool, Themes, Versions, templates; 10: decks and Snapshots; 11: Metrics, Threads and sharing), which lists its own inputs.
    for (const k of opened.filter((x) => !(x in INPUTS))) expect(k, "an opened action no ticket listed the inputs of").toMatch(/^(canvas-actions|convert-actions|dashboard-template-actions|deck-actions|deck-workflow-template-actions|home-actions|snapshot-actions|template-actions|theme-actions|version-actions):|^(access-actions|tag-actions|team-actions):|^actions:(createAction|createDerivedMetric|createMetric|replyToAction|setActionStatus)$|^series-actions:(archiveMetric|restoreMetric|removeSeriesRows|saveSeriesRows|setMetricSources|updateMetricDetails)$|^connector-actions:setPreference$/);
    // Ticket 11's actions (Metrics, Threads, sharing) list their inputs in packages/core/src/demo-metric-gates.test.ts: every writer's gate comes before its first write.
  });

  it("are each checked in the action's own source", () => {
    for (const [key, { file, checks }] of Object.entries(INPUTS)) {
      const src = readFileSync(join(__dirname, file), "utf8");
      for (const c of checks) expect(src, `${key}: ${c}`).toContain(c);
    }
  });
});
