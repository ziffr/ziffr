// Screen Links (spec 0055, ticket 4; GLOSSARY: Screen Link, Delivery). "Send me the link": a person on a phone has the
// address of a screen made for building emailed to themself, to open it on a larger screen.
// Security: this makes Ziffr email a person on a person's press, so like a Test Message it is built to reach nobody
// else. No parameter names a recipient or an address: the recipient is the acting person and the address the one Ziffr
// keeps for them (mail.ts, addressIn). The only input is a path, which must be one of the fixed list of screens
// (desktop-screens.ts), so the email never leads anywhere else; its words are fixed and name no dashboard, deck or
// Metric, so no check of what the person may see is needed to send it, and the screen checks that when it is opened.
// Never through an Access Key, in the demo or for a Guest. It shares the limit of Test Messages by email. The Audit
// Log keeps the screen's name and the outcome, never the path or an address.
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { deliverScreenLink } from "./deliveries";
import { refuseInDemo } from "./demo";
import { desktopScreen } from "./desktop-screens";
import { claimSelfSend, maySendToSelf, selfSendOutcome } from "./internal/self-send";
import { addressIn, mailEnabled } from "./mail";
import { SCREEN_LINK_SUBJECT, screenLinkLimitWords, screenLinkText } from "./screen-link-words";
import { settingsInEffect } from "./settings-in-effect";
import { NO_WAY_HERE } from "./test-message-words";

/** What became of a press: sent, waiting to be sent, kept in the Outbox or stopped by a limit, with the words the person reads. */
export type ScreenLinkResult = { state: "sent" | "queued" | "kept" | "limited"; words: string };

const FAILED = "The link could not be sent. Try again in a moment.";

/** Emails the actor, and nobody else, the link to a screen made for a larger screen. Refused for an Access Key, in the
 * demo, for a Guest and for a path that is not such a screen. Over the limit it sends nothing and says when it resets;
 * where email cannot go out it stays in the Outbox and says why. */
export async function sendScreenLink(actor: Actor, path: unknown): Promise<ScreenLinkResult> {
  if (actor.key) throw new Forbidden();
  refuseInDemo(actor);
  const screen = desktopScreen(path);
  if (!screen) throw new Forbidden("Ziffr cannot send a link to this screen.");
  if (!(await maySendToSelf(actor.workspaceId, actor.personId))) throw new Forbidden("Guests cannot send themselves links.");
  const claim = await claimSelfSend(actor.workspaceId, actor.personId, "email", FAILED);
  if (!claim.ok) return { state: "limited", words: screenLinkLimitWords(claim.limit, claim.resetsAt, claim.perDay) };
  const { data: ws } = await db().from("workspaces").select("name").eq("id", actor.workspaceId).maybeSingle();
  const keep = !mailEnabled(await settingsInEffect()) ? NO_WAY_HERE.mail : (await addressIn(actor.workspaceId, actor.personId)) ? null : NO_WAY_HERE.address;
  const id = await deliverScreenLink(actor.workspaceId, { recipientId: actor.personId, subject: SCREEN_LINK_SUBJECT, text: screenLinkText(String(ws?.name ?? ""), screen.name), link: path as string, keep: keep ?? undefined });
  const { state, note } = await selfSendOutcome(actor.workspaceId, actor.personId, id, keep);
  await audit(actor, { kind: "connector.screen_link_sent", details: { screen: screen.name, outcome: state } });
  return { state, words: state === "sent" ? "Sent. Look in your email." : state === "queued" ? "On its way to your email." : `Not emailed. ${note}` };
}
