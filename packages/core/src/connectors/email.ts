// The Email Connector (GLOSSARY: Connector): plain emails; replying to one answers in Ziffr. PROTOTYPE: simulated.
import { headline, type Connector } from "./types";

/** How Ziffr reaches people by Email, and how their answers come back. */
export const email: Connector = {
  id: "email",
  label: "Email",
  blurb: "Plain emails; replying to one answers in Ziffr.",
  capabilities: ["values", "reminders", "actions", "replies"],
  /** Their email address. */
  address: (p) => p.email,
  sourceId: "mail",
  replyHint: "Reply to the email. A line “Correction: 1234” proposes a new value.",
  /** A Prompt as an email; replying records the value where the Metric takes mail. */
  renderPrompt: (e) => ({
    subject: `${e.question} (${e.metric}, ${e.period})`,
    body: [`Hi ${e.recipient.name.split(" ")[0]},`, "", e.question, "", e.answerHere ? "Just reply to this email with the number. A breakdown works too, one row per line." : `Enter it in your form: ${e.formLink}`].join("\n"),
  }),
  /** A Delivery as an email, threaded by its reference. */
  render: (e) => ({
    subject: `${headline(e)} [${e.ref}]`,
    body: [
      `Hi ${e.recipient.name.split(" ")[0]},`,
      "",
      e.kind === "question" || e.kind === "task" ? `${e.sender.name.split(" ")[0]} wrote:\n\n  ${e.action.question}` : e.text && e.kind !== "decision" ? `  ${e.text}` : headline(e) + ".",
      e.correction ? `\nProposed value: ${e.correction}` : "",
      "",
      `Answer by replying to this email, or open it in Ziffr: ${e.link}`,
    ].join("\n"),
  }),
};
