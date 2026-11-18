// POST /oauth/revoke (spec 0023, RFC 7009): an assistant ends its connection with either of its tokens. Always 200,
// so it tells nothing about a token.
import { revokeToken } from "@ziffr/core/assistant-connections";
import { oauthRoute, urlForm } from "@/lib/oauth";

/** Ends the connection the token belongs to. */
export const POST = oauthRoute(async (req) => {
  await revokeToken(await urlForm(req));
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
});
