import { headline, type Connector } from "./types";

export const email: Connector = {
  id: "email",
  label: "Email",
  blurb: "Plain emails; replying to one answers in Ziffr.",
  capabilities: ["values", "reminders", "actions", "replies"],
  address: (p) => p.email,
  sourceId: "mail",
  replyHint: "Reply to the email. A line “Correction: 1234” proposes a new value.",
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
