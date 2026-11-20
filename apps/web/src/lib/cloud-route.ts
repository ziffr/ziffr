// The HTTP layer of the Ziffr Cloud API (spec 0029, ticket #267): every call is checked by the core first (the
// signature over time, method, path and body; replays; 60 a minute) before its handler runs. Without ZIFFR_CLOUD_KEY
// every endpoint answers a bare 404. No session, no cookies, no CORS headers, never cached; bodies at most 4 KB.
import { z } from "zod";
import { checkCloudCall, CLOUD_BODY_MAX, CLOUD_SIGNATURE_HEADER, cloudEnabled, CloudNotFound, type CloudCaller } from "@ziffr/core/cloud-api";
import { readLimited } from "@/lib/limited-body";

const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

/** A JSON answer with the Cloud API's headers. */
export const cloudJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

const error = (status: number, code: string, message: string) => cloudJson({ error: { code, message } }, status);

/** Wraps an endpoint: the body is read once, as text, at most 4 KB, and the call is checked before the handler sees it. */
export function cloudRoute<C>(handler: (caller: CloudCaller, body: string, req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    // Nothing is read for a call that cannot pass: without the key there is nothing here, without a signature no call.
    if (!cloudEnabled()) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    if (!/^t=\d{9,11},\s*v1=[0-9a-f]{64}$/.test((req.headers.get(CLOUD_SIGNATURE_HEADER) ?? "").trim())) return error(401, "unauthorized", "The signature is missing, wrong, too old or used before.");
    // At most 4 KB, counted in bytes as they arrive, whatever Content-Length says.
    const body = req.method === "GET" ? "" : await readLimited(req, CLOUD_BODY_MAX);
    if (body === null) return error(413, "too_large", "The body is larger than 4 KB.");
    const url = new URL(req.url);
    const check = await checkCloudCall({ header: req.headers.get(CLOUD_SIGNATURE_HEADER), method: req.method, path: url.pathname + url.search, body });
    if (!check.ok) {
      if (check.status === 404) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
      return check.status === 429 ? error(429, "rate_limited", "Too many calls; try again in a minute.") : error(401, "unauthorized", "The signature is missing, wrong, too old or used before.");
    }
    try {
      return await handler(check.caller, body, req, ctx);
    } catch (e) {
      if (e instanceof CloudNotFound) return error(404, "not_found", "No such Workspace.");
      if (e instanceof z.ZodError) return error(400, "invalid_request", e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
      console.error("Ziffr Cloud API error", e);
      return error(500, "internal", "Something went wrong.");
    }
  };
}
