// POST /api/jobs/deliveries (spec 0004, ticket #71): sends the email Deliveries that are waiting, for a scheduler (any
// cron) to call every few minutes. Only with the job secret (lib/jobs.ts). It answers only how many were sent, never
// what or to whom.
import { sendWaiting } from "@ziffr/core/mail";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Sends what is waiting. */
export async function POST(req: Request) {
  if (!jobAuthorized(req)) return jobNotFound();
  return Response.json(await sendWaiting(), { headers: { "cache-control": "no-store" } });
}
