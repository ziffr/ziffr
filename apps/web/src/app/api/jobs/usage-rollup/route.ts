// POST /api/jobs/usage-rollup (spec 0031, ticket #365; GLOSSARY: Usage): writes yesterday's Usage figures of the
// Installation, fills the days it missed and forgets View Counts older than 400 days, for a scheduler to call daily. Only
// with the job secret (lib/jobs.ts); anyone else gets a bare 404. It answers only counts.
import { usageRollupJob } from "@ziffr/core/installation-usage";
import { pruneViewCounts } from "@ziffr/core/usage";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Runs the day's rollup and the retention of View Counts. */
export async function POST(req: Request) {
  if (!jobAuthorized(req)) return jobNotFound();
  const rolled = await usageRollupJob();
  const forgotten = await pruneViewCounts();
  return Response.json({ ...rolled, view_counts_forgotten: forgotten }, { headers: { "cache-control": "no-store" } });
}
