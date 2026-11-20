// POST /api/jobs/workflows (spec 0005, ticket #85): runs each workspace's Workflows and due-task reminders once a day
// at its run hour in its own time zone, for a scheduler to call every hour, and sends the Owners' emails about the
// Workspace Limit (spec 0029). Only with the job secret (lib/jobs.ts). It answers only counts.
import { runDueWorkspaces } from "@ziffr/core/scheduled-runs";
import { sendLimitNotices } from "@ziffr/core/workspace-usage";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Runs the workspaces whose day is due. */
export async function POST(req: Request) {
  if (!jobAuthorized(req)) return jobNotFound();
  const runs = await runDueWorkspaces();
  // The Owners' emails about the Workspace Limit (spec 0029) go out within the hour after the grace starts or ends.
  const limitNotices = await sendLimitNotices();
  return Response.json({ ...runs, limitNotices }, { headers: { "cache-control": "no-store" } });
}
