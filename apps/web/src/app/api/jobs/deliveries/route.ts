// POST /api/jobs/deliveries (spec 0004, ticket #71): sends the email Deliveries that are waiting, for a scheduler (any
// cron) to call every few minutes. Only with `Authorization: Bearer $ZIFFR_JOB_SECRET`; without the setting the job
// is off. It answers only how many were sent, never what or to whom.
import { timingSafeEqual } from "node:crypto";
import { sendWaiting } from "@ziffr/core/mail";

const NOT_FOUND = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

/** Whether the request carries the job secret; compared in constant time. */
function authorized(req: Request): boolean {
  const secret = process.env.ZIFFR_JOB_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = Buffer.from(/^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "");
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** Sends what is waiting. 404 to anyone without the secret, so the job is not even known to be there. */
export async function POST(req: Request) {
  if (!authorized(req)) return NOT_FOUND();
  const result = await sendWaiting();
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
