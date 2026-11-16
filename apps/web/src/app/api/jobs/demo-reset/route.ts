// POST /api/jobs/demo-reset (ADR 0005, GLOSSARY: Demo Mode): resets the demo for a scheduler, so a public demo starts
// every day clean whatever visitors typed into it the day before. Only with the job secret (lib/jobs.ts), and only
// where the demo is offered; anyone else gets the same bare 404 as for any job. It answers only whether it reset.
import { resetDemoWorkspace } from "@ziffr/core/demo-reset";
import { demoEnabled } from "@/lib/demo-mode";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Resets the demo workspace; `reset` is false when a visitor reset it less than a minute ago. */
export async function POST(req: Request) {
  if (!jobAuthorized(req) || !demoEnabled()) return jobNotFound();
  return Response.json({ reset: await resetDemoWorkspace() }, { headers: { "cache-control": "no-store" } });
}
