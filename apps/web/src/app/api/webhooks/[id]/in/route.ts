// POST /api/webhooks/{id}/in (GLOSSARY: Webhook; spec 0034, ticket #402): a Webhook's recipe reports status back, signed
// with the Webhook's own secret (the scheme the messages it gets are signed with: `X-Ziffr-Timestamp`,
// `X-Ziffr-Signature: sha256=<hex>`; a request is taken once, by its timestamp and body, so a retry is signed again with a new timestamp). Anything unknown,
// unsigned, old, replayed or off answers 404 alike, with no hint whether the id exists; the body is read to 16 KB
// and no further, and the core decides the rest. A cheap in-memory gate on failed requests, per address and per id, comes first (ticket #487). Answers only `{ changed, status }`.
import { applyWebhookAction, authenticateWebhookRequest, WebhookRequestError } from "@ziffr/core/webhook-inbound";
import { WEBHOOK_INBOUND_MAX_BYTES } from "@ziffr/core/webhook-limits";
import { networkAddress } from "@ziffr/core/sign-in-limits";
import { admitWebhookInbound, recordWebhookInboundFailure, recordWebhookInboundSender } from "@ziffr/core/webhook-inbound-gate";
import { readLimited } from "@/lib/limited-body";

const answer = (status: number, body?: unknown, extra: Record<string, string> = {}) =>
  Response.json(body ?? { error: status === 404 ? "not_found" : "error" }, { status, headers: { "cache-control": "no-store", ...extra } });

/** Takes one report from a Webhook's recipe. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Before the body is read and before the Webhook is looked up or its secret opened: ids are not secret, so a flood of
  // unsigned requests must stay cheap. Per id and per network address (ZIFFR_PROXY_HOPS); the answer is a plain 429 that
  // is the same for any id, known or not.
  const network = networkAddress(req.headers);
  if (!admitWebhookInbound(id, network)) return answer(429, { error: "too_many_requests" }, { "retry-after": "60" });
  // The text the signature was taken over, read to 16 KB and no further.
  const body = await readLimited(req, WEBHOOK_INBOUND_MAX_BYTES);
  if (body === null) return answer(413, { error: "too_large" });
  const who = await authenticateWebhookRequest(id, { timestamp: req.headers.get("x-ziffr-timestamp"), signature: req.headers.get("x-ziffr-signature"), body });
  // Failures count against the address and, when the Webhook exists, the Webhook; only a taken request (a valid signature that is no replay) makes the address a known sender.
  if (!who.ok && who.why !== "limit") recordWebhookInboundFailure(id, network, who.why === "not_found");
  else if (who.ok) recordWebhookInboundSender(id, network);
  if (!who.ok) return who.why === "limit" ? answer(429, { error: "too_many_requests" }, { "retry-after": "60" }) : answer(404);
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return answer(400, { error: "invalid", message: "The body must be JSON." });
  }
  try {
    return answer(200, await applyWebhookAction(who.actor, input));
  } catch (e) {
    if (e instanceof WebhookRequestError) return answer(e.code === "invalid" ? 400 : e.code === "not_found" ? 404 : 409, { error: e.code, message: e.message });
    console.error("Webhook status back failed:", (e as Error).message);
    return answer(500, { error: "error" });
  }
}
