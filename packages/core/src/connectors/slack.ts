// The Slack Connector (GLOSSARY: Connector): direct messages from the Ziffr app; answers in the thread come back. PROTOTYPE: simulated.
import { headline, type Connector } from "./types";

/** A Slack handle with its "@". */
const handle = (h: string) => `@${h.replace(/^@/, "")}`;

/** How Ziffr reaches people by Slack, and how their answers come back. */
export const slack: Connector = {
  id: "slack",
  label: "Slack",
  blurb: "Direct messages from the Ziffr app; answers in the thread come back.",
  capabilities: ["values", "reminders", "actions", "replies"],
  /** Their Slack handle. */
  address: (p) => handle(p.slack_handle),
  sourceId: "slack",
  replyHint: "Reply in the thread. A line “Correction: 1234” proposes a new value.",
  /** A Prompt as a direct message; a reply in the thread records the value. */
  renderPrompt: (e) => ({
    subject: `Direct message to ${e.recipient.name}`,
    body: [`*${e.question}*`, `${e.metric}, ${e.period}`, e.answerHere ? "Reply with the number, here in the thread." : `<${e.formLink}|Enter it in your form>`].join("\n"),
  }),
  /** A Delivery as a direct message. */
  render: (e) => ({
    subject: `Direct message to ${e.recipient.name}`,
    body: [
      `*${headline(e)}*`,
      e.kind === "question" || e.kind === "task" ? `> ${e.action.question}` : e.text && e.kind !== "decision" ? `> ${e.text}` : "",
      e.correction ? `Proposed value: *${e.correction}*` : "",
      `<${e.link}|Open in Ziffr>`,
    ].filter(Boolean).join("\n"),
  }),
};
