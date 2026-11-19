// Requests from Slack (spec 0007, ticket #104): the body read up to a limit, and taken only when Slack signed it with
// the signing secret in effect a moment ago (the core checks the signature). Anything else gets a bare 404 or 413.
// A signing secret alone is enough to answer: Slack checks the events address with a signed url_verification before
// the rest of the app is set up, and the core takes nothing else until Slack is set up in full.
import { MAX_SLACK_BYTES, slackSigned } from "@ziffr/core/slack-inbound";
import { slackSigningSecretNow } from "@ziffr/core/slack-api";

/** An answer with nothing cached. */
export const slackAnswer = (status: number, body?: unknown) => (body === undefined ? new Response(null, { status, headers: { "cache-control": "no-store" } }) : Response.json(body, { status, headers: { "cache-control": "no-store" } }));

/** The body as text when this Ziffr has a signing secret, it is at most 64 KB and Slack signed it with that secret;
 * else the answer to give. `signedWith` is that secret, for the core's note of Slack's check; it stays on the server. */
export async function signedSlackBody(req: Request): Promise<{ text: string; signedWith: string } | { refuse: Response }> {
  const secret = await slackSigningSecretNow();
  if (!secret) return { refuse: slackAnswer(404) };
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d{1,10}$/.test(declared) || Number(declared) > MAX_SLACK_BYTES)) return { refuse: slackAnswer(413) };
  const parts: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      // Read only up to the limit: a large or endless body is never held whole.
      if (size > MAX_SLACK_BYTES) { await reader.cancel(); return { refuse: slackAnswer(413) }; }
      parts.push(value);
    }
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { body.set(p, at); at += p.byteLength; }
  if (!slackSigned(req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"), body, secret)) return { refuse: slackAnswer(404) };
  return { text: new TextDecoder().decode(body), signedWith: secret };
}
