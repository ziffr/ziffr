// The OAuth endpoints' HTTP layer (spec 0023, ADR 0011, GLOSSARY: Access Key): metadata documents, and turning
// requests from programs on the internet into calls of the core's assistant-connections.ts. Bodies are read with a
// byte ceiling (limited-body.ts); every field is checked by the core. Answers are never cached and carry no CORS
// headers: assistants call these from their servers, not from pages.
import { OAuthError, issuer, mcpResource } from "@ziffr/core/assistant-connections";
import { SCOPES } from "@ziffr/core/actor";
import { readLimited } from "@/lib/limited-body";
import { remoteMcpEnabled } from "@/lib/remote-mcp";

/** Most an OAuth request's body may be: a registration or a token request is a few hundred bytes. */
const MAX_BODY = 16 * 1024;

const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", pragma: "no-cache", "x-content-type-options": "nosniff" };

/** A JSON answer as OAuth expects it. */
export const oauthJson = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...headers } });

/** An OAuth error answer: `{ error, error_description }`. */
export const oauthError = (e: OAuthError) => oauthJson({ error: e.error, error_description: e.message }, e.status, e.status === 429 ? { "retry-after": "3600" } : {});

/** Wraps an OAuth endpoint: 404 while the remote MCP Server is off; OAuthError becomes its answer, anything else a
 * 500 without details. */
export function oauthRoute(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (!remoteMcpEnabled()) return new Response("Not found.", { status: 404, headers: { "cache-control": "no-store" } });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof OAuthError) return oauthError(e);
      console.error("OAuth error", e);
      return oauthJson({ error: "server_error", error_description: "Something went wrong." }, 500);
    }
  };
}

/** A JSON body (registration), at most 16 KB. */
export async function jsonForm(req: Request): Promise<unknown> {
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) throw new OAuthError("invalid_client_metadata", "Send JSON with \"Content-Type: application/json\".");
  const text = await readLimited(req, MAX_BODY);
  if (text === null) throw new OAuthError("invalid_request", "The request is too large.", 413);
  try { return JSON.parse(text); } catch { throw new OAuthError("invalid_client_metadata", "The body is not valid JSON."); }
}

/** A form body (token, revocation: RFC 6749 asks for application/x-www-form-urlencoded), at most 16 KB, as one
 * string per name. A name sent twice is refused (RFC 6749, 3.1), so no parameter can be smuggled past a check. */
export async function urlForm(req: Request): Promise<Record<string, string>> {
  if (!/^application\/x-www-form-urlencoded\b/i.test(req.headers.get("content-type") ?? "")) throw new OAuthError("invalid_request", "Send the parameters as application/x-www-form-urlencoded.");
  const text = await readLimited(req, MAX_BODY);
  if (text === null) throw new OAuthError("invalid_request", "The request is too large.", 413);
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(text)) {
    if (k in out) throw new OAuthError("invalid_request", `The parameter ${k.slice(0, 40)} was sent twice.`);
    out[k] = v;
  }
  return out;
}

/** The protected resource metadata of /mcp (RFC 9728). */
export const protectedResource = () => ({
  resource: mcpResource(), authorization_servers: [issuer()], scopes_supported: SCOPES, bearer_methods_supported: ["header"], resource_name: "Ziffr",
});

/** The authorization server metadata (RFC 8414): only what Ziffr offers. */
export const authorizationServer = () => {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SCOPES,
    authorization_response_iss_parameter_supported: true,
    service_documentation: "https://github.com/ziffr/ziffr/blob/main/docs/guides/mcp.md",
  };
};
