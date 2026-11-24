// Where Slack sends a person back after "Add to Slack" (GLOSSARY: Connector, Setup Guide). Pure, so it is tried without a
// server: the only way back besides the Connectors page is the Setup Guide, and it is named by a fixed word in a cookie,
// so no address from a request is ever followed.

/** The cookie "Add to Slack" from the Setup Guide leaves, holding the word `setup`. */
export const SLACK_BACK_COOKIE = "ziffr_slack_back";

/** The outcomes the page after "Add to Slack" knows by name; anything else is not shown. */
export const SLACK_OUTCOMES = ["connected", "cancelled", "refused", "elsewhere", "org_install", "failed"] as const;

/** The address Slack's callback sends the person to: the guide when the cookie says `setup`, else the Connectors page.
 * `site` is the app's own origin; `outcome` is a word from the core, not Slack's. */
export function slackReturn(site: string, outcome: string, back: string | undefined): string {
  const word = (SLACK_OUTCOMES as readonly string[]).includes(outcome) ? outcome : "refused";
  return back === "setup" ? `${site}/setup?step=ways&slack=${word}` : `${site}/connectors?slack=${outcome}`;
}
