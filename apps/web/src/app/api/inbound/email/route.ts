// POST /api/inbound/email (spec 0004, ticket #73): the mail provider forwards a reply here, as the raw message. Only
// when signed: `X-Ziffr-Timestamp` (Unix seconds, within five minutes) and `X-Ziffr-Signature: sha256=<hex>`, the
// HMAC-SHA256 of "<timestamp>.<body>" with ZIFFR_INBOUND_SECRET, compared in constant time. Without inbound mail set
// up, unsigned, stale or too large, it answers 404 or 413 and reads nothing; the core decides the rest.
import { createHmac, timingSafeEqual } from "node:crypto";
import { MAX_INBOUND_BYTES, parseInbound, receiveEmail } from "@ziffr/core/inbound-email";
import { inboundEnabled } from "@ziffr/core/mail";

const answer = (status: number, body?: unknown) => (body === undefined ? new Response(null, { status, headers: { "cache-control": "no-store" } }) : Response.json(body, { status, headers: { "cache-control": "no-store" } }));

/** Whether the body was signed with the secret, a moment ago. */
function signed(req: Request, body: Uint8Array): boolean {
  const ts = req.headers.get("x-ziffr-timestamp") ?? "";
  const sig = /^sha256=([0-9a-f]{64})$/i.exec(req.headers.get("x-ziffr-signature") ?? "")?.[1];
  if (!/^\d{9,11}$/.test(ts) || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const mac = createHmac("sha256", process.env.ZIFFR_INBOUND_SECRET!).update(`${ts}.`).update(body).digest();
  const given = Buffer.from(sig, "hex");
  return given.length === mac.length && timingSafeEqual(given, mac);
}

/** The body, read until it passes the limit (then null), so a large or endless body is never held whole. */
async function readLimited(req: Request): Promise<Uint8Array | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d{1,10}$/.test(declared) || Number(declared) > MAX_INBOUND_BYTES)) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_INBOUND_BYTES) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { body.set(p, at); at += p.byteLength; }
  return body;
}

/** Takes one forwarded email. */
export async function POST(req: Request) {
  if (!inboundEnabled()) return answer(404);
  const body = await readLimited(req);
  if (!body) return answer(413);
  if (!signed(req, body)) return answer(404);
  let email;
  try {
    email = await parseInbound(body);
  } catch {
    return answer(400, { error: "not_a_message" });
  }
  // The provider only learns the outcome's name: it is for its logs, and says nothing of the workspace.
  return answer(200, { outcome: await receiveEmail(email) });
}
