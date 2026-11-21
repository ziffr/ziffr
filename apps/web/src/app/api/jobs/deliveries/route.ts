// POST /api/jobs/deliveries (spec 0004, ticket #71; spec 0007, ticket #103): sends the Deliveries that are waiting,
// by email and by Slack, for a scheduler (any cron) to call every few minutes. Only with the job secret
// (lib/jobs.ts). It answers only how many were sent, never what or to whom.
import { purgeExpiredHeldReplies } from "@ziffr/core/held-replies";
import { sendAllWaiting } from "@ziffr/core/outbound";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Sends what is waiting. */
export async function POST(req: Request) {
  if (!jobAuthorized(req)) return jobNotFound();
  // Held replies whose link ran out (ticket #513) go with each run.
  await purgeExpiredHeldReplies();
  return Response.json(await sendAllWaiting(), { headers: { "cache-control": "no-store" } });
}
