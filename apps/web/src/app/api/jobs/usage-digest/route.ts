// POST /api/jobs/usage-digest (spec 0031, ticket #368; GLOSSARY: Usage): queues the monthly usage email to the Owners
// of Workspaces that have something unused, on days 1 to 7 of a month, once per Owner and month, for a scheduler to
// call daily. Only with the job secret (lib/jobs.ts); anyone else gets a bare 404. It answers only counts, never what
// the emails say or to whom.
import { usageDigestJob } from "@ziffr/core/usage-digest";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Queues this month's digests; the deliveries job sends them. */
export async function POST(req: Request) {
  if (!jobAuthorized(req)) return jobNotFound();
  return Response.json(await usageDigestJob(), { headers: { "cache-control": "no-store" } });
}
