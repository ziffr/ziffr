// POST /api/jobs/demo-reset (ADR 0005, GLOSSARY: Demo Mode): seeds the demo again for a scheduler. Visitors cannot
// change the demo (#271), but its made-up history is dated from the day it was seeded, so a public demo seeds it each
// night to keep its current period current. Only with the job secret (lib/jobs.ts), and only where the demo is
// offered; anyone else gets the same bare 404 as for any job. It answers only whether it reset.
import { resetDemoWorkspace } from "@ziffr/core/demo-reset";
import { demoChangesInEffect } from "@ziffr/core/demo-reset-decision";
import { demoEnabled } from "@/lib/demo-mode";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Seeds the demo workspace again; `reset` is false when it was seeded less than a minute ago or, where visitors may change the demo (spec 0051), when it is clean and young. */
export async function POST(req: Request) {
  if (!jobAuthorized(req) || !(await demoEnabled())) return jobNotFound();
  return Response.json({ reset: await resetDemoWorkspace({ onlyWhenNeeded: demoChangesInEffect(process.env) }) }, { headers: { "cache-control": "no-store" } });
}
