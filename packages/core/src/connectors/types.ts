// Connectors (GLOSSARY: Connector): the plug-in point between Ziffr and outside systems, both ways.
// A connector says what it can do and how a Delivery looks there. Adding Teams, Jira or SMS means
// adding one module like these and registering it in ./index.ts. Pure: no server or React code.
import type { Profile } from "../types";

/** The Connectors Ziffr knows. */
export type ConnectorId = "slack" | "email" | "whatsapp" | "tickets" | "telegram";
/** values: receives observations (a Source); reminders, actions: sends them; replies: answers come back; status: a task's state stays in step. */
export type Capability = "values" | "reminders" | "actions" | "replies" | "status";
/** What a Delivery is about. */
export type DeliveryKind = "question" | "task" | "reminder" | "reply" | "correction" | "decision" | "closed" | "done" | "prompt";
/** The kinds of message a Delivery Preference is set for. */
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
  /** Whether a reply here comes back into Ziffr; when not, the message says to answer in Ziffr. Default yes. */
  repliesReturn?: boolean;
};

/** A message as one Connector words it. */
export type Rendered = { subject: string; body: string };

/** A Prompt (GLOSSARY: Prompt): asking a submitter for a value. answerHere: a reply records the value. */
export type PromptEvent = { recipient: Profile; metric: string; question: string; period: string; answerHere: boolean; formLink: string };

/** A Connector: what it can do, and how a Delivery and a Prompt read there. */
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
  sourceId?: "slack" | "mail" | "web_form" | "telegram";
};

/** Each capability in words for the Connectors page. */
export const CAPABILITY_LABEL: Record<Capability, string> = {
  values: "Receives values",
  reminders: "Sends reminders",
  actions: "Sends questions and tasks",
  replies: "Brings replies back",
  status: "Keeps task status in step",
};

/** Which Delivery Preference decides where each kind of Delivery goes. */
export const PREFERENCE_KIND: Record<DeliveryKind, PreferenceKind> = {
  question: "question", task: "task", reminder: "reminder",
  reply: "update", correction: "update", decision: "update", closed: "update", done: "update", prompt: "reminder",
};

/** "Correction: 1,234" on a line of its own proposes a new value, whatever the system. The number stands after the colon
 * or alone on the next line that has anything on it. Without one the whole reply is its words, so that no value changes. */
export function parseReply(text: string): { body: string; correction: number | null } {
  for (const line of correctionLines(text)) {
    const number = correctionNumber(text, line.after);
    if (number === null) continue;
    const correction = Number(number.replace(/[\s,]/g, ""));
    if (!Number.isFinite(correction)) break;
    // Only the line that proposes the value is not part of the words.
    return { body: (text.slice(0, line.from) + text.slice(runEnd(text, line.after, /.*/y))).trim(), correction };
  }
  return { body: text.trim(), correction: null };
}

const LINE_BREAK = /[\n\r\u2028\u2029]/;

/** Where the run that this sticky pattern matches ends, from a position. */
function runEnd(text: string, from: number, run: RegExp): number {
  run.lastIndex = from;
  run.exec(text);
  return run.lastIndex;
}

/** Every "Correction:" that opens a line, white space aside: where its match starts (the first line start in the white
 * space before the word) and the position after its colon. */
function correctionLines(text: string): { from: number; after: number }[] {
  const lines: { from: number; after: number }[] = [];
  for (const word of text.matchAll(/correction/gi)) {
    let from = word.index;
    while (from > 0 && /\s/.test(text[from - 1])) from--;
    if (from > 0) {
      while (from < word.index && !LINE_BREAK.test(text[from])) from++;
      if (from === word.index) continue;
      from++;
    }
    const colon = runEnd(text, word.index + word[0].length, /\s*/y);
    if (text[colon] === ":") lines.push({ from, after: colon + 1 });
  }
  return lines;
}

/** What stands for the number after a Correction's colon, white space and empty lines aside: a sign, then digits,
 * points, commas and spaces up to that line's end, with at least one digit. A number never runs into a further line, and
 * nothing without a digit is one (it would read as 0). Null when nothing there reads so. */
function correctionNumber(text: string, colon: number): string | null {
  const at = runEnd(text, colon, /\s*/y);
  const digits = /[-+]/.test(text.charAt(at)) ? at + 1 : at;
  // The class is digits, points, commas and every white space but a line break.
  const end = runEnd(text, digits, /[\d.,\t\v\f\ufeff\p{Zs}]*/uy);
  if (end < text.length && !LINE_BREAK.test(text[end])) return null;
  const number = text.slice(at, end);
  return /\d/.test(number) ? number : null;
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
