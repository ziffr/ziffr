// POST /api/inbound/feedback-github (spec 0049, ticket #918; GLOSSARY: Feedback): GitHub's webhook for the repository the
// feedback is filed in (issue_comment, discussion_comment, issues, discussion). Central version (ziffr.net) only. The body is
// believed only when its HMAC-SHA256 under ZIFFR_FEEDBACK_GITHUB_WEBHOOK_SECRET (at least 32 characters) is in
// X-Hub-Signature-256, compared in constant time over the raw bytes. Anyone else, and any Installation without the
// central version's key or the secret, gets the same bare 404, so the address is not even known to be there; the body is
// read only up to a limit. Each delivery is claimed by its X-GitHub-Delivery id in the core, so a replay changes nothing.
// The answer says only what was done with the event; nothing of it is logged but a fixed phrase.
import { receiveGithubFeedbackEvent } from "@ziffr/core/feedback-back";
import { feedbackGithubConfig, githubClient } from "@ziffr/core/feedback-github";
import { githubSignatureValid, webhookSecretUsable } from "@ziffr/core/feedback-webhook-rules";
import { hostedByCloud } from "@ziffr/core/installation-days";
import { settingsInEffect } from "@ziffr/core/settings-in-effect";

const noStore = { "cache-control": "no-store" };
/** A comment or a status event is a few KB; GitHub's largest are 25 MB, which this never needs. */
const MAX_BYTES = 512 * 1024;
const bare = (status: number) => new Response(null, { status, headers: noStore });

// One client for the life of the process, so the bot's login is asked of GitHub once, not on every event.
let shared: ReturnType<typeof githubClient> | null = null;

async function readBody(req: Request): Promise<Uint8Array | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d{1,10}$/.test(declared) || Number(declared) > MAX_BYTES)) return null;
  const parts: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      // Read only up to the limit: a large or endless body is never held whole.
      if (size > MAX_BYTES) { await reader.cancel(); return null; }
      parts.push(value);
    }
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { body.set(p, at); at += p.byteLength; }
  return body;
}

/** Takes one GitHub event. */
export async function POST(req: Request) {
  const secret = process.env.ZIFFR_FEEDBACK_GITHUB_WEBHOOK_SECRET;
  if (!hostedByCloud(await settingsInEffect()) || !webhookSecretUsable(secret)) return bare(404);
  const body = await readBody(req);
  if (!body) return bare(413);
  if (!githubSignatureValid(body, req.headers.get("x-hub-signature-256"), secret)) return bare(401);
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return bare(400);
  }
  try {
    const config = feedbackGithubConfig();
    shared ??= githubClient(config);
    const outcome = await receiveGithubFeedbackEvent(
      { deliveryId: req.headers.get("x-github-delivery") ?? "", event: req.headers.get("x-github-event") ?? "", payload },
      { repo: `${config.owner}/${config.repo}`, bot: await shared.botLogin() },
    );
    return Response.json({ outcome }, { headers: noStore });
  } catch {
    // No detail in the log: an error here can hold the words of a comment. GitHub shows the failure and a maintainer can redeliver.
    console.error("Feedback event failed");
    return Response.json({ error: "Not handled." }, { status: 500, headers: noStore });
  }
}
