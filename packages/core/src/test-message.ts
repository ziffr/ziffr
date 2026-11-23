// Test Messages (spec 0052, ticket 7; GLOSSARY: Test Message, Delivery, Connector). A person sends themselves one
// message by email, Slack or Telegram to see that it reaches them: the "Send me a test" of the Setup Guide and the
// ways in and out. It asks for nothing and cannot be answered.
// Security: this is the one operation that makes Ziffr message a person on a person's press, so it is built to reach
// nobody else. No parameter names a recipient, an address, a Slack user or a chat: the recipient is the acting person,
// the address is the one Ziffr keeps for that person (their sign-in address, or the Contact address on file if they also have one), and Slack and Telegram reach only the account that
// person linked (or Slack found by that address). The text is fixed: the Workspace's name and the way, never anything
// typed. Never through an Access Key, in the demo or for a Guest. At most 3 by one way in 10 minutes and 20 a day by
// all ways (5 in a trial), claimed in the database under a lock. The Audit Log keeps the way and the outcome, never an address.
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { deliverTest } from "./deliveries";
import { refuseInDemo } from "./demo";
import { addressIn, mailEnabled } from "./mail";
import { reachOf } from "./prompt-reach";
import { settingsInEffect } from "./settings-in-effect";
import { slackOn } from "./slack-api";
import { slackSends } from "./slack-send";
import { telegramEnabled } from "./telegram-api";
import { telegramOnIn } from "./telegram-connection";
import { shownReason } from "./ask-now";
import { trialEndsAt } from "./trials";
import { CONNECTORS } from "./connectors/index";
import {
  limitWords, NO_WAY_HERE, TEST_PER_DAY, TEST_PER_DAY_IN_TRIAL, TEST_PER_WAY_PER_WINDOW, TEST_SUBJECT, TEST_WAYS, TEST_WINDOW_MINUTES, testText, type TestWay,
} from "./test-message-words";

/** What became of a press: sent, waiting to be sent, kept in the Outbox (with why), or stopped by a limit (with when it resets). */
export type TestMessageResult = {
  way: TestWay; label: string; state: "sent" | "queued" | "kept" | "limited";
  /** Why it was kept or stopped, in Ziffr's own words; null when it was sent or is waiting. */
  note: string | null;
  /** When a limit lets the person press again (an ISO time); only for "limited". */
  resetsAt: string | null;
};

/** Whether a way is one a Test Message goes by. Untrusted input from a browser or a program is checked with this. */
export const isTestWay = (v: unknown): v is TestWay => typeof v === "string" && (TEST_WAYS as readonly string[]).includes(v);

/** The reason this way cannot reach this person now, from what this Ziffr, the Workspace and the person have set up; null when it can. */
async function missing(ws: string, personId: string, way: TestWay): Promise<string | null> {
  const settings = await settingsInEffect();
  if (way === "email") {
    if (!mailEnabled(settings)) return NO_WAY_HERE.mail;
    return (await addressIn(ws, personId)) ? null : NO_WAY_HERE.address;
  }
  if (way === "slack") {
    if (!(await slackOn())) return NO_WAY_HERE.slackApp;
    if (!(await slackSends(ws))) return NO_WAY_HERE.slackWorkspace;
    return (await reachOf(ws, personId, true)).slack ? null : NO_WAY_HERE.slackPerson;
  }
  if (!telegramEnabled(settings)) return NO_WAY_HERE.telegramBot;
  if (!(await telegramOnIn(ws))) return NO_WAY_HERE.telegramWorkspace;
  return (await reachOf(ws, personId)).telegram ? null : NO_WAY_HERE.telegramPerson;
}

/** Sends the actor a Test Message by one way, to themself and nobody else: the way is the only input. Refused for an
 * Access Key, in the demo, for a Guest and for a way that is not email, Slack or Telegram. Over a limit it sends nothing
 * and says which limit and when it resets; a way that is not set up is kept in the Outbox with what is missing. */
export async function sendTestMessage(actor: Actor, way: unknown): Promise<TestMessageResult> {
  if (actor.key) throw new Forbidden();
  refuseInDemo(actor);
  if (!isTestWay(way)) throw new Forbidden("Choose email, Slack or Telegram.");
  // The membership is read again: a Guest, or someone who left, sends nothing (the role on the Actor may be old).
  const { data: member } = await db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle();
  if (!member || member.role === "guest") throw new Forbidden("Guests cannot send test messages.");
  const label = CONNECTORS[way].label;
  // In a trial the day's cap is smaller, so tests cannot use up the trial's shared messages a day.
  const perDay = (await trialEndsAt(actor.workspaceId)) ? TEST_PER_DAY_IN_TRIAL : TEST_PER_DAY;
  const { data: claim, error } = await db().rpc("claim_test_message", {
    p_workspace: actor.workspaceId, p_person: actor.personId, p_way: way,
    p_per_window: TEST_PER_WAY_PER_WINDOW, p_window_minutes: TEST_WINDOW_MINUTES, p_per_day: perDay,
  });
  if (error || typeof claim !== "string") throw new Error("The test message could not be sent. Try again in a moment.");
  if (claim !== "ok") {
    const [limit, resetsAt] = claim.split("|");
    if ((limit !== "window" && limit !== "day") || !resetsAt) throw new Error("The test message could not be sent. Try again in a moment.");
    return { way, label, state: "limited", note: limitWords(limit, resetsAt, Date.now(), perDay), resetsAt };
  }
  const { data: ws } = await db().from("workspaces").select("name").eq("id", actor.workspaceId).maybeSingle();
  const keep = await missing(actor.workspaceId, actor.personId, way);
  const id = await deliverTest(actor.workspaceId, { recipientId: actor.personId, subject: TEST_SUBJECT, text: testText(String(ws?.name ?? ""), way), via: way, keep: keep ?? undefined });
  const { data: d } = id ? await db().from("deliveries").select("mail_state, last_error").eq("id", id).eq("workspace_id", actor.workspaceId).eq("recipient_id", actor.personId).maybeSingle() : { data: null };
  const state: TestMessageResult["state"] = d?.mail_state === "sent" ? "sent" : d?.mail_state === "queued" || d?.mail_state === "sending" ? "queued" : "kept";
  // Only Ziffr's own reasons are shown: a mail server's or a provider's words never reach the browser.
  const note = state === "sent" || state === "queued" ? null : shownReason(keep ?? (d?.last_error as string | null)) ?? "It stayed in the Outbox.";
  await audit(actor, { kind: "connector.test_sent", details: { way, outcome: state } });
  return { way, label, state, note, resetsAt: null };
}
