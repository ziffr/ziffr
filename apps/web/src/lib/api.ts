// The API's HTTP layer (spec 0002): turns an Access Key into a KeyActor, checks the endpoint's scope, and answers in
// one JSON shape. Endpoints hold no permission code; the core decides what the key's creator sees. Everything a
// program sends is untrusted (AGENTS.md rule 4): query and body go through the endpoint's zod schema first.
import { z } from "zod";
import { actorForSecret } from "@ziffr/core/access-keys";
import { admitCall, recordCall } from "@ziffr/core/access-log";
import { Forbidden, type FeedActor, type KeyActor, type Scope } from "@ziffr/core/actor";

/** The stable error codes a program can handle. */
export type ApiErrorCode = "invalid_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "unprocessable" | "locked" | "rate_limited" | "internal";

const STATUS: Record<ApiErrorCode, number> = { invalid_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, unprocessable: 422, locked: 422, rate_limited: 429, internal: 500 };

/** An error answer's body, for answers that are stored before they are sent (idempotency). */
export const errorBody = (code: ApiErrorCode, message: string) => ({ status: STATUS[code], body: { error: { code, message } } });

// Answers are per key and may hold a team's numbers: never cached anywhere, never readable by another site (no CORS
// headers are ever sent).
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

/** A JSON answer with the API's headers. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...headers } });
}

/** An error answer: `{ error: { code, message } }`. */
export function apiError(code: ApiErrorCode, message: string, headers: Record<string, string> = {}): Response {
  return json({ error: { code, message } }, STATUS[code], headers);
}

/** Thrown inside an endpoint to answer with an error of the API's shape. */
export class ApiError extends Error {
  constructor(readonly code: ApiErrorCode, message: string) { super(message); }
}

/** The key in `Authorization: Bearer <key>`, or null. */
function bearer(req: Request): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

/** Wraps an endpoint: it runs only for a valid key with the scope, within the key's limit, and every call with a key
 * lands in the Access Log. A Forbidden from the core becomes 404, so a key cannot tell a Metric it may not see from
 * one that does not exist; invalid input becomes 400; anything unexpected becomes 500 without details. A handler
 * that records values says how many in the `x-ziffr-submitted` header, which is logged and then removed. A null scope
 * is for answers any valid key may get (an unknown endpoint), so they are limited and logged too. */
export function keyRoute<C>(scope: Scope | null, handler: (actor: KeyActor, req: Request, ctx: C) => Promise<Response>) {
  return guarded<C>(async (actor, req, ctx) => {
    // A Feed Key acts for no person, so it may use none of the endpoints written for people's keys (spec 0012).
    if ("feed" in actor) return scope ? apiError("forbidden", "A Feed Key works only with /api/v1/feed.") : apiError("not_found", "Not found.");
    if (scope && !actor.key.scopes.includes(scope)) return apiError("forbidden", `This key may not ${scope.replace(":", " ")}.`);
    return run(actor, req, ctx, handler);
  });
}

/** Wraps a Feed endpoint (spec 0012): it runs only for a Feed Key, within its Feed's limit (all its keys together),
 * and is logged like every call. A person's key gets 403: a Feed's endpoints are not theirs. */
export function feedRoute<C>(handler: (feed: FeedActor, req: Request, ctx: C) => Promise<Response>) {
  return guarded<C>(async (actor, req, ctx) => {
    if (!("feed" in actor)) return apiError("forbidden", "Only a Feed Key may use /api/v1/feed. Make one for a Feed on the Team page.");
    return run(actor, req, ctx, handler);
  });
}

/** The part every endpoint shares: a valid key, the limit, and the Access Log entry. */
function guarded<C>(inner: (actor: KeyActor | FeedActor, req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const secret = bearer(req);
    const actor = secret ? await actorForSecret(secret) : null;
    if (!actor) return apiError("unauthorized", "Send a valid Access Key as \"Authorization: Bearer <key>\".", { "www-authenticate": "Bearer" });
    const admitted = await admitCall(actor);
    const res = !admitted.ok
      ? apiError("rate_limited", `Too many calls with this key; try again in ${admitted.retryAfter} seconds.`, { "retry-after": String(admitted.retryAfter) })
      : await inner(actor, req, ctx);
    const submitted = Number(res.headers.get("x-ziffr-submitted") ?? 0);
    res.headers.delete("x-ziffr-submitted");
    await recordCall(actor, { method: req.method, path: new URL(req.url).pathname, status: res.status, submitted });
    return res;
  };
}

async function run<A, C>(actor: A, req: Request, ctx: C, handler: (actor: A, req: Request, ctx: C) => Promise<Response>): Promise<Response> {
  try {
    return await handler(actor, req, ctx);
  } catch (e) {
    if (e instanceof ApiError) return apiError(e.code, e.message);
    if (e instanceof z.ZodError) return apiError("invalid_request", e.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; "));
    if (e instanceof Forbidden) return apiError("not_found", "Not found.");
    console.error("API error", e);
    return apiError("internal", "Something went wrong.");
  }
}

/** Most a request body may be; a value with a long Breakdown fits many times over. A Feed's batch may be larger. */
const MAX_BODY = 64 * 1024;

/** The JSON body of a request, at most `max` bytes (64 KB unless an endpoint says more), for a zod schema; anything
 * else is an invalid request. */
export async function jsonBody(req: Request, max = MAX_BODY): Promise<unknown> {
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) throw new ApiError("invalid_request", "Send JSON with \"Content-Type: application/json\".");
  const text = await req.text();
  if (text.length > max) throw new ApiError("invalid_request", `The body is larger than ${Math.round(max / 1024) >= 1024 ? `${max / 1024 / 1024} MB` : `${Math.round(max / 1024)} KB`}.`);
  try { return JSON.parse(text); } catch { throw new ApiError("invalid_request", "The body is not valid JSON."); }
}

/** The query string of a request as a plain object, for a zod schema. */
export function query(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams);
}

// A cursor is opaque to programs: the base64url of where the page before ended (an id, or a period for values).
/** Encodes where to continue after as a cursor. */
export const toCursor = (after: number | string | null) => (after === null ? null : Buffer.from(`v1:${after}`).toString("base64url"));
