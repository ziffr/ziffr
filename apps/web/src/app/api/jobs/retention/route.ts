// POST /api/jobs/retention (spec 0033, ticket #382; GLOSSARY: Retention): once a day, lets confirmed Retentions start and
// sends their reminders, then condenses or deletes the old values of every Metric with a Retention in force, in small
// steps. Each Metric runs once a day however many calls come. Only with the job secret (lib/jobs.ts); anyone else gets a
// bare 404. It answers only counts.
import { retentionJob } from "@ziffr/core/retention-job";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Runs the day's Retention steps. */
export async function POST(req: Request) {
  if (!jobAuthorized(req)) return jobNotFound();
  return Response.json(await retentionJob(), { headers: { "cache-control": "no-store" } });
}
