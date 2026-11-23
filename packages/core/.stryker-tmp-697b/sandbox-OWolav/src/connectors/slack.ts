// @ts-nocheck
// The Slack Connector (GLOSSARY: Connector): direct messages from the Ziffr app; answers in the thread come back.
// Sent for real once a workspace connects Slack (spec 0007, ../slack-send.ts); this module only words the messages.
import { headline, type Connector } from "./types";

/** A Slack handle with its "@". */
const handle = (h: string) => `@${h.replace(/^@/, "")}`;

/** Text from the workspace as Slack shows it literally: "&", "<" and ">" escaped, so nobody's words can become a
 * disguised link, a mention or "@channel" (Slack's own rule for mrkdwn). */
export const slackEscape = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
    body: [`*${slackEscape(e.question)}*`, slackEscape(`${e.metric}, ${e.period}`), e.answerHere ? "Reply with the number, here in the thread." : `<${e.formLink}|Enter it in your form>`].join("\n"),
  }),
  /** A Delivery as a direct message. */
  render: (e) => ({
    subject: `Direct message to ${e.recipient.name}`,
    body: [
      `*${slackEscape(headline(e))}*`,
      e.kind === "question" || e.kind === "task" ? `> ${slackEscape(e.action.question)}` : e.text && e.kind !== "decision" ? `> ${slackEscape(e.text)}` : "",
      e.correction ? `Proposed value: *${slackEscape(e.correction)}*` : "",
      `<${e.link}|Open in Ziffr>`,
    ].filter(Boolean).join("\n"),
  }),
};
