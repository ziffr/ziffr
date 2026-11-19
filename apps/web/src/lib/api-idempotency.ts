// Idempotent API calls (spec 0002, GLOSSARY: Access Key): reading the Idempotency-Key a creating or submitting call
// may send, and turning what `once` gives back into the answer, the same way on every endpoint that takes one.
import type { once } from "@ziffr/core/api-submissions";
import { ApiError, errorBody, json } from "@/lib/api";
import { IdempotencyKey } from "@/app/api/v1/schemas";

/** The request's Idempotency-Key, or null without one; a malformed one is refused before anything runs. */
export function idempotencyKey(req: Request): string | null {
  const idem = req.headers.get("idempotency-key");
  if (idem !== null && !IdempotencyKey.safeParse(idem).success) throw new ApiError("invalid_request", "Idempotency-Key: 1 to 200 visible ASCII characters.");
  return idem;
}

/** The answer to an idempotent call: 409 for a key reused with another body or while its first call still runs (the
 * `call` names it), else the answer with Retry-After when a limit was met, Idempotent-Replayed for a stored answer
 * given again, and the `fresh` headers only for an answer given now. */
export function idempotentAnswer(result: Awaited<ReturnType<typeof once>>, call: "creation" | "submission" | "batch", retryAfter: number | null, fresh: Record<string, string> = {}): Response {
  if ("conflict" in result) {
    return json(errorBody("conflict", result.conflict === "in_progress" ? `A ${call} with this Idempotency-Key is still running.` : "This Idempotency-Key was used with another body.").body, 409);
  }
  const headers: Record<string, string> = {};
  if (retryAfter !== null) headers["retry-after"] = String(retryAfter);
  if ("replayed" in result && result.replayed) headers["idempotent-replayed"] = "true";
  else Object.assign(headers, fresh);
  return json(result.body, result.status, headers);
}
