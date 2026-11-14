// POST /api/slack/events (spec 0007, ticket #104): Slack's Events API calls this with replies in direct messages
// (message.im) and with app_uninstalled and tokens_revoked. Only signed by Slack (lib/slack-request.ts); the
// url_verification challenge is answered only then. Each event is claimed by its event_id in the core, so Slack's
// retries change nothing; the work is a few queries and at most one call to Slack, well inside Slack's three seconds.
import { receiveSlackEvent } from "@ziffr/core/slack-inbound";
import { signedSlackBody, slackAnswer } from "@/lib/slack-request";

/** Takes one event. */
export async function POST(req: Request) {
  const body = await signedSlackBody(req);
  if ("refuse" in body) return body.refuse;
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return slackAnswer(400, { error: "not_json" });
  }
  const r = await receiveSlackEvent(json);
  if (r.challenge) return new Response(r.challenge, { status: 200, headers: { "content-type": "text/plain", "cache-control": "no-store" } });
  // Slack only learns the outcome's name: it says nothing of the workspace.
  return slackAnswer(200, { outcome: r.outcome });
}
