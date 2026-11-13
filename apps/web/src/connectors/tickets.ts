import { headline, type Connector } from "./types";

// A generic ticket system: a task becomes a ticket, replies become comments, closing the ticket marks the task done.
export const tickets: Connector = {
  id: "tickets",
  label: "Ticket system",
  blurb: "Tasks become tickets; comments come back, closing a ticket marks the task done.",
  capabilities: ["actions", "replies", "status"],
  address: (p) => p.email,
  replyHint: "Comment on the ticket, or close it to mark the task done.",
  render: (e) => {
    const opening = e.kind === "question" || e.kind === "task";
    return {
      subject: opening ? `${e.ref}: ${e.action.metric}, ${e.action.period}: ${e.action.question.slice(0, 70)}` : `Comment on ${e.ref}`,
      body: opening
        ? [`Type: ${e.action.kind === "task" ? "Task" : "Question"}`, `Assignee: ${e.recipient.name}`, `Reporter: ${e.sender.name}`, e.action.due ? `Due: ${e.action.due}` : "", "", e.action.question, "", `Ziffr: ${e.link}`].filter((x) => x !== null).join("\n")
        : [headline(e) + ".", e.text && e.kind !== "decision" ? e.text : "", e.correction ? `Proposed value: ${e.correction}` : ""].filter(Boolean).join("\n"),
    };
  },
};
