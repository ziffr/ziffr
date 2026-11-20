// POST /api/auth/send-email (spec 0025, #198): Supabase Auth's Send Email Hook. Auth hands Ziffr each sign-in email
// and Ziffr sends it through the mail server in effect (@ziffr/core/auth-email). Only when signed with
// ZIFFR_AUTH_HOOK_SECRET (Standard Webhooks, within five minutes); without the secret set it answers 404 like any
// other open route, and an unsigned, stale or too large call is refused before anything is read or sent. Errors use
// the shape Auth expects, with a fixed code only.
import { AuthEmailRefused, authHookSecret, authHookSigned, sendAuthEmail } from "@ziffr/core/auth-email";

/** The largest call taken: Auth's payload is a user and a few tokens. */
const MAX_BYTES = 64 * 1024;

const refuse = (status: number, message: string) => Response.json({ error: { http_code: status, message } }, { status, headers: { "cache-control": "no-store" } });

/** Sends one sign-in email. */
export async function POST(req: Request) {
  const secret = authHookSecret();
  if (!secret) return new Response(null, { status: 404 });
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d{1,10}$/.test(declared) || Number(declared) > MAX_BYTES)) return refuse(413, "too_large");
  const body = await req.text();
  if (body.length > MAX_BYTES) return refuse(413, "too_large");
  const signed = authHookSigned(secret, { id: req.headers.get("webhook-id"), timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") }, body);
  if (!signed) return refuse(401, "not_signed");
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return refuse(400, "bad_payload");
  }
  try {
    await sendAuthEmail(payload);
  } catch (e) {
    if (e instanceof AuthEmailRefused) return refuse(e.code === "mail_off" ? 503 : e.code === "send_failed" ? 502 : 400, e.code);
    console.error("The sign-in email hook failed:", e);
    return refuse(500, "failed");
  }
  return Response.json({}, { headers: { "cache-control": "no-store" } });
}
