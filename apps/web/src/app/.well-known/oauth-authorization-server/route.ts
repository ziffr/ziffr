// GET /.well-known/oauth-authorization-server (spec 0023, ADR 0011, RFC 8414): Ziffr as the authorization server for
// assistants: its endpoints, and that it offers only the code flow with PKCE S256 to public clients.
import { authorizationServer, oauthJson, oauthRoute } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** The authorization server metadata. */
export const GET = oauthRoute(async () => oauthJson(authorizationServer()));
