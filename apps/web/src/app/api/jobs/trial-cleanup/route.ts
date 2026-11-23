// POST /api/jobs/trial-cleanup (spec 0021): reminds the Owners of trials that end tomorrow, closes those that ended and
// deletes those that ended a week ago, for a scheduler to call every hour. Only with the job secret (lib/jobs.ts), and
// only where trials are offered or still exist (so trials made before the setting was removed are still deleted on
// time); anyone else gets the same bare 404 as for any job. It answers only counts.
import { trialCleanup, trialsExist } from "@ziffr/core/trial-end";
import { trialSettingsInEffect } from "@ziffr/core/trials";
import { syncTrialLimits } from "@ziffr/core/trial-limits-in-effect";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Runs the day's steps for every trial. */
export async function POST(req: Request) {
  let offered = false;
  try { offered = (await trialSettingsInEffect()) !== null; } catch { offered = false; }
  if (!jobAuthorized(req) || (!offered && !(await trialsExist()))) return jobNotFound();
  // Brings the row the database triggers read in line with a changed environment (saves keep it right themselves).
  await syncTrialLimits().catch((e) => console.error("Trial Limits: the row could not be refreshed", e));
  return Response.json(await trialCleanup(), { headers: { "cache-control": "no-store" } });
}
