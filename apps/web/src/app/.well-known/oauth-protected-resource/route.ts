// GET /.well-known/oauth-protected-resource (spec 0023, RFC 9728): what the remote MCP Server is and who signs
// assistants in for it. Public: it describes this Installation, never anyone's data. Clients that do not follow the
// 401's pointer look here.
import { oauthJson, oauthRoute, protectedResource } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** The protected resource metadata of /mcp. */
export const GET = oauthRoute(async () => oauthJson(protectedResource()));
