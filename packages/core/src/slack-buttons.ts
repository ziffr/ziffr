// The buttons of spec 0064 on Slack messages (GLOSSARY: Delivery, Combined Prompt, Value Note): **Add a note** and
// **No note** under a question, and **Enter all** on a request for several numbers. Only how they look: what a press
// does is checked in slack-inbound.ts. A button carries its Delivery's id and nothing of the Workspace.

/** The action ids of these buttons. */
export const SLACK_ANSWER_BUTTONS = { addNote: "ziffr_add_note", noNote: "ziffr_no_note", enterAll: "ziffr_enter_all" } as const;

/** One button of a message, for a Delivery. */
export const slackButton = (action_id: (typeof SLACK_ANSWER_BUTTONS)[keyof typeof SLACK_ANSWER_BUTTONS], text: string, deliveryId: number) => ({ type: "button", action_id, text: { type: "plain_text", text }, value: String(deliveryId) });

/** The **Enter all** button of a Combined Prompt's message. */
export const enterAllButton = (deliveryId: number) => slackButton(SLACK_ANSWER_BUTTONS.enterAll, "Enter all", deliveryId);
