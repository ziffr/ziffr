// What the dashboard and story endpoints share (spec 0014): the daily limits, idempotent creation, the error words, and
// links that open the result in Ziffr. The core decides who may do what; this only turns its answers into HTTP.
import { Forbidden, type KeyActor } from "@ziffr/core/actor";
import { admitBuild, CHANGES_PER_DAY, DASHBOARDS_PER_DAY, Unusable, type ApiDashboard, type ApiDashboardSummary } from "@ziffr/core/api-dashboards";
import { once, type StoredAnswer } from "@ziffr/core/api-submissions";
import { ApiError, errorBody, json } from "@/lib/api";
import { IdempotencyKey } from "@/app/api/v1/schemas";

/** A dashboard or story with its link made absolute for this server, instead of its path. */
export function withUrl<T extends ApiDashboardSummary | ApiDashboard>(req: Request, d: T): Omit<T, "path"> & { url: string } {
  const { path, ...rest } = d;
  return { ...rest, url: new URL(path, req.url).toString() };
}

/** Turns what the core refuses into an answer: a reason about the request is 422, a reason about the key's creator
 * is 403, and a refusal without a reason stays "not found" (keyRoute), so nothing hidden is revealed. */
function refusal(e: unknown): StoredAnswer | null {
  if (e instanceof Unusable) return errorBody("unprocessable", e.message);
  if (e instanceof Forbidden && e.message !== "Forbidden") return errorBody("forbidden", e.message);
  return null;
}

/** Runs a build call within the key's daily limit. Creating calls take an optional Idempotency-Key; the hashed body
 * names the endpoint, so the same key text reused elsewhere is a conflict, never a replay of another answer. */
export async function build(actor: KeyActor, req: Request, what: "create" | "change", endpoint: string, input: unknown, run: () => Promise<{ status: number; body: unknown }>): Promise<Response> {
  const idem = what === "create" ? req.headers.get("idempotency-key") : null;
  if (idem !== null && !IdempotencyKey.safeParse(idem).success) throw new ApiError("invalid_request", "Idempotency-Key: 1 to 200 visible ASCII characters.");
  let retryAfter: number | null = null;
  const answer = async (): Promise<StoredAnswer> => {
    const admitted = await admitBuild(actor, what);
    if (!admitted.ok) {
      retryAfter = admitted.retryAfter;
      const max = what === "create" ? `${DASHBOARDS_PER_DAY} dashboards and stories` : `${CHANGES_PER_DAY} changes`;
      return { ...errorBody("rate_limited", `This key made ${max} in the last 24 hours; try again in ${admitted.retryAfter} seconds.`), keep: false };
    }
    try {
      return await run();
    } catch (e) {
      const r = refusal(e);
      if (r) return { ...r, keep: false };
      throw e;
    }
  };
  const result = idem === null ? await answer() : await once(actor, idem, { endpoint, ...(input as object) }, answer);
  if ("conflict" in result) {
    return json(errorBody("conflict", result.conflict === "in_progress" ? "A creation with this Idempotency-Key is still running." : "This Idempotency-Key was used with another body.").body, 409);
  }
  const headers: Record<string, string> = {};
  if (retryAfter !== null) headers["retry-after"] = String(retryAfter);
  if ("replayed" in result && result.replayed) headers["idempotent-replayed"] = "true";
  return json(result.body, result.status, headers);
}
