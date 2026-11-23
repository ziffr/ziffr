// POST /api/jobs/heads-ups (spec 0041, ticket 13; GLOSSARY: Heads-up): scans each Workspace's Metrics for pairs that have started
// or stopped moving together and keeps what it finds in the pair table, at most every six hours per Workspace. Only with the job
// secret (lib/jobs.ts); anyone else gets a bare 404. It answers only counts, never a Metric, a name or a value.
import { headsUpJob } from "@ziffr/core/heads-ups";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Runs the scans that are due. */
export async function POST(req: Request) {
  if (!jobAuthorized(req)) return jobNotFound();
  return Response.json(await headsUpJob(), { headers: { "cache-control": "no-store" } });
}
