// POST /api/inbound/email (spec 0004, ticket #73): the mail provider forwards a reply here, as the raw message. Only
// when signed: `X-Ziffr-Timestamp` (Unix seconds, within five minutes) and `X-Ziffr-Signature: sha256=<hex>`, the
// HMAC-SHA256 of "<timestamp>.<body>" with ZIFFR_INBOUND_SECRET, compared in constant time. Without inbound mail set
// up, unsigned, stale or too large, it answers 404 or 413 and reads nothing; the core decides the rest.
import { inboundSigned, MAX_INBOUND_BYTES, parseInbound, receiveEmail } from "@ziffr/core/inbound-email";
import { inboundOn } from "@ziffr/core/mail";
import { readLimited } from "@/lib/read-limited";

const answer = (status: number, body?: unknown) => (body === undefined ? new Response(null, { status, headers: { "cache-control": "no-store" } }) : Response.json(body, { status, headers: { "cache-control": "no-store" } }));

/** Whether the body was signed with the secret, a moment ago; the core holds the secret. */
const signed = (req: Request, body: Uint8Array) => inboundSigned(req.headers.get("x-ziffr-timestamp") ?? "", req.headers.get("x-ziffr-signature") ?? "", body);

/** Takes one forwarded email. */
export async function POST(req: Request) {
  if (!(await inboundOn())) return answer(404);
  const body = await readLimited(req, MAX_INBOUND_BYTES);
  if (!body) return answer(413);
  if (!(await signed(req, body))) return answer(404);
  let email;
  try {
    email = await parseInbound(body);
  } catch {
    return answer(400, { error: "not_a_message" });
  }
  // The provider only learns the outcome's name: it is for its logs, and says nothing of the workspace.
  return answer(200, { outcome: await receiveEmail(email) });
}
