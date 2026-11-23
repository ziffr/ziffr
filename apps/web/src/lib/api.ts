// The API's HTTP layer (spec 0002): turns an Access Key into a KeyActor, checks the endpoint's scope, and answers in
// one JSON shape. Endpoints hold no permission code; the core decides what the key's creator sees. Everything a
// program sends is untrusted (AGENTS.md rule 4): query and body go through the endpoint's zod schema first.
import { z } from "zod";
import { actorForSecret } from "@ziffr/core/access-keys";
import { actorForAssistantToken } from "@ziffr/core/assistant-connections";
import { calledFromMcp } from "@/lib/mcp-context";
import { LimitReached } from "@ziffr/core/workspace-limits";
import { TrialRefused } from "@ziffr/core/trials";
import { admitCall, recordCall } from "@ziffr/core/access-log";
import { callKind, countCall } from "@ziffr/core/usage-calls";
import { Forbidden, scopeRefusal, type FeedActor, type KeyActor, type Scope } from "@ziffr/core/actor";

/** The stable error codes a program can handle. */
export type ApiErrorCode = "invalid_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "unprocessable" | "locked" | "period_condensed" | "rate_limited" | "workspace_limit" | "internal";

const STATUS: Record<ApiErrorCode, number> = { invalid_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, unprocessable: 422, locked: 422, period_condensed: 409, rate_limited: 429, workspace_limit: 403, internal: 500 };

/** An error answer's body, for answers that are stored before they are sent (idempotency). */
export const errorBody = (code: ApiErrorCode, message: string) => ({ status: STATUS[code], body: { error: { code, message } } });

// Answers are per key and may hold a team's numbers: never cached anywhere, never readable by another site (no CORS
// headers are ever sent).
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

/** A JSON answer with the API's headers. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...headers } });
}

/** The answer when the Workspace Limit refuses a new Metric or bringing one back (spec 0029): 403 with the code
 * `workspace_limit`, the same words as the app, and the count and limit, so a program can say what to archive. */
export const limitErrorBody = (e: LimitReached) => ({
  status: STATUS.workspace_limit,
  body: { error: { code: "workspace_limit" as const, message: e.message, count: e.count, limit: e.limit.metrics } },
});

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
    if (scope && !actor.key.scopes.includes(scope)) return apiError("forbidden", scopeRefusal(scope));
    return run(actor, req, ctx, handler);
  });
}

/** Wraps an endpoint that changes who sees what (ticket #434: Shares, Groups, people, invitations). Like keyRoute, and
 * more careful: it never runs for an assistant's token, even one that somehow held the scope (text in a Thread must not
 * talk an assistant into widening visibility), and the core's refusals are answered in their words: a role that may not
 * do it is 403, a plain refusal 422, and what the key's creator cannot see stays 404. */
export function sensitiveRoute<C>(scope: Scope, handler: (actor: KeyActor, req: Request, ctx: C) => Promise<Response>) {
  return keyRoute<C>(scope, async (actor, req, ctx) => {
    if (calledFromMcp()) return apiError("forbidden", "This is for a program's own Access Key, not for an assistant.");
    try {
      return await handler(actor, req, ctx);
    } catch (e) {
      if (e instanceof Forbidden) return e.message === "Forbidden" || e.message === "That was not found." ? apiError("not_found", "Not found.") : apiError("forbidden", e.message);
      // Exactly Error: the core's own words for what a person can act on, never a provider's or a programming error.
      if (e instanceof TrialRefused || (e instanceof Error && Object.getPrototypeOf(e) === Error.prototype && e.message)) return apiError("unprocessable", (e as Error).message);
      throw e;
    }
  });
}

/** Wraps a Feed endpoint (spec 0012): it runs only for a Feed Key, within its Feed's limit (all its keys together),
 * and is logged like every call. A person's key gets 403: a Feed's endpoints are not theirs. */
export function feedRoute<C>(handler: (feed: FeedActor, req: Request, ctx: C) => Promise<Response>) {
  return guarded<C>(async (actor, req, ctx) => {
    if (!("feed" in actor)) return apiError("forbidden", "Only a Feed Key may use /api/v1/feed. Make one for a Feed under Settings → Feeds.");
    return run(actor, req, ctx, handler);
  });
}

/** The part every endpoint shares: a valid key, the limit, and the Access Log entry. */
function guarded<C>(inner: (actor: KeyActor | FeedActor, req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const secret = bearer(req);
    // An assistant's access token counts only on the calls the remote MCP Server makes in this process (spec 0023).
    const actor = !secret ? null : secret.startsWith("zat_") ? (calledFromMcp() ? await actorForAssistantToken(secret) : null) : await actorForSecret(secret);
    if (!actor) return apiError("unauthorized", "Send a valid Access Key as \"Authorization: Bearer <key>\".", { "www-authenticate": "Bearer" });
    // Usage (spec 0031): one more call in the Installation's figures; a number per Workspace and day, nothing else kept.
    countCall(actor.workspaceId, callKind("feed" in actor, calledFromMcp()));
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
    if (e instanceof LimitReached) { const { status, body } = limitErrorBody(e); return json(body, status); }
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
