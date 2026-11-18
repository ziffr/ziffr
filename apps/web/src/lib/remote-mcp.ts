// The remote MCP Server (spec 0023, GLOSSARY: MCP Server, Access Key): the server `@ziffr/mcp` builds, served at
// /mcp over MCP's Streamable HTTP transport, stateless, for assistants that reach Ziffr through the internet. Each
// request builds the server anew with an SDK client that holds the request's own credential and calls the API in
// this process (api-in-process.ts), so a tool reaches exactly what an Access Key with those scopes reaches, through
// the same checks, limit and Access Log. Nothing here reads the database.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { actorForKey } from "@ziffr/core/access-keys";
import { createServer } from "@ziffr/mcp";
import { Ziffr } from "@ziffr/sdk";
import { inProcessFetch } from "@/lib/api-in-process";
import { SITE_URL } from "@/lib/sign-in";

/** Whether this Installation serves /mcp: `ZIFFR_REMOTE_MCP=1` or `0` decides; unset, it is on where Ziffr is
 * reached over https (ZIFFR_SITE_URL), since assistants and OAuth need that. Never in a demo-only Ziffr: the demo
 * has no Access Keys, so nothing could connect. */
export function remoteMcpEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.ZIFFR_DEMO_ONLY === "1") return false;
  if (env.ZIFFR_REMOTE_MCP === "1") return true;
  if (env.ZIFFR_REMOTE_MCP === "0") return false;
  return /^https:\/\//i.test(env.ZIFFR_SITE_URL ?? "");
}

/** The address assistants connect to: this Installation's /mcp. */
export const mcpUrl = () => `${SITE_URL}/mcp`;

/** Most a request to /mcp may carry: one JSON-RPC message, or a few, with room for a long Breakdown. */
const MAX_BODY = 256 * 1024;

const HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

function plain(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: { code: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "invalid_request", message } }), { status, headers: { ...HEADERS, "content-type": "application/json; charset=utf-8", ...headers } });
}

/** The credential in `Authorization: Bearer <token>`, or null. Never from the query string. */
function bearer(req: Request): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

/** Whether the request's Origin, if it sent one, is Ziffr's own. Browsers send Origin; Claude.ai's servers and the
 * inspector's proxy do not. A page on another site holds no token anyway, and no CORS header is ever sent, so this
 * is the transport's guard against DNS rebinding and a second wall, not the only one. */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const own = new Set([new URL(req.url).origin]);
  try { own.add(new URL(SITE_URL).origin); } catch { /* a malformed setting adds nothing */ }
  return own.has(origin);
}

/** The challenge a 401 carries, so a client knows to sign in. */
export function challenge(): Record<string, string> {
  return { "www-authenticate": `Bearer realm="ziffr"` };
}

/** Answers one request to /mcp. */
export async function handleMcp(req: Request): Promise<Response> {
  if (!remoteMcpEnabled()) return new Response("Not found.", { status: 404, headers: HEADERS });
  if (!originAllowed(req)) return plain(403, "Not from this site.");
  const secret = bearer(req);
  // The same check the API makes on every call; the API makes it again for each tool's call.
  if (!secret || !(await actorForKey(secret))) return plain(401, "Sign in to Ziffr: connect this assistant, or send an Access Key as \"Authorization: Bearer <key>\".", challenge());
  // Stateless: no stream to keep open between requests, and no session to end.
  if (req.method !== "POST") return plain(405, "Send MCP messages with POST.", { allow: "POST" });
  const text = await req.text();
  if (text.length > MAX_BODY) return plain(413, "The request is too large.");
  let body: unknown;
  try { body = JSON.parse(text); } catch { return plain(400, "The body is not valid JSON."); }

  const ziffr = new Ziffr({ url: SITE_URL, accessKey: secret, fetch: inProcessFetch, maxRetries: 0 });
  const server = createServer(ziffr);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const res = await transport.handleRequest(req, { parsedBody: body });
    for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
    return res;
  } finally {
    await server.close();
  }
}
