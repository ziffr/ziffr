// A step of a Workflow Template in words (GLOSSARY: Workflow Template, Checklist Item), for the list on the Workflows
// page: the people, the Group and the dashboard its steps leave open are for whoever uses the template to pick.
import { stepLabel } from "@ziffr/core/workflow-rules";
import type { WorkflowTemplateStep } from "@ziffr/core/types";

/** A step of a Workflow Template in words: who is told, who ticks it off and which dashboard are for whoever uses it to pick. */
export function templateStepLabel(s: WorkflowTemplateStep): string {
  const words = (t: string) => `“${t.length > 60 ? `${t.slice(0, 60).trimEnd()}…` : t}”`;
  const days = (n: number) => `${n} working day${n === 1 ? "" : "s"}`;
  if (s.type === "approve") return `Approval by ${s.approvers === 1 ? "one person" : `${s.approvers} people`} you pick${s.values === "every" ? ", for every value" : ", for Unusual Values"}`;
  if (s.type === "checklist") return s.kind === "tick" ? `${days(s.dueWorkingDays)} after the period: the person you pick ticks off ${words(s.text)}` : `${days(s.day)} after the period: tell the people you pick ${words(s.text)}`;
  if (s.type === "send_snapshot") return "When the period is finished, send its Snapshot of a dashboard you pick to the people you pick";
  return stepLabel(s, []);
}
