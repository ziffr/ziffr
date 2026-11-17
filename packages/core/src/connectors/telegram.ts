// The Telegram Connector (GLOSSARY: Connector; spec 0016): messages from the Installation's Ziffr bot in a private chat;
// replying to one answers in Ziffr. Sent for real once a workspace turns Telegram on and the person connected their
// Telegram (../telegram-send.ts); this module only words the messages. Plain text, sent without a parse mode: nothing
// in a workspace's words can become formatting or a hidden link, and Telegram still makes a plain address clickable.
import { headline, type Connector } from "./types";

/** How Ziffr reaches people by Telegram, and how their answers come back. */
export const telegram: Connector = {
  id: "telegram",
  label: "Telegram",
  blurb: "Messages from Ziffr's bot in Telegram; replying to one answers in Ziffr.",
  capabilities: ["values", "reminders", "actions", "replies"],
  /** A person is reached by the Telegram account they connected themselves, not by a handle Ziffr keeps. */
  address: () => "Connected Telegram",
  sourceId: "telegram",
  replyHint: "Reply to the message. A line “Correction: 1234” proposes a new value.",
  /** A Prompt as a message; replying with the number records the value. */
  renderPrompt: (e) => ({
    subject: `Telegram message to ${e.recipient.name}`,
    body: [e.question, `${e.metric}, ${e.period}`, e.answerHere ? "Reply to this message with the number." : `Enter it in your form: ${e.formLink}`].join("\n"),
  }),
  /** A Delivery as a message. */
  render: (e) => ({
    subject: `Telegram message to ${e.recipient.name}`,
    body: [
      `${headline(e)}.`,
      e.kind === "question" || e.kind === "task" ? `“${e.action.question}”` : e.text && e.kind !== "decision" ? `“${e.text}”` : "",
      e.correction ? `Proposed value: ${e.correction}` : "",
      e.repliesReturn === false ? `Answer in Ziffr: ${e.link}` : `Reply to this message, or open: ${e.link}`,
    ].filter(Boolean).join("\n"),
  }),
};
