// What the View Link routes share (ticket #435): a refusal in Ziffr's words becomes 422, 403 or 429 and nothing else
// leaks; whose dashboard or link it is stays "not found" (keyRoute).
import { Forbidden } from "@ziffr/core/actor";
import { Unusable } from "@ziffr/core/api-dashboards";
import { ViewLinkLimit } from "@ziffr/core/api-view-links";
import { apiError } from "@/lib/api";

/** Runs a View Link call; a refusal about the request is 422, about the creator's role 403, the daily limit 429. */
export async function answered(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Unusable) return apiError("unprocessable", e.message);
    if (e instanceof ViewLinkLimit) return apiError("rate_limited", e.message, { "retry-after": String(e.retryAfter) });
    if (e instanceof Forbidden && e.message !== "Forbidden") return apiError("forbidden", e.message);
    throw e;
  }
}
