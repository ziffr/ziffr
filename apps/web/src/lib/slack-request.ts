// Requests from Slack (spec 0007, ticket #104): the body read up to a limit, and taken only when Slack signed it with
// ZIFFR_SLACK_SIGNING_SECRET a moment ago (the core checks the signature). Anything else gets a bare 404 or 413.
import { MAX_SLACK_BYTES, slackSigned } from "@ziffr/core/slack-inbound";
import { slackEnabled } from "@ziffr/core/slack-api";

/** An answer with nothing cached. */
export const slackAnswer = (status: number, body?: unknown) => (body === undefined ? new Response(null, { status, headers: { "cache-control": "no-store" } }) : Response.json(body, { status, headers: { "cache-control": "no-store" } }));

/** The body as text when Slack is set up, it is at most 64 KB and Slack signed it; else the answer to give. */
export async function signedSlackBody(req: Request): Promise<{ text: string } | { refuse: Response }> {
  if (!slackEnabled()) return { refuse: slackAnswer(404) };
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
  if (!slackSigned(req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"), body)) return { refuse: slackAnswer(404) };
  return { text: new TextDecoder().decode(body) };
}
