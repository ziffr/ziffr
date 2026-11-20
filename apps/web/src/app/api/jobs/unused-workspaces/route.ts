// POST /api/jobs/unused-workspaces (spec 0029, ticket #269): warns the Owners of Workspaces on the default limit that
// nobody used for ZIFFR_DELETE_UNUSED_AFTER_DAYS, and deletes those still unused 14 days after their warning, for a
// scheduler to call daily. Only with the job secret (lib/jobs.ts); anyone else gets a bare 404. Where the rule is off
// it does nothing. It answers only counts.
import { unusedWorkspacesJob } from "@ziffr/core/unused-workspaces";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Runs the day's warnings and deletions. */
export async function POST(req: Request) {
  if (!jobAuthorized(req)) return jobNotFound();
  return Response.json(await unusedWorkspacesJob(), { headers: { "cache-control": "no-store" } });
}
