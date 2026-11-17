// The sending queue of every real Connector (spec 0004, spec 0007; GLOSSARY: Delivery, Connector). A Delivery is
// queued when its Connector really sends it (email once mail is set up, Slack once the workspace is connected,
// Telegram once the workspace turned it on) and
// stays in the Outbox otherwise. Each Connector sends its own; this only says which one sends which Delivery.
import { initialMailState, sendDelivery, sendWaiting } from "./mail";
import { sendSlackDelivery, sendWaitingSlack, slackSends } from "./slack-send";
import { sendTelegramDelivery, sendWaitingTelegram, telegramSends } from "./telegram-send";

/** The state a new Delivery starts in: queued when it will really be sent, else it stays in the Outbox. */
export async function initialDeliveryState(connector: string, workspaceId: string): Promise<"queued" | "outbox"> {
  if (connector === "slack") return (await slackSends(workspaceId)) ? "queued" : "outbox";
  if (connector === "telegram") return (await telegramSends(workspaceId)) ? "queued" : "outbox";
  return initialMailState(connector, workspaceId);
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

/** Sends what waits in every Connector's queue, for the job; answers only counts. */
export async function sendAllWaiting(limit = 50): Promise<{ sent: number; failed: number }> {
  const [mail, slack, telegram] = [await sendWaiting(limit), await sendWaitingSlack(limit), await sendWaitingTelegram(limit)];
  return { sent: mail.sent + slack.sent + telegram.sent, failed: mail.failed + slack.failed + telegram.failed };
}
