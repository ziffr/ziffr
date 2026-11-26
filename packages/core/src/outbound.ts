// The sending queue of every real Connector (spec 0004, spec 0007; GLOSSARY: Delivery, Connector). A Delivery is
// queued when its Connector really sends it (email once mail is set up, Slack once the workspace is connected,
// Telegram once the workspace turned it on) and
// stays in the Outbox otherwise. Each Connector sends its own; this only says which one sends which Delivery.
import { initialMailState, sendDelivery, sendWaiting } from "./mail";
import { sendSlackDelivery, sendWaitingSlack, slackSends } from "./slack-send";
import { sendTelegramDelivery, sendWaitingTelegram, telegramSends } from "./telegram-send";
import { settingsInEffect } from "./settings-in-effect";
import { heldBack } from "./practice";
import { trialHoldsBack } from "./trials";
import { sendWaitingWebhooks } from "./webhook-send";

/** The state a new Delivery starts in: queued when it will really be sent, else it stays in the Outbox. In a Trial
 * Workspace only a Delivery to a person who accepted is ever sent, never one to a Contact (ADR 0015). */
export async function initialDeliveryState(connector: string, workspaceId: string, recipientId: string): Promise<"queued" | "outbox"> {
  // Nothing leaves a Practice Workspace (spec 0063), by whichever Connector.
  if (await heldBack(workspaceId, connector === "slack" || connector === "telegram" ? connector : "email", { recipientId })) return "outbox";
  if (await trialHoldsBack(workspaceId, recipientId)) return "outbox";
  if (connector === "slack") return (await slackSends(workspaceId)) ? "queued" : "outbox";
  if (connector === "telegram") return (await telegramSends(workspaceId)) ? "queued" : "outbox";
  return initialMailState(connector, workspaceId, await settingsInEffect());
}

/** Sends a new Delivery at once if it is queued, by its Connector; a failure waits for the retry job and never fails
 * the caller. */
export async function sendQueuedNow(id: number | null | undefined, state: string, connector: string) {
  if (!id || state !== "queued") return;
  try {
    if (connector === "slack") await sendSlackDelivery(id);
    else if (connector === "telegram") await sendTelegramDelivery(id);
    else await sendDelivery(id);
  } catch {
    // The Delivery stays queued; the job tries again.
  }
}

/** Sends what waits in every Connector's queue, and the messages waiting for Webhooks (a send is not a Delivery), for the job; answers only counts. */
export async function sendAllWaiting(limit = 50): Promise<{ sent: number; failed: number }> {
  const [mail, slack, telegram, webhooks] = [await sendWaiting(limit), await sendWaitingSlack(limit), await sendWaitingTelegram(limit), await sendWaitingWebhooks(limit)];
  return { sent: mail.sent + slack.sent + telegram.sent + webhooks.sent, failed: mail.failed + slack.failed + telegram.failed + webhooks.failed };
}
