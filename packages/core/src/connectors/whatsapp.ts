// The WhatsApp Connector (GLOSSARY: Connector): short messages from the Ziffr business number; answers come back. PROTOTYPE: simulated.
import { headline, type Connector } from "./types";

/** How Ziffr reaches people by WhatsApp, and how their answers come back. */
export const whatsapp: Connector = {
  id: "whatsapp",
  label: "WhatsApp",
  blurb: "Short messages from the Ziffr business number; answers come back.",
  capabilities: ["reminders", "actions", "replies"],
  /** Their phone number, if the workspace has one. */
  address: (p) => p.phone ?? "no number",
  replyHint: "Answer in the chat. A line “Correction: 1234” proposes a new value.",
  /** A Prompt as a chat message with a link to the form. */
  renderPrompt: (e) => ({
    subject: `Message to ${e.recipient.name}`,
    body: [`${e.question}`, `${e.metric}, ${e.period}`, `Enter it here: ${e.formLink}`].join("\n"),
  }),
  /** A Delivery as a chat message. */
  render: (e) => ({
    subject: `Message to ${e.recipient.name}`,
    body: [
      `${headline(e)}.`,
      e.kind === "question" || e.kind === "task" ? `“${e.action.question}”` : e.text && e.kind !== "decision" ? `“${e.text}”` : "",
      e.correction ? `Proposed value: ${e.correction}` : "",
      `Reply here, or open: ${e.link}`,
    ].filter(Boolean).join("\n"),
  }),
};
