// Connectors (GLOSSARY: Connector): the plug-in point between Ziffr and outside systems, both ways.
// A connector says what it can do and how a Delivery looks there. Adding Teams, Jira or SMS means
// adding one module like these and registering it in ./index.ts. Pure: no server or React code.
import type { Profile } from "@/lib/types";

export type ConnectorId = "slack" | "email" | "whatsapp" | "tickets";
/** values: receives observations (a Source); reminders, actions: sends them; replies: answers come back; status: a task's state stays in step. */
export type Capability = "values" | "reminders" | "actions" | "replies" | "status";
export type DeliveryKind = "question" | "task" | "reminder" | "reply" | "correction" | "decision" | "closed" | "done" | "prompt";
export type PreferenceKind = "question" | "task" | "reminder" | "update";

/** Everything a connector needs to word one Delivery. */
export type DeliveryEvent = {
  kind: DeliveryKind;
  action: { id: number; kind: "question" | "task"; question: string; metric: string; period: string; due: string | null };
  sender: Profile;
  recipient: Profile;
  /** The new reply, decision or reminder text. */
  text?: string;
  correction?: string | null;
  link: string;
  ref: string;
};

export type Rendered = { subject: string; body: string };

/** A Prompt (GLOSSARY: Prompt): asking a submitter for a value. answerHere: a reply records the value. */
export type PromptEvent = { recipient: Profile; metric: string; question: string; period: string; answerHere: boolean; formLink: string };

export type Connector = {
  id: ConnectorId;
  label: string;
  blurb: string;
  capabilities: Capability[];
  /** Where this person is reached on that system. */
  address: (p: Profile) => string;
  render: (e: DeliveryEvent) => Rendered;
  /** How a Prompt reads there; only connectors that send reminders have one. */
  renderPrompt?: (e: PromptEvent) => Rendered;
  /** How someone answers there, shown under the message. */
  replyHint: string;
  /** The inbound Source this connector also is, if any. */
  sourceId?: "slack" | "mail" | "web_form";
};

export const CAPABILITY_LABEL: Record<Capability, string> = {
  values: "Receives values",
  reminders: "Sends reminders",
  actions: "Sends questions and tasks",
  replies: "Brings replies back",
  status: "Keeps task status in step",
};

export const PREFERENCE_KIND: Record<DeliveryKind, PreferenceKind> = {
  question: "question", task: "task", reminder: "reminder",
  reply: "update", correction: "update", decision: "update", closed: "update", done: "update", prompt: "reminder",
};

/** "Correction: 1,234" on a line of its own proposes a new value, whatever the system. */
export function parseReply(text: string): { body: string; correction: number | null } {
  const m = text.match(/^\s*correction\s*:\s*([-+]?[\d.,\s]+)\s*$/im);
  const correction = m ? Number(m[1].replace(/[\s,]/g, "")) : null;
  const body = text.replace(/^\s*correction\s*:.*$/im, "").trim();
  return { body, correction: Number.isFinite(correction) ? correction : null };
}

/** The headline of an event, in plain words, shared by every connector. */
export function headline(e: DeliveryEvent): string {
  const who = e.sender.name.split(" ")[0];
  const about = `${e.action.metric}, ${e.action.period}`;
  switch (e.kind) {
    case "question": return `${who} asks you about ${about}`;
    case "task": return `${who} assigned you a task on ${about}${e.action.due ? `, due ${e.action.due}` : ""}`;
    case "reminder": return `Reminder: your task on ${about}${e.action.due ? ` is due ${e.action.due}` : " is still open"}`;
    case "reply": return `${who} replied on ${about}`;
    case "correction": return `${who} proposes a correction for ${about}`;
    case "decision": return `${who} ${e.text === "accepted" ? "accepted" : "declined"} your correction for ${about}`;
    case "closed": return `${who} closed the ${e.action.kind} on ${about}`;
    case "done": return `${who} marked the task on ${about} as done`;
    case "prompt": return `Value needed: ${about}`;
  }
}
