// GET /.well-known/oauth-protected-resource/mcp (spec 0023, RFC 9728, 3.1): the same metadata at the address for
// the resource /mcp, which the 401 from /mcp points to.
import { oauthJson, oauthRoute, protectedResource } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** The protected resource metadata of /mcp. */
export const GET = oauthRoute(async () => oauthJson(protectedResource()));
