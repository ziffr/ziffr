// The words of a Test Message (GLOSSARY: Test Message; spec 0052): the fixed text it carries and the reasons it stays in
// the Outbox, as people read them. Pure: no database. Nothing here is built from what a person typed; the only variable
// parts are the Workspace's name and the way, and a reason names no address, account, token or other person.
import type { ConnectorId } from "./connectors/types";

/** The ways a Test Message can go: the Connectors that reach a person. */
export const TEST_WAYS = ["email", "slack", "telegram"] as const;
/** One way a Test Message goes. */
export type TestWay = (typeof TEST_WAYS)[number];

/** What a person calls each way in the message. */
export const WAY_WORDS: Record<TestWay, string> = { email: "email", slack: "Slack", telegram: "Telegram" };

/** Why a Test Message stayed in the Outbox: what this Ziffr or this person is missing, in words that say who can add it. */
export const NO_WAY_HERE = {
  mail: "This Ziffr has no mail server yet. Whoever runs it adds one on the Installation settings page.",
  address: "There is no usable email address for you here.",
  slackApp: "This Ziffr has no Slack app yet. Whoever runs it adds one on the Installation settings page.",
  slackWorkspace: "This Workspace is not connected to Slack yet. An Owner or Admin adds it on the Connectors page.",
  slackPerson: "Slack does not know you yet. Link your Slack account on the Connectors page.",
  telegramBot: "This Ziffr has no Telegram bot yet. Whoever runs it adds one on the Installation settings page.",
  telegramWorkspace: "Telegram is not turned on in this Workspace. An Owner or Admin turns it on on the Connectors page.",
  telegramPerson: "You have not connected Telegram yet. Connect it on the Connectors page.",
} as const;

/** The most Test Messages one person sends by one way in a window. */
export const TEST_PER_WAY_PER_WINDOW = 3;
/** The length of that window, in minutes. */
export const TEST_WINDOW_MINUTES = 10;
/** The most Test Messages one person sends, by all ways together, in 24 hours. */
export const TEST_PER_DAY = 20;

/** The most Test Messages one person sends, by all ways together, in 24 hours in a Trial Workspace, so tests cannot use up the trial's messages a day. */
export const TEST_PER_DAY_IN_TRIAL = 5;

/** The subject of a Test Message. */
export const TEST_SUBJECT = "Test message from Ziffr";

/** The fixed text of a Test Message: the Workspace's name and the way, nothing else. */
export function testText(workspaceName: string, way: ConnectorId & TestWay): string {
  const name = workspaceName.replace(/[<>&]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  return `This is a test from Ziffr${name ? ` for ${name}` : ""}. If you can read it here, Ziffr reaches you on ${WAY_WORDS[way]}. Nothing to answer.`;
}

/** How long until a reset, in words a person reads: minutes up to an hour and a half, then hours. */
function untilWords(resetsAt: string, now: number): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(resetsAt) - now) / 60_000));
  if (minutes <= 90) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hours`;
}

/** What a person is told when a limit stops a press: which limit, and how long until it resets (`resetsAt` is an ISO time). */
export function limitWords(limit: "window" | "day", resetsAt: string, now: number = Date.now(), perDay: number = TEST_PER_DAY): string {
  return limit === "window"
    ? `You sent ${TEST_PER_WAY_PER_WINDOW} test messages by this way in the last ${TEST_WINDOW_MINUTES} minutes. Try again in ${untilWords(resetsAt, now)}.`
    : `You sent ${perDay} test messages today. Try again in ${untilWords(resetsAt, now)}.`;
}
