// POST /api/slack/interactions (spec 0007, ticket #104): Slack calls this when someone presses a button on a Ziffr
// message ("Approve", "Stop these on Slack"), as a form with one field, `payload`, holding JSON. Only signed by Slack
// (lib/slack-request.ts); the core checks that the button is on the very message a Delivery was sent as, pressed by
// its recipient. It answers 200 with no body, so Slack shows nothing more than the bot's reply in the thread.
import { receiveSlackInteraction } from "@ziffr/core/slack-inbound";
import { signedSlackBody, slackAnswer } from "@/lib/slack-request";

/** Takes one button press. */
export async function POST(req: Request) {
  const body = await signedSlackBody(req);
  if ("refuse" in body) return body.refuse;
  let payload: unknown;
  try {
    payload = JSON.parse(new URLSearchParams(body.text).get("payload") ?? "");
  } catch {
    return slackAnswer(400);
  }
  await receiveSlackInteraction(payload);
  return slackAnswer(200);
}
