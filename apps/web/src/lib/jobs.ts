// The jobs a scheduler calls (spec 0004, spec 0005): only with `Authorization: Bearer $ZIFFR_JOB_SECRET`, at least 32
// characters, compared in constant time. Without the setting every job is off. Anyone else gets a bare 404, so a job
// is not even known to be there.
import { timingSafeEqual } from "node:crypto";

/** Whether the request carries the job secret. */
export function jobAuthorized(req: Request): boolean {
  const secret = process.env.ZIFFR_JOB_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = Buffer.from(/^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "");
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** The answer to anyone without the secret. */
export const jobNotFound = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
