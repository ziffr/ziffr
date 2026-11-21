// POST /api/jobs/workspace-keys (spec 0028, ticket #247; GLOSSARY: Workspace Key): gives every Workspace a key and seals
// the rows still in clear, a little at a time, for a scheduler to call every few minutes. Only with the job secret
// (lib/jobs.ts); anyone else gets a bare 404. It answers only counts, and `waiting: true` while the Installation has no
// ZIFFR_SECRETS_KEY.
import { reencryptionJob } from "@ziffr/core/workspace-key-job";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

// A run stops by itself after 45 seconds and the next call goes on where it left off.
export const maxDuration = 60;

/** Runs one turn of the re-encryption job. */
export async function POST(req: Request) {
  if (!jobAuthorized(req)) return jobNotFound();
  return Response.json(await reencryptionJob({ seconds: 45 }), { headers: { "cache-control": "no-store" } });
}
