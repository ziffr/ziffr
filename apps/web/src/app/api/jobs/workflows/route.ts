// POST /api/jobs/workflows (spec 0005, ticket #85): runs each workspace's Workflows and due-task reminders once a day
// at its run hour in its own time zone, for a scheduler to call every hour. Only with the job secret (lib/jobs.ts). It
// answers only how many workspaces ran or failed.
import { runDueWorkspaces } from "@ziffr/core/scheduled-runs";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Runs the workspaces whose day is due. */
export async function POST(req: Request) {
  if (!jobAuthorized(req)) return jobNotFound();
  return Response.json(await runDueWorkspaces(), { headers: { "cache-control": "no-store" } });
}
