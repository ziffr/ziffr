import { headline, type Connector } from "./types";

const handle = (h: string) => `@${h.replace(/^@/, "")}`;

export const slack: Connector = {
  id: "slack",
  label: "Slack",
  blurb: "Direct messages from the Ziffr app; answers in the thread come back.",
  capabilities: ["values", "reminders", "actions", "replies"],
  address: (p) => handle(p.slack_handle),
  sourceId: "slack",
  replyHint: "Reply in the thread. A line “Correction: 1234” proposes a new value.",
  renderPrompt: (e) => ({
    subject: `Direct message to ${e.recipient.name}`,
    body: [`*${e.question}*`, `${e.metric}, ${e.period}`, e.answerHere ? "Reply with the number, here in the thread." : `<${e.formLink}|Enter it in your form>`].join("\n"),
  }),
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
