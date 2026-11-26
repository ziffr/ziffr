// The words of a Screen Link (GLOSSARY: Screen Link; spec 0055): the fixed text it carries and what a person is told
// when a limit stops it. Pure: no database. Nothing here is built from what a person typed; the only variable parts are
// the Workspace's name and the screen's name from the fixed list, never the name of a dashboard, deck or Metric, so the
// message says nothing about what the screen holds.
import { plainName, TEST_PER_WAY_PER_WINDOW, TEST_WINDOW_MINUTES, untilWords } from "./test-message-words";

/** The subject of a Screen Link. */
export const SCREEN_LINK_SUBJECT = "Your link to Ziffr";

/** The fixed text of a Screen Link; the link itself follows it. */
export function screenLinkText(workspaceName: string, screenName: string): string {
  const name = plainName(workspaceName);
  return `You asked for this link, to open ${screenName}${name ? ` in ${name}` : ""} on a larger screen. Sign in there if Ziffr asks. Nothing to answer.`;
}

/** What a person is told when a limit stops a Screen Link (`resetsAt` is an ISO time). Test Messages count in the same
 * limit, so the words speak of messages to yourself. */
export function screenLinkLimitWords(limit: "window" | "day", resetsAt: string, perDay: number, now: number = Date.now()): string {
  const sent = limit === "window" ? `${TEST_PER_WAY_PER_WINDOW} emails to yourself in the last ${TEST_WINDOW_MINUTES} minutes` : `${perDay} messages to yourself today`;
  return `You asked for ${sent}. Try again in ${untilWords(resetsAt, now)}.`;
}
