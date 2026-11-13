import { headline, type Connector } from "./types";

export const whatsapp: Connector = {
  id: "whatsapp",
  label: "WhatsApp",
  blurb: "Short messages from the Ziffr business number; answers come back.",
  capabilities: ["reminders", "actions", "replies"],
  address: (p) => p.phone ?? "no number",
  replyHint: "Answer in the chat. A line “Correction: 1234” proposes a new value.",
  renderPrompt: (e) => ({
    subject: `Message to ${e.recipient.phone ?? e.recipient.name}`,
    body: [`${e.question}`, `${e.metric}, ${e.period}`, `Enter it here: ${e.formLink}`].join("\n"),
  }),
  render: (e) => ({
    subject: `Message to ${e.recipient.phone ?? e.recipient.name}`,
    body: [
      `${headline(e)}.`,
      e.kind === "question" || e.kind === "task" ? `“${e.action.question}”` : e.text && e.kind !== "decision" ? `“${e.text}”` : "",
      e.correction ? `Proposed value: ${e.correction}` : "",
      `Reply here, or open: ${e.link}`,
    ].filter(Boolean).join("\n"),
  }),
};
