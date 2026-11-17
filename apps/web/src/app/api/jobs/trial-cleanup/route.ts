// POST /api/jobs/trial-cleanup (spec 0021): reminds the Owners of trials that end tomorrow, closes those that ended and
// deletes those that ended a week ago, for a scheduler to call every hour. Only with the job secret (lib/jobs.ts), and
// only where trials are offered; anyone else gets the same bare 404 as for any job. It answers only counts.
import { trialCleanup } from "@ziffr/core/trial-end";
import { trialSettings } from "@ziffr/core/trials";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Runs the day's steps for every trial. */
export async function POST(req: Request) {
  let offered = false;
  try { offered = trialSettings() !== null; } catch { offered = false; }
  if (!jobAuthorized(req) || !offered) return jobNotFound();
  return Response.json(await trialCleanup(), { headers: { "cache-control": "no-store" } });
}
